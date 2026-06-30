import type { AppConfig } from "../config.js";
import { analyzeGeminiImage, generateGeminiText, geminiApiKey, geminiModel, GeminiReplyClient } from "./gemini.js";
import { isContextualIntentLabel, isInternalIntentLabel, type ContextualIntentLabel, type InternalIntentLabel } from "../domain/analyzer.js";
import type { A2CInviteCodeRecord, Conversation, CustomerMemoryRecord, KnowledgeItemRecord, MerchantAgentProfileRecord, MerchantCountryRecord, TrainingMaterialItemRecord } from "../repositories.js";
import type { TrainingSampleForSearch } from "../domain/sampleRetrieval.js";

export type AiProviderName = "minimax" | "gemini";

export interface AiTextPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

export interface AiTextOptions {
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface AiImageAnalysis {
  text: string;
  status: "ok" | "failed" | "skipped";
  error?: string;
}

export interface ReplyInput {
  customerText: string;
  conversation: Conversation;
  history: Array<{ direction: string; content: string; intent: string; createdAt: string }>;
  samples: TrainingSampleForSearch[];
  knowledge: KnowledgeItemRecord[];
  trainingMaterials?: TrainingMaterialItemRecord[];
  memory?: CustomerMemoryRecord;
  country?: MerchantCountryRecord;
  inviteCode?: A2CInviteCodeRecord;
  agentProfile?: MerchantAgentProfileRecord;
}

export interface AiReply {
  reply: string;
  language: string;
  stage: string;
  extractedPhone: string;
  extractedTelegram: string;
  extractedWhatsApp: string;
  shouldHandoff: boolean;
  fallback?: boolean;
  error?: string;
}

const AI_TIMEOUT_MS = 15_000;

export class AiReplyClient {
  constructor(private readonly config: AppConfig) {}

