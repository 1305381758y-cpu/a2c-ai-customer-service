import type { AppConfig } from "../config.js";
import type { AiTextOptions } from "./aiProviderTypes.js";

export interface AiLanguageDetectionInput {
  customerText: string;
  previousLanguage: string;
  countryDefaultLanguage: string;
  recentHistory: Array<{ direction: string; content: string; intent: string; createdAt: string }>;
}

export interface AiLanguageDetectionRuntime {
  hasUsableAiKey(config: AppConfig): boolean;
  generateText(config: AppConfig, contents: string, options: AiTextOptions): Promise<string>;
}

export async function detectAiLanguage(
  config: AppConfig,
  input: AiLanguageDetectionInput,
  runtime: AiLanguageDetectionRuntime
): Promise<string> {
  if (!runtime.hasUsableAiKey(config)) return "unknown";
  const text = input.customerText.trim();
  if (!text) return "unknown";
  try {
    const result = await runtime.generateText(config, JSON.stringify({
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
      taskType: "language_detection",
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
    return normalizeAiLanguageCode(result.trim());
  } catch {
    return "unknown";
  }
}

export function normalizeAiLanguageCode(value: string): string {
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
