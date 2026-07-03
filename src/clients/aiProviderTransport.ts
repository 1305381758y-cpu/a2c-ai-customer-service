import type { AppConfig } from "../config.js";
import type { AiTextOptions, AiTextPart } from "./aiProviderTypes.js";

const AI_TIMEOUT_MS = 15_000;
const MINIMAX_QUEUE_GAP_MS = Number(process.env.MINIMAX_QUEUE_GAP_MS || 250);
const MINIMAX_QUEUE_CONCURRENCY = Math.max(1, Number(process.env.MINIMAX_QUEUE_CONCURRENCY || 4));
const MINIMAX_RATE_LIMIT_RETRY_MS = Number(process.env.MINIMAX_RATE_LIMIT_RETRY_MS || 2200);
let activeMiniMaxRequests = 0;
let nextMiniMaxRequestAt = 0;
const miniMaxQueue: Array<() => void> = [];

export function minimaxApiKey(config: Pick<AppConfig, "MINIMAX_API_KEY">): string {
  const value = config.MINIMAX_API_KEY || "";
  return value === "CHANGE_ME" ? "" : value;
}

export function minimaxModel(config: Pick<AppConfig, "MINIMAX_MODEL">): string {
  return config.MINIMAX_MODEL || "MiniMax-M3";
}

export function deepseekApiKey(config: Pick<AppConfig, "DEEPSEEK_API_KEY">): string {
  const value = config.DEEPSEEK_API_KEY || "";
  return value === "CHANGE_ME" ? "" : value;
}

export function deepseekModel(config: Pick<AppConfig, "DEEPSEEK_MODEL">): string {
  return config.DEEPSEEK_MODEL || "deepseek-chat";
}

export async function generateDeepSeekText(config: AppConfig, contents: string | AiTextPart[], options: AiTextOptions): Promise<string> {
  const apiKey = deepseekApiKey(config);
  if (!apiKey) throw new Error("DeepSeek Key 未配置");
  if (hasImagePart(contents)) throw new Error("DeepSeek 暂不支持图片输入，请切换 MiniMax/Gemini 处理图片");
  const response = await fetch(`${normalizeDeepSeekBaseUrl(config)}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: deepseekModel(config),
      messages: [
        ...(options.systemInstruction ? [{ role: "system", content: options.systemInstruction }] : []),
        { role: "user", content: toPlainTextContent(contents) }
      ],
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxOutputTokens ?? 1200
    }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS)
  });
  const payload = await response.json().catch(async () => ({ error: { message: await response.text().catch(() => response.statusText) } })) as Record<string, unknown>;
  const providerError = extractProviderError(payload);
  if (!response.ok || providerError) throw aiProviderResponseError(
    `DeepSeek 调用失败：${providerError || response.statusText}`,
    response.status,
    summarizeChatCompletionPayload(payload)
  );
  const text = extractTextFromChatCompletion(payload).trim();
  if (!text) throw aiProviderResponseError(
    "DeepSeek 返回内容为空",
    response.status,
    summarizeChatCompletionPayload(payload)
  );
  return text;
}

export async function generateMiniMaxText(config: AppConfig, contents: string | AiTextPart[], options: AiTextOptions): Promise<string> {
  const apiKey = minimaxApiKey(config);
  if (!apiKey) throw new Error("MiniMax Key 未配置");
  if (isMiniMaxTokenPlanKey(apiKey)) return generateMiniMaxAnthropicText(config, contents, options, apiKey);
  const endpoint = hasImagePart(contents) ? "/v1/chat/completions" : "/v1/text/chatcompletion_v2";
  const request = () => fetch(`${normalizeMiniMaxBaseUrl(config, apiKey)}${endpoint}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildMiniMaxRequestBody(config, contents, options, endpoint)),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS)
    });
  const response = await enqueueMiniMaxRequest(request);
  const payload = await response.json().catch(async () => ({ error: { message: await response.text().catch(() => response.statusText) } })) as Record<string, unknown>;
  const providerError = extractProviderError(payload);
  if (isMiniMaxRateLimited(response, providerError)) {
    await sleep(MINIMAX_RATE_LIMIT_RETRY_MS);
    const retryResponse = await enqueueMiniMaxRequest(request);
    const retryPayload = await retryResponse.json().catch(async () => ({ error: { message: await retryResponse.text().catch(() => retryResponse.statusText) } })) as Record<string, unknown>;
    const retryProviderError = extractProviderError(retryPayload);
    if (!retryResponse.ok || retryProviderError) throw new Error(`MiniMax 调用失败：${retryProviderError || retryResponse.statusText}`);
    const retryText = extractTextFromChatCompletion(retryPayload).trim();
    if (!retryText) throw new Error("MiniMax 返回内容为空");
    return retryText;
  }
  if (!response.ok || providerError) {
    throw new Error(`MiniMax 调用失败：${providerError || response.statusText}`);
  }
  const text = extractTextFromChatCompletion(payload).trim();
  if (!text) throw new Error("MiniMax 返回内容为空");
  return text;
}

