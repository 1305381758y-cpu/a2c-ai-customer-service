import type { AppConfig } from "../config.js";
import type { AiProviderName, AiTextOptions, AiTextPart } from "./aiProviderTypes.js";

export interface AiTrainingImageTextInput {
  buffer: Buffer;
  filename: string;
  mimeType?: string;
}

export interface AiTrainingImageTextResult {
  text: string;
  status: "ok" | "skipped" | "failed";
  error?: string;
}

export interface AiTrainingImageTextRuntime {
  hasMiniMaxKey(config: AppConfig): boolean;
  hasGeminiKey(config: AppConfig): boolean;
  generateText(config: AppConfig, contents: string | AiTextPart[], options?: AiTextOptions): Promise<string>;
}

export async function extractTrainingImageTextWithAi(
  config: AppConfig,
  input: AiTrainingImageTextInput,
  runtime: AiTrainingImageTextRuntime
): Promise<AiTrainingImageTextResult> {
  const hasMiniMax = runtime.hasMiniMaxKey(config);
  const hasGemini = runtime.hasGeminiKey(config);
  if (!hasMiniMax && !hasGemini) {
    return { text: "", status: "skipped", error: "图片 OCR 需要配置支持图片的 MiniMax 或 Gemini Key；当前图片未提取到文字" };
  }

  const imageProvider = chooseTrainingImageProvider(config, hasMiniMax, hasGemini);
  const contents: AiTextPart[] = [
    { inlineData: { mimeType: input.mimeType || guessImageMime(input.filename), data: input.buffer.toString("base64") } },
    { text: "请只提取图片中的全部可读文字，保持原语言和换行，不要解释。" }
  ];

  try {
    const text = await runtime.generateText({ ...config, AI_PROVIDER: imageProvider }, contents);
    return text.trim() ? { text, status: "ok" } : { text: "", status: "skipped", error: "图片 OCR 未提取到可读文字" };
  } catch (error) {
    return { text: "", status: "failed", error: error instanceof Error ? error.message : "图片 OCR 失败" };
  }
}

export function chooseTrainingImageProvider(
  config: Pick<AppConfig, "AI_PROVIDER">,
  hasMiniMax: boolean,
  hasGemini: boolean
): AiProviderName {
  if (config.AI_PROVIDER === "gemini" && hasGemini) return "gemini";
  return hasMiniMax ? "minimax" : "gemini";
}

function guessImageMime(filename: string): string {
  const name = filename.toLowerCase();
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".svg")) return "image/svg+xml";
  return "image/png";
}
