import type { AppConfig } from "../config.js";
import { generateGeminiText, geminiApiKey } from "./aiGeminiTransport.js";
import { deepseekApiKey, deepSeekEffectiveMaxTokens, deepseekModel, generateDeepSeekText, generateMiniMaxText, minimaxApiKey, minimaxModel } from "./aiProviderTransport.js";
import type { AiProviderName, AiTextOptions, AiTextPart } from "./aiProviderTypes.js";

export type AiCallTelemetryInput = {
  merchantId?: string;
  countryId?: string;
  provider: AiProviderName;
  model: string;
  taskType: string;
  status: "success" | "error";
  durationMs: number;
  error?: string;
  httpStatus?: number;
  requestSummary?: string;
  responseSummary?: string;
};

let aiCallRecorder: ((input: AiCallTelemetryInput) => void) | undefined;

export function setAiCallRecorder(recorder: ((input: AiCallTelemetryInput) => void) | undefined): void {
  aiCallRecorder = recorder;
}

export function selectedAiProvider(config: Pick<AppConfig, "AI_PROVIDER" | "MINIMAX_API_KEY" | "DEEPSEEK_API_KEY" | "GOOGLE_AI_API_KEY" | "GOOGLE_AI_MODEL">): AiProviderName {
  if (config.AI_PROVIDER === "gemini") return "gemini";
  if (config.AI_PROVIDER === "deepseek") return "deepseek";
  if (minimaxApiKey(config)) return "minimax";
  if (deepseekApiKey(config)) return "deepseek";
  if (geminiApiKey(config)) return "gemini";
  return "minimax";
}

export function aiProviderLabel(config: Pick<AppConfig, "AI_PROVIDER" | "MINIMAX_API_KEY" | "DEEPSEEK_API_KEY" | "GOOGLE_AI_API_KEY" | "GOOGLE_AI_MODEL">): string {
  const provider = selectedAiProvider(config);
  if (provider === "deepseek") return "DeepSeek";
  return provider === "minimax" ? "MiniMax" : "Gemini 兼容";
}

export async function generateAiText(
  config: AppConfig,
  contents: string | AiTextPart[],
  options: AiTextOptions = {}
): Promise<string> {
  const provider = selectedAiProvider(config);
  const startedAt = Date.now();
  const model = aiModelName(config, provider);
  const requestSummary = summarizeAiRequest(contents, options, provider);
  try {
    const text = provider === "gemini"
      ? await generateGeminiText(config, contents, options)
      : provider === "deepseek"
        ? await generateDeepSeekText(config, contents, options)
        : await generateMiniMaxText(config, contents, options);
    recordAiCall(config, { provider, model, taskType: options.taskType || "unknown", status: "success", durationMs: Date.now() - startedAt, requestSummary });
    return text;
  } catch (error) {
    const telemetry = extractErrorTelemetry(error);
    recordAiCall(config, {
      provider,
      model,
      taskType: options.taskType || "unknown",
      status: "error",
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      httpStatus: telemetry.httpStatus,
      requestSummary,
      responseSummary: telemetry.responseSummary
    });
    throw error;
  }
}

export async function generateAiJson<T>(
  config: AppConfig,
  contents: string | AiTextPart[],
  options: AiTextOptions = {}
): Promise<T> {
  const text = await generateAiText(config, contents, options);
  return JSON.parse(stripJsonFence(text)) as T;
}

export function hasUsableAiKey(config: AppConfig): boolean {
  const provider = selectedAiProvider(config);
  if (provider === "deepseek") return Boolean(deepseekApiKey(config));
  return provider === "minimax" ? Boolean(minimaxApiKey(config)) : Boolean(geminiApiKey(config));
}

export function stripJsonFence(text: string): string {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const firstObject = cleaned.indexOf("{");
  const lastObject = cleaned.lastIndexOf("}");
  if (firstObject >= 0 && lastObject > firstObject) return cleaned.slice(firstObject, lastObject + 1).trim();
  const firstArray = cleaned.indexOf("[");
  const lastArray = cleaned.lastIndexOf("]");
  if (firstArray >= 0 && lastArray > firstArray) return cleaned.slice(firstArray, lastArray + 1).trim();
  return cleaned;
}

function aiModelName(config: AppConfig, provider: AiProviderName): string {
  if (provider === "gemini") return config.GOOGLE_AI_MODEL || "gemini";
  if (provider === "deepseek") return deepseekModel(config);
  return minimaxModel(config);
}

function recordAiCall(
  config: AppConfig,
  input: Omit<AiCallTelemetryInput, "merchantId" | "countryId">
): void {
  if (!aiCallRecorder) return;
  try {
    aiCallRecorder({
      ...input,
      merchantId: config.AI_TELEMETRY_MERCHANT_ID,
      countryId: config.AI_TELEMETRY_COUNTRY_ID
    });
  } catch {
    // AI telemetry must never affect customer replies.
  }
}

function extractErrorTelemetry(error: unknown): { httpStatus?: number; responseSummary?: string } {
  if (!error || typeof error !== "object") return {};
  const candidate = error as { httpStatus?: unknown; responseSummary?: unknown };
  return {
    httpStatus: typeof candidate.httpStatus === "number" ? candidate.httpStatus : undefined,
    responseSummary: typeof candidate.responseSummary === "string" ? candidate.responseSummary : undefined
  };
}

function summarizeAiRequest(contents: string | AiTextPart[], options: AiTextOptions, provider: AiProviderName): string {
  const userText = typeof contents === "string"
    ? contents
    : contents.map((part) => part.text || (part.inlineData ? "[image]" : "")).join("\n").trim();
  const summary = {
    taskType: options.taskType || "unknown",
    temperature: options.temperature ?? 0.2,
    maxOutputTokens: options.maxOutputTokens ?? 1200,
    effectiveMaxOutputTokens: effectiveMaxOutputTokens(provider, options),
    hasSystemInstruction: Boolean(options.systemInstruction),
    systemInstructionLength: options.systemInstruction?.length ?? 0,
    systemInstructionPreview: safeTelemetryPreview(options.systemInstruction || ""),
    userContentLength: userText.length,
    userContentPreview: safeTelemetryPreview(userText)
  };
  return JSON.stringify(summary);
}

function effectiveMaxOutputTokens(provider: AiProviderName, options: AiTextOptions): number {
  const requested = options.maxOutputTokens ?? 1200;
  if (provider === "deepseek") return deepSeekEffectiveMaxTokens(options);
  return requested;
}

function safeTelemetryPreview(text: string): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/(?<!\d)\+?\d[\d\s().-]{5,}\d(?!\d)/g, "[number]")
    .slice(0, 500);
}
