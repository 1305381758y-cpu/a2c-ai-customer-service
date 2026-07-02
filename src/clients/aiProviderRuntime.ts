import type { AppConfig } from "../config.js";
import { generateGeminiText, geminiApiKey } from "./gemini.js";
import { deepseekApiKey, generateDeepSeekText, generateMiniMaxText, minimaxApiKey } from "./aiProviderTransport.js";
import type { AiProviderName, AiTextOptions, AiTextPart } from "./aiProviderTypes.js";

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
  if (provider === "gemini") {
    return generateGeminiText(config, contents as Parameters<typeof generateGeminiText>[1], options);
  }
  if (provider === "deepseek") return generateDeepSeekText(config, contents, options);
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

export function hasUsableAiKey(config: AppConfig): boolean {
  const provider = selectedAiProvider(config);
  if (provider === "deepseek") return Boolean(deepseekApiKey(config));
  return provider === "minimax" ? Boolean(minimaxApiKey(config)) : Boolean(geminiApiKey(config));
}

export function stripJsonFence(text: string): string {
  return text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}
