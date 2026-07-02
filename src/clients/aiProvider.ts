import type { AppConfig } from "../config.js";
import { type InternalIntentLabel } from "../domain/analyzer.js";
import { generateMiniMaxText, minimaxApiKey } from "./aiProviderTransport.js";
import { detectAiLanguage as detectAiLanguageWithRuntime, type AiLanguageDetectionInput } from "./aiLanguageDetection.js";
import { classifyAiIntent as classifyAiIntentWithRuntime, type AiIntentClassificationInput } from "./aiIntentClassification.js";
import { classifyAiContextualIntent as classifyAiContextualIntentWithRuntime, type AiContextualIntentClassificationInput, type AiContextualIntentResult } from "./aiContextualIntentClassification.js";
import { naturalizeStrictFlowText as naturalizeStrictFlowTextWithRuntime, sanitizeNaturalizedText, type AiNaturalizeStrictFlowInput } from "./aiStrictFlowNaturalization.js";
import { analyzeCustomerImage as analyzeCustomerImageWithRuntime, type AiImageAnalysis } from "./aiImageAnalysis.js";
import { aiProviderLabel, generateAiJson, generateAiText, hasUsableAiKey, selectedAiProvider } from "./aiProviderRuntime.js";

export type { AiProviderName, AiTextOptions, AiTextPart } from "./aiProviderTypes.js";
export type { AiImageAnalysis } from "./aiImageAnalysis.js";
export { deepseekApiKey, deepseekModel, minimaxApiKey, minimaxModel } from "./aiProviderTransport.js";
export { aiProviderLabel, generateAiJson, generateAiText, hasUsableAiKey, selectedAiProvider } from "./aiProviderRuntime.js";

export async function analyzeAiImage(config: AppConfig, imageUrl: string): Promise<AiImageAnalysis> {
  return analyzeCustomerImageWithRuntime(config, imageUrl, {
    selectedProvider: selectedAiProvider,
    hasMiniMaxKey: (runtimeConfig) => Boolean(minimaxApiKey(runtimeConfig)),
    generateMiniMaxText
  });
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

export { sanitizeNaturalizedText };
