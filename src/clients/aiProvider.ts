import type { AppConfig } from "../config.js";
import { analyzeGeminiImage, generateGeminiText, geminiApiKey, geminiModel } from "./gemini.js";
import { type InternalIntentLabel } from "../domain/analyzer.js";
import { deepseekApiKey, deepseekModel, generateDeepSeekText, generateMiniMaxText, minimaxApiKey, minimaxModel } from "./aiProviderTransport.js";
import type { AiProviderName, AiTextOptions, AiTextPart } from "./aiProviderTypes.js";
import { detectAiLanguage as detectAiLanguageWithRuntime, type AiLanguageDetectionInput } from "./aiLanguageDetection.js";
import { classifyAiIntent as classifyAiIntentWithRuntime, type AiIntentClassificationInput } from "./aiIntentClassification.js";
import { classifyAiContextualIntent as classifyAiContextualIntentWithRuntime, type AiContextualIntentClassificationInput, type AiContextualIntentResult } from "./aiContextualIntentClassification.js";
import { naturalizeStrictFlowText as naturalizeStrictFlowTextWithRuntime, sanitizeNaturalizedText, type AiNaturalizeStrictFlowInput } from "./aiStrictFlowNaturalization.js";

export type { AiProviderName, AiTextOptions, AiTextPart } from "./aiProviderTypes.js";
export { deepseekApiKey, deepseekModel, minimaxApiKey, minimaxModel } from "./aiProviderTransport.js";

export interface AiImageAnalysis {
  text: string;
  status: "ok" | "failed" | "skipped";
  error?: string;
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

export async function analyzeAiImage(config: AppConfig, imageUrl: string): Promise<AiImageAnalysis> {
  if (!imageUrl) return { text: "", status: "skipped" };
  const provider = selectedAiProvider(config);
  if (provider === "gemini") return analyzeGeminiImage(config, imageUrl);
  if (provider === "deepseek") return { text: "", status: "skipped", error: "DeepSeek 暂不支持图片理解，请切换 MiniMax/Gemini 或让客户补充文字说明" };
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
  input: AiLanguageDetectionInput
): Promise<string> {
  return detectAiLanguageWithRuntime(config, input, {
    hasUsableAiKey,
    generateText: generateAiText
  });
}

export async function classifyAiIntent(
  config: AppConfig,
  input: AiIntentClassificationInput
): Promise<InternalIntentLabel> {
  return classifyAiIntentWithRuntime(config, input, {
    generateText: generateAiText
  });
}

export async function classifyAiContextualIntent(
  config: AppConfig,
  input: AiContextualIntentClassificationInput
): Promise<AiContextualIntentResult> {
  return classifyAiContextualIntentWithRuntime(config, input, {
    generateJson: generateAiJson
  });
}

export async function naturalizeStrictFlowText(
  config: AppConfig,
  input: AiNaturalizeStrictFlowInput
): Promise<{ text: string; used: boolean; error?: string }> {
  return naturalizeStrictFlowTextWithRuntime(config, input, {
    hasUsableAiKey,
    providerLabel: aiProviderLabel,
    generateText: generateAiText
  });
}

export function hasUsableAiKey(config: AppConfig): boolean {
  const provider = selectedAiProvider(config);
  if (provider === "deepseek") return Boolean(deepseekApiKey(config));
  return provider === "minimax" ? Boolean(minimaxApiKey(config)) : Boolean(geminiApiKey(config));
}

function stripJsonFence(text: string): string {
  return text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

export { sanitizeNaturalizedText };
