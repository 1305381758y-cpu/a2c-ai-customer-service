import type { AppConfig } from "../config.js";
import { aiProviderLabel, generateAiText, hasUsableAiKey } from "../clients/aiProvider.js";

export interface TranslationResult {
  originalText: string;
  translatedText: string;
  targetLanguage: string;
  status: "translated" | "skipped" | "failed";
  error?: string;
}

const OPERATOR_LANGUAGE = "zh-CN";

export async function translateForCustomer(config: AppConfig, text: string, targetLanguage: string): Promise<TranslationResult> {
  return translateText(
    config,
    text,
    targetLanguage || "unknown",
    "Translate the user's customer-service message into the target language. Preserve URLs, usernames, phone numbers, amounts, platform names, and placeholders exactly. Return only the translated message."
  );
}

export async function translateForOperator(config: AppConfig, text: string, sourceLanguage: string): Promise<TranslationResult> {
  const language = sourceLanguage || "unknown";
  if (language === "zh" || language === "zh-CN" || language === "cn") {
    const originalText = text.trim();
    return { originalText, translatedText: originalText, targetLanguage: OPERATOR_LANGUAGE, status: "skipped", error: "客户消息已经是中文" };
  }
  return translateText(
    config,
    text,
    OPERATOR_LANGUAGE,
    "Translate the customer's incoming message into Simplified Chinese for a customer-service operator. Preserve URLs, usernames, phone numbers, amounts, platform names, and placeholders exactly. Return only the translation."
  );
}

async function translateText(config: AppConfig, text: string, targetLanguage: string, systemPrompt: string): Promise<TranslationResult> {
  const originalText = text.trim();
  const language = targetLanguage || "unknown";
  const hasKey = hasUsableAiKey(config);
  if (!originalText || !hasKey || language === "unknown") {
    return {
      originalText,
      translatedText: originalText,
      targetLanguage: language,
      status: "skipped",
      error: !hasKey ? `${aiProviderLabel(config)} Key 未配置，无法生成译文` : language === "unknown" ? "客户语言未知，无法确定翻译目标语言" : "内容为空"
    };
  }

  try {
    const translatedText = (await generateAiText(config, JSON.stringify({ targetLanguage: language, text: originalText }), { systemInstruction: systemPrompt })).trim() || originalText;
    const sameAsOriginal = normalizeForCompare(translatedText) === normalizeForCompare(originalText);
    return {
      originalText,
      translatedText,
      targetLanguage: language,
      status: sameAsOriginal ? "failed" : "translated",
      error: sameAsOriginal ? `译文与原文相同，请检查 ${aiProviderLabel(config)} Key、模型或翻译能力` : undefined
    };
  } catch (error) {
    return {
      originalText,
      translatedText: originalText,
      targetLanguage: language,
      status: "failed",
      error: error instanceof Error ? error.message : "翻译失败"
    };
  }
}

function normalizeForCompare(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}
