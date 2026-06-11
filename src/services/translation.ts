import OpenAI from "openai";
import type { AppConfig } from "../config.js";

export interface TranslationResult {
  originalText: string;
  translatedText: string;
  targetLanguage: string;
}

export async function translateForCustomer(config: AppConfig, text: string, targetLanguage: string): Promise<TranslationResult> {
  const originalText = text.trim();
  const language = targetLanguage || "unknown";
  const apiKey = config.OPENAI_API_KEY === "CHANGE_ME" ? "" : config.OPENAI_API_KEY;
  if (!originalText || !apiKey || language === "unknown") {
    return { originalText, translatedText: originalText, targetLanguage: language };
  }

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model: config.OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: "Translate the user's customer-service message into the target language. Preserve URLs, usernames, phone numbers, amounts, platform names, and placeholders exactly. Return only the translated message."
        },
        {
          role: "user",
          content: JSON.stringify({ targetLanguage: language, text: originalText })
        }
      ]
    });
    const translatedText = response.output_text.trim() || originalText;
    return { originalText, translatedText, targetLanguage: language };
  } catch {
    return { originalText, translatedText: originalText, targetLanguage: language };
  }
}
