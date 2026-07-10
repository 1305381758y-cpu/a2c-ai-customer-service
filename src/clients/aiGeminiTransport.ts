import { GoogleGenAI, type Part } from "@google/genai";

import type { AppConfig } from "../config.js";
import type { AiTextOptions, AiTextPart } from "./aiProviderTypes.js";

export type GeminiConfig = Pick<AppConfig, "GOOGLE_AI_API_KEY" | "GOOGLE_AI_MODEL">;

const GEMINI_TIMEOUT_MS = 15_000;

export function geminiApiKey(config: GeminiConfig): string {
  const value = config.GOOGLE_AI_API_KEY || "";
  return value === "CHANGE_ME" ? "" : value;
}

export function geminiModel(config: GeminiConfig): string {
  return config.GOOGLE_AI_MODEL || "gemini-2.5-flash";
}

export async function generateGeminiText(
  config: GeminiConfig,
  contents: string | AiTextPart[],
  options: AiTextOptions = {}
): Promise<string> {
  const apiKey = geminiApiKey(config);
  if (!apiKey) throw new Error("Google AI Studio Key 未配置");
  const client = new GoogleGenAI({ apiKey });
  const response = await client.models.generateContent({
    model: geminiModel(config),
    contents: contents as string | Part[],
    config: {
      abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      httpOptions: { timeout: GEMINI_TIMEOUT_MS },
      systemInstruction: options.systemInstruction,
      temperature: options.temperature ?? 0.2,
      maxOutputTokens: options.maxOutputTokens ?? 1200,
      thinkingConfig: { thinkingBudget: 0 }
    }
  });
  const text = response.text?.trim() || "";
  if (!text) throw new Error("Gemini 返回内容为空");
  return text;
}