  async generateReply(input: ReplyInput): Promise<AiReply> {
    if (selectedAiProvider(this.config) === "gemini") {
      return new GeminiReplyClient(this.config).generateReply(input);
    }
    try {
      const text = await generateAiText(this.config, JSON.stringify({
        customerText: input.customerText,
        conversation: input.conversation,
        recentHistory: input.history,
        relevantTrainingSamples: input.samples,
        knowledgeItems: input.knowledge,
        trainingMaterials: input.trainingMaterials ?? [],
        customerMemory: input.memory ?? null,
        country: input.country ?? null,
        agentProfile: safeAgentProfile(input.agentProfile),
        assignedInviteCode: input.inviteCode ? {
          code: input.inviteCode.code,
          registerUrl: input.inviteCode.registerUrl,
          status: input.inviteCode.status
        } : null
      }), {
        temperature: 0.45,
        maxOutputTokens: 900,
        systemInstruction: buildReplySystemPrompt(input.agentProfile)
      });
      return normalizeAiReply(JSON.parse(stripJsonFence(text)) as Partial<AiReply>, input, this.config);
    } catch (error) {
      const fallback = fallbackReply(input, this.config);
      fallback.fallback = true;
      fallback.error = error instanceof Error ? error.message : "AI 回复失败";
      return fallback;
    }
  }
}

export function selectedAiProvider(config: Pick<AppConfig, "AI_PROVIDER" | "MINIMAX_API_KEY" | "GOOGLE_AI_API_KEY" | "GOOGLE_AI_MODEL">): AiProviderName {
  if (config.AI_PROVIDER === "gemini") return "gemini";
  if (minimaxApiKey(config)) return "minimax";
  if (geminiApiKey(config)) return "gemini";
  return "minimax";
}

export function aiProviderLabel(config: Pick<AppConfig, "AI_PROVIDER" | "MINIMAX_API_KEY" | "GOOGLE_AI_API_KEY" | "GOOGLE_AI_MODEL">): string {
  return selectedAiProvider(config) === "minimax" ? "MiniMax" : "Gemini 兼容";
}

export function minimaxApiKey(config: Pick<AppConfig, "MINIMAX_API_KEY">): string {
  const value = config.MINIMAX_API_KEY || "";
  return value === "CHANGE_ME" ? "" : value;
}

export function minimaxModel(config: Pick<AppConfig, "MINIMAX_MODEL">): string {
  return config.MINIMAX_MODEL || "MiniMax-M3";
}

export async function generateAiText(
  config: AppConfig,
  contents: string | AiTextPart[],
  options: AiTextOptions = {}
): Promise<string> {
  if (selectedAiProvider(config) === "gemini") {
    return generateGeminiText(config, contents as Parameters<typeof generateGeminiText>[1], options);
  }
  return generateMiniMaxText(config, contents, options);
}

export async function generateAiJson<T>(
  config: AppConfig,
  contents: string | AiTextPart[],
  options: AiTextOptions = {}
): Promise<T> {
  const text = await generateAiText(config, contents, options);
  return JSON.parse(stripJsonFence(text)) as T;
}

export async function analyzeAiImage(config: AppConfig, imageUrl: string): Promise<AiImageAnalysis> {
  if (!imageUrl) return { text: "", status: "skipped" };
  if (selectedAiProvider(config) === "gemini") return analyzeGeminiImage(config, imageUrl);
  if (!minimaxApiKey(config)) return { text: "", status: "skipped", error: "MiniMax Key 未配置" };
  try {
    const text = await generateMiniMaxText(config, [
      {
        text: `请分析这张客户发来的开户注册/Telegram 操作截图。
只输出一段很短的内部中文说明，30 字以内。
重点判断：客户是否遇到链接打不开、页面报错、验证码、邀请码、注册字段、Telegram 用户名等问题。
不要输出图片 URL，不要提取或猜测手机号，不要编造页面上没有的信息。`
      },
      { inlineData: { mimeType: "image/jpeg", data: imageUrl } }
    ], { temperature: 0, maxOutputTokens: 160 });
    return { text: text.slice(0, 160), status: text ? "ok" : "skipped" };
  } catch (error) {
    return { text: "", status: "failed", error: error instanceof Error ? error.message : "图片识别失败" };
  }
}

export async function detectAiLanguage(
  config: AppConfig,
  input: {
    customerText: string;
    previousLanguage: string;
    countryDefaultLanguage: string;
    recentHistory: Array<{ direction: string; content: string; intent: string; createdAt: string }>;
  }
): Promise<string> {
  if (!hasUsableAiKey(config)) return "unknown";
  const text = input.customerText.trim();
  if (!text) return "unknown";
  try {
    const result = await generateAiText(config, JSON.stringify({
      customerText: text,
      previousLanguage: input.previousLanguage || "unknown",
      countryDefaultLanguage: input.countryDefaultLanguage || "unknown",
      recentHistory: input.recentHistory.slice(-4).map((item) => ({
        direction: item.direction,
        content: item.content
      }))
    }), {
      temperature: 0,
      maxOutputTokens: 24,
      systemInstruction: `
你只负责判断客户当前这条消息主要使用什么语言，不要翻译，不要解释。
只输出一个语言代码，必须从以下代码中选择：
zh, en, es, pt-BR, ja, th, vi, ms, id, fr, ar, ru, ko, unknown

判断规则：
- 优先看客户当前消息，不要盲目沿用历史语言。
- 如果当前消息是短句，也要结合国家默认语言和最近上下文判断。
- "Información"、"informacion"、"por favor"、"x favor"、"si/sí" 在西语上下文通常是 es。
- 葡语的 "sim"、"olá"、"cadastro" 通常是 pt-BR。
- 如果一段话混合多种语言，选择客户主要表达和后续最应该回复的语言。
- 不能输出中文名称或其它文字，只输出代码。
`
    });
    const code = normalizeAiLanguageCode(result.trim());
    return code;
  } catch {
    return "unknown";
  }
}

export async function classifyAiIntent(
  config: AppConfig,
  input: {
    customerText: string;
    language: string;
    flowStep: string;
    recentHistory: Array<{ direction: string; content: string; intent: string; createdAt: string }>;
  }
): Promise<InternalIntentLabel> {
  try {
    const text = await generateAiText(config, JSON.stringify({
      customerText: input.customerText,
      language: input.language,
      flowStep: input.flowStep,
      recentHistory: input.recentHistory.slice(-6).map((item) => ({
        direction: item.direction,
        content: item.content,
        intent: item.intent
      }))
    }), {
      temperature: 0,
      maxOutputTokens: 80,
      systemInstruction: `
你只负责把客户当前消息归类为一个固定标签，不要解释，不要输出 JSON。
可选标签只有：
positive_confirmation, negative_refusal, need_help, ask_platform_register, ask_link, ask_tg_register, platform_register_done, payment_concern, investment_concern, trust_concern, earning_concern, workflow_question, job_question, complaint, chat, sensitive_request, unknown

判断规则：
- 客户表示“是、可以、继续、好的、同意、愿意、yes、ok、sim、claro”等，输出 positive_confirmation。
- 客户明确拒绝、不要、不感兴趣、停止，输出 negative_refusal。
- 客户说不会、帮我、怎么弄、需要协助，输出 need_help。
- 客户询问开户链接、邀请码、入口、URL，输出 ask_link。
- 客户询问注册、开户、平台是什么、在哪里注册，输出 ask_platform_register。
- 客户询问 Telegram/TG 下载、注册、账号，输出 ask_tg_register。
- 客户表示已经注册完成，输出 platform_register_done。
- 客户问是否需要付钱、收费、转账、充值，输出 payment_concern。
- 客户问投资、本金、押金、垫付、先付，输出 investment_concern。
- 客户质疑诈骗、骗子、安全、真假、可靠，输出 trust_concern。
- 客户质疑收入、收益、佣金、多久到账，输出 earning_concern。
- 客户问下一步、怎么做、需要什么资料、怎么操作，输出 workflow_question。
- 客户问工作是什么、具体做什么、兼职内容，输出 job_question。
- 客户抱怨你没回答、重复、机械、听不懂，输出 complaint。
- 客户想闲聊、问能不能聊天或你是谁，输出 chat。
- 客户要求处理验证码、密码、支付、证件等敏感资料，输出 sensitive_request。
- 无法判断才输出 unknown。
`
    });
    const label = text.trim().replace(/[`"'。.!?！？\s]/g, "");
    return isInternalIntentLabel(label) ? label : "unknown";
  } catch {
    return "unknown";
  }
}

function normalizeAiLanguageCode(value: string): string {
  const normalized = value.toLowerCase().replace(/[`"'。.!?！？\s]/g, "");
  const aliases: Record<string, string> = {
    chinese: "zh",
    mandarin: "zh",
    español: "es",
    espanol: "es",
    spanish: "es",
    english: "en",
    portuguese: "pt-BR",
    portugues: "pt-BR",
    português: "pt-BR",
    "pt-br": "pt-BR",
    ptbr: "pt-BR",
    japanese: "ja",
    thai: "th",
    vietnamese: "vi",
    malay: "ms",
    indonesian: "id",
    french: "fr",
    arabic: "ar",
    russian: "ru",
    korean: "ko"
  };
  const code = aliases[normalized] || normalized;
  return ["zh", "en", "es", "pt-BR", "ja", "th", "vi", "ms", "id", "fr", "ar", "ru", "ko", "unknown"].includes(code) ? code : "unknown";
}

export async function classifyAiContextualIntent(
  config: AppConfig,
  input: {
    customerText: string;
    language: string;
    flowStep: string;
    previousAssistantMessage: string;
    recentHistory: Array<{ direction: string; content: string; intent: string; createdAt: string }>;
    knownPhone: string;
    knownTelegram: string;
  }
): Promise<{
  intent: ContextualIntentLabel;
  answeredPreviousQuestion: boolean;
  isQuestion: boolean;
  shouldPause: boolean;
  questionType: string;
  nextAction: string;
  reason: string;
}> {
  const fallback = {
    intent: "unknown" as ContextualIntentLabel,
    answeredPreviousQuestion: false,
    isQuestion: false,
    shouldPause: false,
    questionType: "none",
    nextAction: "",
    reason: ""
  };
  try {
    const parsed = await generateAiJson<Partial<typeof fallback> & { intent?: string }>(config, JSON.stringify({
      customerText: input.customerText,
      language: input.language,
      flowStep: input.flowStep,
      previousAssistantMessage: input.previousAssistantMessage,
      knownPhone: input.knownPhone,
      knownTelegram: input.knownTelegram,
      recentHistory: input.recentHistory.slice(-10).map((item) => ({
        direction: item.direction,
        content: item.content,
        intent: item.intent
      }))
    }), {
      temperature: 0,
      maxOutputTokens: 260,
      systemInstruction: `
你只做开户注册流程的上下文意图分类，不能生成客服回复，不能决定跳流程。
必须只输出 JSON，不要 Markdown，不要解释。

JSON 字段：
{
  "intent": "固定标签",
  "answeredPreviousQuestion": boolean,
  "isQuestion": boolean,
  "shouldPause": boolean,
  "questionType": "none|telegram|payment|investment|trust|earning|workflow|job|complaint|chat|sensitive|unknown",
  "nextAction": "一句内部动作描述",
  "reason": "极短原因"
}

intent 只能是：
phone_submission, incomplete_phone, telegram_submission, positive_confirmation, acknowledgement, negative_refusal, not_available, not_registered, no_telegram, telegram_installed, telegram_username_help, need_help, ask_platform_register, ask_link, ask_tg_register, platform_register_done, payment_concern, investment_concern, trust_concern, earning_concern, workflow_question, registration_field_question, job_question, complaint, chat, sensitive_request, unknown_question, unknown

判断重点：
- 资料提交优先：手机号是 phone_submission，@用户名是 telegram_submission。
- 短句必须结合 previousAssistantMessage 和 flowStep。比如上一句问 Telegram，客户说“我没有”就是 no_telegram；上一句问是否有空，客户说“我没有”就是 not_available；上一句问是否完成注册，客户说“我没有”就是 not_registered。
- telegram_download 阶段的“装好了/下载好了/安装好了”是 telegram_installed，不是平台开户完成。
- 客户问“@ 在哪里/怎么找用户名/怎么设置用户名/没有 @/找不到 username”是 telegram_username_help，questionType=telegram。
- collect_telegram 阶段的“ok/好的/明白了”多半是 acknowledgement，表示客户明白了但还没提交资料。
- 客户问“为什么/TG 是什么/怎么下载”属于 ask_tg_register 或 workflow_question，questionType=telegram。
- 客户问费用、投资、本金、押金、诈骗、安全、收益时分别分类，不要归 unknown。
- 客户明确说不想继续、别发了、不要了才是 negative_refusal。
`
    });
    const intent = parsed.intent && isContextualIntentLabel(parsed.intent) ? parsed.intent : "unknown";
    return {
      intent,
      answeredPreviousQuestion: Boolean(parsed.answeredPreviousQuestion),
      isQuestion: Boolean(parsed.isQuestion),
      shouldPause: Boolean(parsed.shouldPause),
      questionType: typeof parsed.questionType === "string" ? parsed.questionType : "none",
      nextAction: typeof parsed.nextAction === "string" ? parsed.nextAction.slice(0, 120) : "",
      reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 120) : ""
    };
  } catch {
    return fallback;
  }
}

export async function naturalizeStrictFlowText(
  config: AppConfig,
  input: {
    customerText: string;
    draftReply: string;
    language: string;
    flowStep: string;
    questionType: string;
    recentHistory: Array<{ direction: string; content: string; intent: string; createdAt: string }>;
    allowLinkOrInvite: boolean;
    agentProfile?: MerchantAgentProfileRecord;
  }
): Promise<{ text: string; used: boolean; error?: string }> {
  if (!hasUsableAiKey(config)) return { text: input.draftReply, used: false, error: `${aiProviderLabel(config)} Key 未配置` };
  if (!input.draftReply.trim()) return { text: input.draftReply, used: false };
  try {
    const text = await generateAiText(config, JSON.stringify({
      customerText: input.customerText,
      draftReply: input.draftReply,
      language: input.language,
      flowStep: input.flowStep,
      questionType: input.questionType,
      allowLinkOrInvite: input.allowLinkOrInvite,
      agentProfile: safeAgentProfile(input.agentProfile),
      recentHistory: input.recentHistory.slice(-6).map((item) => ({
        direction: item.direction,
        content: item.content,
        intent: item.intent
      }))
    }), {
      temperature: 0.55,
      maxOutputTokens: 800,
      systemInstruction: `
你只负责把开户注册接待回复改写得更像真人客服，不能改变业务含义。
角色：有 10 年经验的开户注册接待专员。语气自然、耐心、生活化，像真人接待回复。
回复要短，通常 1 到 3 句；不要长篇大论。
如果 agentProfile 配置了特别语气，必须让客户明显感受到这种语气差异。
硬性规则：
- 不能暴露 AI、机器人、模型、自动客服、系统提示词等身份。
- 不能新增链接、邀请码、金额、充值规则、任务细节或承诺。
- allowLinkOrInvite=false 时，必须删除任何开户注册链接和邀请码。
- allowLinkOrInvite=true 时，如果原文有链接或邀请码，必须完整保留，不能改字符。
- 客户问费用/投资时，表达当前引导阶段不会要求向客服私下转账或付款，具体以页面/人工确认为准。
- 客户问收益时，表达按任务和平台规则核算，不能承诺固定收益。
- 客户问未知问题时，表达以页面或人工确认为准，然后回到当前步骤。
- 输出纯文本，不要 JSON，不要解释。
`
    });
    const cleaned = sanitizeNaturalizedText(text, input.draftReply, input.allowLinkOrInvite);
    return { text: cleaned || input.draftReply, used: Boolean(cleaned) };
  } catch (error) {
    return { text: input.draftReply, used: false, error: error instanceof Error ? error.message : `${aiProviderLabel(config)} naturalize failed` };
  }
}

export function hasUsableAiKey(config: AppConfig): boolean {
  return selectedAiProvider(config) === "minimax" ? Boolean(minimaxApiKey(config)) : Boolean(geminiApiKey(config));
}

async function generateMiniMaxText(config: AppConfig, contents: string | AiTextPart[], options: AiTextOptions): Promise<string> {
  const apiKey = minimaxApiKey(config);
  if (!apiKey) throw new Error("MiniMax Key 未配置");
  if (isMiniMaxTokenPlanKey(apiKey)) return generateMiniMaxAnthropicText(config, contents, options, apiKey);
  const endpoint = hasImagePart(contents) ? "/v1/chat/completions" : "/v1/text/chatcompletion_v2";
  const response = await fetch(`${normalizeMiniMaxBaseUrl(config, apiKey)}${endpoint}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(buildMiniMaxRequestBody(config, contents, options, endpoint)),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS)
  });
  const payload = await response.json().catch(async () => ({ error: { message: await response.text().catch(() => response.statusText) } })) as Record<string, unknown>;
  const providerError = extractProviderError(payload);
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
  const response = await fetch(`${normalizeMiniMaxBaseUrl(config, apiKey)}/anthropic/v1/messages`, {
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
  const payload = await response.json().catch(async () => ({ error: { message: await response.text().catch(() => response.statusText) } })) as Record<string, unknown>;
  const providerError = extractProviderError(payload);
  if (!response.ok || providerError) {
    throw new Error(`MiniMax 调用失败：${providerError || response.statusText}`);
  }
  const text = extractTextFromAnthropicMessage(payload).trim();
  if (!text) throw new Error("MiniMax 返回内容为空");
  return text;
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
  const raw = typeof error === "string"
    ? error
    : error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : typeof payload.message === "string"
        ? payload.message
        : "";
  return normalizeProviderError(raw, payload);
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

function normalizeMiniMaxBaseUrl(config: AppConfig, apiKey: string): string {
  const configured = normalizeBaseUrl(config.MINIMAX_BASE_URL);
  if (isMiniMaxTokenPlanKey(apiKey) && (!config.MINIMAX_BASE_URL || configured === "https://api.minimax.io")) {
    return "https://api.minimaxi.com";
  }
  return configured;
}

function normalizeAiReply(value: Partial<AiReply>, input: ReplyInput, config: AppConfig): AiReply {
  if (!value || typeof value.reply !== "string" || !value.reply.trim()) return fallbackReply(input, config);
  return {
    reply: sanitizeCustomerVisibleReply(value.reply.trim()),
    language: typeof value.language === "string" && value.language ? value.language : input.conversation.language,
    stage: typeof value.stage === "string" && value.stage ? value.stage : input.conversation.stage,
    extractedPhone: typeof value.extractedPhone === "string" ? value.extractedPhone : input.conversation.extractedPhone,
    extractedTelegram: typeof value.extractedTelegram === "string" ? value.extractedTelegram : input.conversation.extractedTelegram,
    extractedWhatsApp: typeof value.extractedWhatsApp === "string" ? value.extractedWhatsApp : input.conversation.extractedWhatsApp,
    shouldHandoff: Boolean(value.shouldHandoff)
  };
}

function fallbackReply(input: ReplyInput, config: AppConfig): AiReply {
  const language = input.conversation.language === "unknown" ? "zh" : input.conversation.language;
  const sample = input.samples.find((item) => item.standardReply && !isMechanicalTemplateReply(item.standardReply));
  const safeSampleReply = sample?.standardReply && !containsNoInviteClaim(sample.standardReply)
    ? sample.standardReply
    : "";
  const baseReply = safeSampleReply || contextualFallbackReply(input, config) || defaultReply(input, config);
  const reply = sanitizeCustomerVisibleReply(ensureInviteInReply(baseReply, input, config));
  return {
    reply,
    language,
    stage: input.conversation.stage,
    extractedPhone: input.conversation.extractedPhone,
    extractedTelegram: input.conversation.extractedTelegram,
    extractedWhatsApp: input.conversation.extractedWhatsApp,
    shouldHandoff: false,
    fallback: true
  };
}

function sanitizeCustomerVisibleReply(text: string): string {
  return text
    .replace(/(?:我是|我这边是|作为|身为)\s*(AI|人工智能|机器人|機器人|自动客服|自動客服|模型)/gi, "我这边")
    .replace(/\b(AI|robot|bot|model)\b/gi, "")
    .trim();
}

function defaultReply(input: ReplyInput, config: AppConfig): string {
  const language = input.conversation.language === "unknown" ? "zh" : input.conversation.language;
  const registration = input.inviteCode ? inviteDisplayText(input.inviteCode, language, fallbackRegisterUrl(input, config)) : fallbackRegisterUrl(input, config);
  const link = registration ? ` ${registration}` : "";
  if (language === "en") return `Please complete the platform registration first, then send us your phone number and Telegram account.${link}`;
  if (language === "es") return `Primero complete el registro en la plataforma y luego envíeme su número de teléfono y su cuenta de Telegram.${link}`;
  if (language === "pt-BR") return `Conclua primeiro o cadastro na plataforma. Depois, envie seu número de telefone e sua conta do Telegram.${link}`;
  return `请先完成平台开户，完成后把您的手机号和 Telegram 账号发给我。${link}`;
}

function contextualFallbackReply(input: ReplyInput, config: AppConfig): string {
  const language = input.conversation.language === "unknown" ? "zh" : input.conversation.language;
  const text = input.customerText.trim();
  if (/(邀请码|invite code|invitation code|código|codigo|招待コード)/i.test(text)) {
    if (input.inviteCode) {
      const display = inviteDisplayText(input.inviteCode, language, fallbackRegisterUrl(input, config));
      if (language === "en") return `Yes, registration requires an invitation code. Please use this registration link and invitation code: ${display}`;
      if (language === "es") return `Sí, el registro necesita un código de invitación. Use este enlace de registro y este código: ${display}`;
      if (language === "pt-BR") return `Sim, o cadastro precisa de código de convite. Use este link de cadastro e código: ${display}`;
      return `需要邀请码才能注册。请使用这个开户链接和邀请码：${display}`;
    }
    return missingInviteReply(language, input, config);
  }
  if (/(发我链接|注册链接|开户链接|注册入口|link please|register link|registration link)/i.test(text) && input.inviteCode) {
    const display = inviteDisplayText(input.inviteCode, language, fallbackRegisterUrl(input, config));
    if (language === "en") return `Please use this registration link and invitation code: ${display}`;
    if (language === "es") return `Use este enlace de registro y este código de invitación: ${display}`;
    if (language === "pt-BR") return `Use este link de cadastro e código de convite: ${display}`;
    return `请使用这个开户链接和邀请码：${display}`;
  }
  return "";
}

function ensureInviteInReply(reply: string, input: ReplyInput, config: AppConfig): string {
  if (!input.inviteCode) return containsNoInviteClaim(reply) ? missingInviteReply(input.conversation.language, input, config) : reply;
  const fallbackUrl = fallbackRegisterUrl(input, config);
  const display = inviteDisplayText(input.inviteCode, input.conversation.language, fallbackUrl);
  const registerUrl = inviteRegisterUrl(input.inviteCode, fallbackUrl);
  const hasCode = reply.includes(input.inviteCode.code);
  const hasUrl = registerUrl ? reply.includes(registerUrl) || Boolean(input.inviteCode.registerUrl && reply.includes(input.inviteCode.registerUrl)) || Boolean(fallbackUrl && reply.includes(fallbackUrl)) : true;
  if (hasCode && hasUrl) return reply;
  if (!/(注册链接|开户链接|register|cadastro|link|邀请码|invite|convite)/i.test(input.customerText + "\n" + reply)) return reply;
  const language = input.conversation.language === "unknown" ? "zh" : input.conversation.language;
  if (language === "en") return `${reply}\nRegistration link and invitation code: ${display}`;
  if (language === "es") return `${reply}\nEnlace de registro y código de invitación: ${display}`;
  if (language === "pt-BR") return `${reply}\nLink de cadastro e código de convite: ${display}`;
  return `${reply}\n开户链接和邀请码：${display}`;
}

function inviteRegisterUrl(inviteCode: A2CInviteCodeRecord, fallbackUrl = ""): string {
  const template = inviteCode.registerUrl || fallbackUrl;
  if (!template) return inviteCode.code;
  return template.includes("{code}") ? template.replaceAll("{code}", encodeURIComponent(inviteCode.code)) : template;
}

function inviteDisplayText(inviteCode: A2CInviteCodeRecord, language: string, fallbackUrl = ""): string {
  const template = inviteCode.registerUrl || fallbackUrl;
  const url = inviteRegisterUrl(inviteCode, fallbackUrl);
  if (template.includes("{code}")) return url;
  if (language === "en") return `${url} Invitation code: ${inviteCode.code}`;
  if (language === "es") return `${url} Código de invitación: ${inviteCode.code}`;
  if (language === "pt-BR") return `${url} Código de convite: ${inviteCode.code}`;
  return `${url} 邀请码：${inviteCode.code}`;
}

function fallbackRegisterUrl(input: ReplyInput, config: AppConfig): string {
  return input.country?.platformRegisterUrl || config.PLATFORM_REGISTER_URL || "";
}

function missingInviteReply(language: string, input: ReplyInput, config: AppConfig): string {
  const suffix = fallbackRegisterUrl(input, config) ? ` ${fallbackRegisterUrl(input, config)}` : "";
  if (language === "en") return `Registration requires an invitation code. I am confirming your dedicated invitation code now. Please wait a moment.${suffix}`;
  if (language === "es") return `El registro necesita un código de invitación. Estoy confirmando su código exclusivo ahora. Espere un momento.${suffix}`;
  if (language === "pt-BR") return `O cadastro precisa de código de convite. Estou confirmando seu código exclusivo agora. Aguarde um momento.${suffix}`;
  return `注册需要邀请码。我这边正在确认您的专属邀请码，请稍等。${suffix}`;
}

function containsNoInviteClaim(reply: string): boolean {
  return /(不需要邀请码|无需邀请码|不需要.*邀请码|no invite|no invitation code|does not need.*invite)/i.test(reply);
}

function isMechanicalTemplateReply(reply: string): boolean {
  return /(我是平台客服|平台客服，会继续协助您完成注册流程|想了解如何开户注册|请问您现在想先处理哪一步|Não entendi sua mensagem|Please write your question in one short sentence)/i.test(reply);
}

function buildReplySystemPrompt(agentProfile?: MerchantAgentProfileRecord): string {
  return `
你是甲方配置的真人客服口吻助手。你必须根据甲方上传的对话资料、话本、客户历史聊天记录和客户当前语言回复。
${agentProfileBlock(agentProfile)}
目标：
1. 引导客户完成平台开户。
2. 根据当前国家配置，引导客户提供手机号、Telegram 或 WhatsApp。
3. 当客户满足当前国家目标后，停止继续引导，进入人工接管。
规则：
- 面向客户的 reply 里，任何情况下都不能暴露自己是 AI、机器人、模型、自动客服或自动回复。
- 必须使用客户最近消息的主要语言回复。
- 优先参考 relevantTrainingSamples、knowledgeItems、trainingMaterials、customerMemory、country。
- 只收集 country 当前要求的联系方式。
- 如果 assignedInviteCode 存在，开户注册引导必须同时包含 registerUrl 和邀请码 code。
- 不要要求客户提供密码、验证码、支付信息或证件敏感信息。
- 每次只给客户当前最需要的一步，简短自然，像真人客服。
输出必须是 JSON，字段为 reply、language、stage、extractedPhone、extractedTelegram、extractedWhatsApp、shouldHandoff。
`;
}

function safeAgentProfile(profile?: MerchantAgentProfileRecord): Record<string, string | boolean> | null {
  if (!profile || !profile.enabled) return null;
  return {
    agentName: profile.agentName,
    roleDefinition: profile.roleDefinition,
    toneStyle: profile.toneStyle,
    coreGoal: profile.coreGoal,
    mustFollow: profile.mustFollow,
    forbidden: profile.forbidden,
    uncertaintyPolicy: profile.uncertaintyPolicy,
    handoffPolicy: profile.handoffPolicy,
    enabled: profile.enabled
  };
}

function agentProfileBlock(profile?: MerchantAgentProfileRecord): string {
  if (!profile || !profile.enabled) {
    return `
Agent 默认设定：
- 角色：拥有10年开户注册接待经验的客户引导专员。
- 语气：简短、口语化、耐心，像真人客服。
- 边界：不确定内容以页面或人工确认为准。`;
  }
  return `
商户 Agent 设定：
- Agent 名称：${profile.agentName}
- 角色定义：${profile.roleDefinition}
- 语气风格：${profile.toneStyle}
- 核心目标：${profile.coreGoal}
- 必须遵守：${profile.mustFollow}
- 禁止事项：${profile.forbidden}
- 不确定问题口径：${profile.uncertaintyPolicy}
- 转人工条件：${profile.handoffPolicy}`;
}

function stripJsonFence(text: string): string {
  return text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

export function sanitizeNaturalizedText(text: string, fallback: string, allowLinkOrInvite: boolean): string {
  let cleaned = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^(回复|改写|输出)\s*[:：]\s*/i, "")
    .trim();
  if (!cleaned) return "";
  if (looksLikeStructuredAiPayload(cleaned)) return fallback;
  if (/(我是|作为|身为).{0,8}(AI|人工智能|机器人|機器人|模型|自动客服|自動客服)|\b(AI|robot|bot|model)\b/i.test(cleaned)) {
    return fallback;
  }
  if (!allowLinkOrInvite) {
    cleaned = cleaned
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/(?:邀请码|邀請碼|invitation code|invite code|código de convite|codigo de convite)\s*[:：]?\s*[A-Za-z0-9_-]+/gi, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } else {
    const fallbackUrls: string[] = fallback.match(/https?:\/\/\S+/gi) ?? [];
    const cleanedUrls: string[] = cleaned.match(/https?:\/\/\S+/gi) ?? [];
    if (fallbackUrls.some((url) => !cleanedUrls.includes(url))) return fallback;
    const fallbackInvite = fallback.match(/(?:邀请码|邀請碼|Invitation code|Invite code|Código de convite|Codigo de convite)\s*[:：]?\s*([A-Za-z0-9_-]+)/i)?.[1];
    if (fallbackInvite && !cleaned.includes(fallbackInvite)) return fallback;
  }
  return cleaned;
}

function looksLikeStructuredAiPayload(text: string): boolean {
  const trimmed = text.trim();
  return (trimmed.startsWith("{") && trimmed.endsWith("}")) || /"reply"\s*:/.test(trimmed);
}