async function generateMiniMaxAnthropicText(
  config: AppConfig,
  contents: string | AiTextPart[],
  options: AiTextOptions,
  apiKey: string
): Promise<string> {
  const body = buildMiniMaxAnthropicRequestBody(config, contents, options);
  const request = () => fetch(`${normalizeMiniMaxBaseUrl(config, apiKey)}/anthropic/v1/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS)
    });
  const response = await enqueueMiniMaxRequest(request);
  const payload = await response.json().catch(async () => ({ error: { message: await response.text().catch(() => response.statusText) } })) as Record<string, unknown>;
  const providerError = extractProviderError(payload);
  if (isMiniMaxRateLimited(response, providerError)) {
    await sleep(MINIMAX_RATE_LIMIT_RETRY_MS);
    const retryResponse = await enqueueMiniMaxRequest(request);
    const retryPayload = await retryResponse.json().catch(async () => ({ error: { message: await retryResponse.text().catch(() => retryResponse.statusText) } })) as Record<string, unknown>;
    const retryProviderError = extractProviderError(retryPayload);
    if (!retryResponse.ok || retryProviderError) throw new Error(`MiniMax 调用失败：${retryProviderError || retryResponse.statusText}`);
    const retryText = extractTextFromAnthropicMessage(retryPayload).trim();
    if (!retryText) throw new Error("MiniMax 返回内容为空");
    return retryText;
  }
  if (!response.ok || providerError) {
    throw new Error(`MiniMax 调用失败：${providerError || response.statusText}`);
  }
  const text = extractTextFromAnthropicMessage(payload).trim();
  if (!text) throw new Error("MiniMax 返回内容为空");
  return text;
}

function enqueueMiniMaxRequest<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    miniMaxQueue.push(() => {
      activeMiniMaxRequests += 1;
      runMiniMaxTask(task).then(resolve, reject).finally(() => {
        activeMiniMaxRequests -= 1;
        drainMiniMaxQueue();
      });
    });
    drainMiniMaxQueue();
  });
}

function drainMiniMaxQueue(): void {
  while (activeMiniMaxRequests < MINIMAX_QUEUE_CONCURRENCY && miniMaxQueue.length) {
    miniMaxQueue.shift()?.();
  }
}

async function runMiniMaxTask<T>(task: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const scheduledAt = Math.max(now, nextMiniMaxRequestAt);
  nextMiniMaxRequestAt = scheduledAt + MINIMAX_QUEUE_GAP_MS;
  const waitMs = scheduledAt - now;
  if (waitMs > 0) await sleep(waitMs);
  return task();
}

function isMiniMaxRateLimited(response: Response, providerError: string): boolean {
  return response.status === 429 || /(rate limit|too many|频率|限流|稍后|繁忙|quota|qps|rpm)/i.test(providerError);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildMiniMaxRequestBody(
  config: AppConfig,
  contents: string | AiTextPart[],
  options: AiTextOptions,
  endpoint: "/v1/text/chatcompletion_v2" | "/v1/chat/completions"
): Record<string, unknown> {
  const messages = [
    ...(options.systemInstruction ? [{ role: "system", content: options.systemInstruction, name: "system" }] : []),
    { role: "user", content: toMiniMaxContent(contents), name: "user" }
  ];
  const body: Record<string, unknown> = {
    model: minimaxModel(config),
    messages,
    temperature: options.temperature ?? 0.2
  };
  if (endpoint === "/v1/chat/completions") {
    body.max_completion_tokens = options.maxOutputTokens ?? 1200;
  } else {
    body.tokens_to_generate = options.maxOutputTokens ?? 1200;
  }
  return body;
}

function buildMiniMaxAnthropicRequestBody(
  config: AppConfig,
  contents: string | AiTextPart[],
  options: AiTextOptions
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: minimaxModel(config),
    max_tokens: options.maxOutputTokens ?? 1200,
    temperature: options.temperature ?? 0.2,
    messages: [
      { role: "user", content: toMiniMaxAnthropicContent(contents) }
    ]
  };
  if (options.systemInstruction) body.system = options.systemInstruction;
  return body;
}

function hasImagePart(contents: string | AiTextPart[]): boolean {
  return Array.isArray(contents) && contents.some((part) => Boolean(part.inlineData));
}

function isMiniMaxTokenPlanKey(apiKey: string): boolean {
  return /^sk-cp-/i.test(apiKey.trim());
}

function toMiniMaxContent(contents: string | AiTextPart[]): unknown {
  if (typeof contents === "string") return contents;
  const parts: unknown[] = [];
  for (const part of contents) {
    if (part.text) parts.push({ type: "text", text: part.text });
    if (part.inlineData) {
      const url = /^https?:\/\//i.test(part.inlineData.data)
        ? part.inlineData.data
        : `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      parts.push({ type: "image_url", image_url: { url } });
    }
  }
  return parts.length ? parts : "";
}

