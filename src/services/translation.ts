import type { AppConfig } from "../config.js";
import { aiProviderLabel, hasUsableAiKey } from "../clients/aiProvider.js";
import { AiTasks } from "./aiTasks.js";

export interface TranslationResult {
  originalText: string;
  translatedText: string;
  targetLanguage: string;
  status: "translated" | "skipped" | "failed";
  error?: string;
}

export type TranslationAiTasks = Pick<AiTasks, "translateText">;

const OPERATOR_LANGUAGE = "zh-CN";

export async function translateForCustomer(config: AppConfig, text: string, targetLanguage: string, ai: TranslationAiTasks = new AiTasks()): Promise<TranslationResult> {
  return translateText(
    config,
    text,
    targetLanguage || "unknown",
    "Translate the user's customer-service message into the target language. Preserve URLs, usernames, phone numbers, amounts, platform names, and placeholders exactly. Return only the translated message.",
    ai
  );
}

export async function translateForOperator(config: AppConfig, text: string, sourceLanguage: string, ai: TranslationAiTasks = new AiTasks()): Promise<TranslationResult> {
  const language = sourceLanguage || "unknown";
  if (language === "zh" || language === "zh-CN" || language === "cn") {
    const originalText = text.trim();
    return { originalText, translatedText: originalText, targetLanguage: OPERATOR_LANGUAGE, status: "skipped", error: "客户消息已经是中文" };
  }
  const local = localOperatorTranslation(text, language);
  if (local) {
    return { originalText: text.trim(), translatedText: local, targetLanguage: OPERATOR_LANGUAGE, status: "translated" };
  }
  return translateText(
    config,
    text,
    OPERATOR_LANGUAGE,
    "Translate the customer's incoming message into Simplified Chinese for a customer-service operator. Preserve URLs, usernames, phone numbers, amounts, platform names, and placeholders exactly. Return only the translation.",
    ai
  );
}

async function translateText(config: AppConfig, text: string, targetLanguage: string, systemPrompt: string, ai: TranslationAiTasks): Promise<TranslationResult> {
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
    const translatedText = normalizeTranslatedText(await ai.translateText(config, { targetLanguage: language, text: originalText, systemPrompt })) || originalText;
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

function normalizeTranslatedText(value: string): string {
  const trimmed = value.trim();
  const jsonText = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (!jsonText.startsWith("{")) return trimmed;
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    for (const key of ["translatedText", "translation", "translated_text", "text", "content"]) {
      if (typeof parsed[key] === "string" && parsed[key].trim()) return parsed[key].trim();
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}

function normalizeForCompare(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function localOperatorTranslation(text: string, sourceLanguage: string): string {
  const originalText = text.trim();
  const normalized = originalText
    .toLocaleLowerCase()
    .replace(/[。.!?！？,，;；:：]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const language = sourceLanguage.trim().toLocaleLowerCase();
  const spanishDictionary: Record<string, string> = {
    "hola": "你好",
    "informacion": "信息",
    "información": "信息",
    "info": "信息",
    "x favor": "请问",
    "x fa": "请问",
    "xfa": "请问",
    "porfa": "请问",
    "por favor": "请问",
    "si": "是的",
    "sí": "是的",
    "claro": "当然",
    "dale": "好的",
    "ok": "好的",
    "gracias": "谢谢"
  };
  const portugueseDictionary: Record<string, string> = {
    "oi": "你好",
    "olá": "你好",
    "ola": "你好",
    "bom dia": "早上好",
    "sim": "是的",
    "não": "不",
    "nao": "不",
    "tenho": "我有",
    "tenho sim": "我有",
    "estou disponível": "我现在有空",
    "estou disponivel": "我现在有空",
    "estou livre": "我现在有空",
    "podemos continuar": "我们可以继续",
    "pode continuar": "可以继续",
    "pronto": "好了",
    "o cadastro deu certo": "注册成功了",
    "obrigado": "谢谢",
    "obrigada": "谢谢"
  };
  if (language === "es" || language.startsWith("es-") || spanishDictionary[normalized]) {
    if (spanishDictionary[normalized]) return spanishDictionary[normalized];
  }
  if (language === "pt" || language.startsWith("pt-") || portugueseDictionary[normalized]) {
    if (portugueseDictionary[normalized]) return portugueseDictionary[normalized];
  }
  return "";
}
