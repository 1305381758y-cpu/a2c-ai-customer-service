import type { AppConfig } from "../config.js";
import type { AiTextOptions, AiTextPart } from "./aiProviderTypes.js";

export interface AiTranslationInput {
  text: string;
  targetLanguage: string;
  systemPrompt: string;
}

export interface AiTranslationRuntime {
  generateText(config: AppConfig, contents: string | AiTextPart[], options: AiTextOptions): Promise<string>;
}

export async function translateTextWithAi(
  config: AppConfig,
  input: AiTranslationInput,
  runtime: AiTranslationRuntime
): Promise<string> {
  return runtime.generateText(config, JSON.stringify({
    targetLanguage: input.targetLanguage,
    text: input.text
  }), {
    taskType: "translation",
    systemInstruction: input.systemPrompt
  });
}