function toPlainTextContent(contents: string | AiTextPart[]): string {
  if (typeof contents === "string") return contents;
  return contents.map((part) => part.text || "").join("\n").trim();
}

function toMiniMaxAnthropicContent(contents: string | AiTextPart[]): unknown {
  if (typeof contents === "string") return contents;
  const parts: unknown[] = [];
  for (const part of contents) {
    if (part.text) parts.push({ type: "text", text: part.text });
    if (part.inlineData) {
      if (/^https?:\/\//i.test(part.inlineData.data)) {
        parts.push({ type: "image", source: { type: "url", url: part.inlineData.data } });
      } else {
        parts.push({ type: "image", source: { type: "base64", media_type: part.inlineData.mimeType, data: part.inlineData.data } });
      }
    }
  }
  return parts.length ? parts : "";
}

function extractTextFromChatCompletion(payload: Record<string, unknown>): string {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0] as Record<string, unknown> | undefined;
  const message = first?.message as Record<string, unknown> | undefined;
  const content = message?.content ?? first?.text ?? payload.reply ?? payload.output;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "text" in item) return String((item as { text?: unknown }).text ?? "");
      return "";
    }).join("").trim();
  }
  return "";
}

function extractTextFromAnthropicMessage(payload: Record<string, unknown>): string {
  const content = payload.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "text" in item) return String((item as { text?: unknown }).text ?? "");
      return "";
    }).join("").trim();
  }
  if (typeof payload.completion === "string") return payload.completion;
  return "";
}

function extractProviderError(payload: Record<string, unknown>): string {
  const baseResp = payload.base_resp;
  if (baseResp && typeof baseResp === "object") {
    const statusCode = (baseResp as { status_code?: unknown }).status_code;
    const statusMsg = (baseResp as { status_msg?: unknown }).status_msg;
    if (statusCode !== undefined && String(statusCode) !== "0") {
      return normalizeProviderError(String(statusMsg || "MiniMax 业务层返回错误"), { code: statusCode });
    }
  }
  const error = payload.error;
  const hasChoices = Array.isArray(payload.choices);
  const raw = typeof error === "string"
    ? error
    : error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : typeof payload.message === "string" && !hasChoices && !/^ok$/i.test(payload.message.trim())
        ? payload.message
        : "";
  return normalizeProviderError(raw, payload);
}

function aiProviderResponseError(message: string, httpStatus: number, responseSummary: string): Error {
  const error = new Error(message) as Error & { httpStatus?: number; responseSummary?: string };
  error.httpStatus = httpStatus;
  error.responseSummary = responseSummary;
  return error;
}

function summarizeChatCompletionPayload(payload: Record<string, unknown>): string {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0] as Record<string, unknown> | undefined;
  const message = first?.message as Record<string, unknown> | undefined;
  const content = message?.content ?? first?.text ?? payload.reply ?? payload.output;
  const summary = {
    topKeys: Object.keys(payload).slice(0, 12),
    choicesCount: choices.length,
    finishReason: typeof first?.finish_reason === "string" ? first.finish_reason : "",
    messageKeys: message ? Object.keys(message).slice(0, 12) : [],
    contentType: Array.isArray(content) ? "array" : typeof content,
    contentLength: typeof content === "string" ? content.length : Array.isArray(content) ? content.length : 0,
    contentPreview: typeof content === "string" ? safePreview(content) : "",
    providerError: extractProviderError(payload)
  };
  return JSON.stringify(summary);
}

function safePreview(text: string): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/(?<!\d)\+?\d[\d\s().-]{5,}\d(?!\d)/g, "[number]")
    .slice(0, 180);
}

function normalizeProviderError(raw: string, payload: Record<string, unknown>): string {
  const code = typeof payload.code === "number" || typeof payload.code === "string" ? String(payload.code) : "";
  const text = raw || (code ? `错误码 ${code}` : "");
  if (/invalid api key/i.test(text) || code === "2049") {
    return "invalid api key (2049)。如果使用 sk-cp- 开头的 Token Plan/订阅套餐 Key，请确认该 Key 在 MiniMax Token Plan 中仍有效、套餐有额度且已授权 Claude/Anthropic 兼容 API；否则请填写 MiniMax Open Platform 的 API Key。";
  }
  return text;
}

function normalizeBaseUrl(url: string): string {
  return (url || "https://api.minimax.io").replace(/\/+$/, "");
}

function normalizeDeepSeekBaseUrl(config: Pick<AppConfig, "DEEPSEEK_BASE_URL">): string {
  return (config.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
}

function normalizeMiniMaxBaseUrl(config: AppConfig, apiKey: string): string {
  const configured = normalizeBaseUrl(config.MINIMAX_BASE_URL);
  if (isMiniMaxTokenPlanKey(apiKey) && (!config.MINIMAX_BASE_URL || configured === "https://api.minimax.io")) {
    return "https://api.minimaxi.com";
  }
  return configured;
}
