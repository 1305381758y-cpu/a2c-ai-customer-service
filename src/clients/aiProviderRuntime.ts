import type { AppConfig } from "../config.js";
import { generateGeminiText, geminiApiKey } from "./gemini.js";
import { deepseekApiKey, deepseekModel, generateDeepSeekText, generateMiniMaxText, minimaxApiKey, minimaxModel } from "./aiProviderTransport.js";
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
  try {
    const text = provider === "gemini"
      ? await generateGeminiText(config, contents as Parameters<typeof generateGeminiText>[1], options)
      : provider === "deepseek"
        ? await generateDeepSeekText(config, contents, options)
        : await generateMiniMaxText(config, contents, options);
    recordAiCall(config, { provider, model, taskType: options.taskType || "unknown", status: "success", durationMs: Date.now() - startedAt });
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
  return text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
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
