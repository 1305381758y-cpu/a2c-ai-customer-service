export type AiProviderName = "minimax" | "gemini" | "deepseek";

export interface AiTextPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

export interface AiTextOptions {
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
}
