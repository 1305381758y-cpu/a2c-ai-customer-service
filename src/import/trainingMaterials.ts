import type { Part } from "@google/genai";
import mammoth from "mammoth";
import { generateGeminiText } from "../clients/gemini.js";
import { parseTrainingSamples, type ImportedTrainingSample } from "./trainingSamples.js";

export type TrainingMaterialSourceType = "csv" | "xlsx" | "docx" | "txt" | "image";

export interface ParsedTrainingMaterial {
  sourceType: TrainingMaterialSourceType;
  rawText: string;
  samples: ImportedTrainingSample[];
  knowledge: Array<{
    type: "script";
    title: string;
    content: string;
    language: string;
    priority: number;
    enabled: boolean;
  }>;
  warnings: string[];
}

export async function parseTrainingMaterial(input: {
  buffer: Buffer;
  filename: string;
  mimeType?: string;
  googleAiApiKey?: string;
  googleAiModel?: string;
}): Promise<ParsedTrainingMaterial> {
  const sourceType = detectSourceType(input.filename, input.mimeType);
  const warnings: string[] = [];

  if (sourceType === "csv" || sourceType === "xlsx") {
    const samples = await parseTrainingSamples(input.buffer, input.filename);
    const rawText = input.buffer.toString("utf8");
    if (samples.length) {
      return { sourceType, rawText: clipRawText(rawText), samples, knowledge: [], warnings };
    }
    warnings.push("未识别到客户消息/标准回复字段，已按普通文本话术导入知识库");
    return buildTextMaterial(sourceType, input.filename, rawText, warnings);
  }

  if (sourceType === "docx") {
    const result = await mammoth.extractRawText({ buffer: input.buffer });
    warnings.push(...result.messages.map((message) => message.message).filter(Boolean));
    return buildTextMaterial(sourceType, input.filename, result.value, warnings);
  }

  if (sourceType === "image") {
    const text = await extractImageText(input.buffer, input.filename, input.mimeType, input.googleAiApiKey, input.googleAiModel, warnings);
    return buildTextMaterial(sourceType, input.filename, text, warnings);
  }

  return buildTextMaterial(sourceType, input.filename, input.buffer.toString("utf8"), warnings);
}

function buildTextMaterial(sourceType: TrainingMaterialSourceType, filename: string, rawText: string, warnings: string[]): ParsedTrainingMaterial {
  const paragraphs = splitParagraphs(rawText);
  if (!paragraphs.length) warnings.push("未提取到可用文本，素材已记录但不会生成样本或知识");
  const knowledge = paragraphs.map((content, index) => ({
    type: "script" as const,
    title: `${filename} #${index + 1}`,
    content,
    language: detectLanguage(content),
    priority: 0,
    enabled: true
  }));
  return {
    sourceType,
    rawText: clipRawText(rawText),
    samples: [],
    knowledge,
    warnings
  };
}

function detectSourceType(filename: string, mimeType = ""): TrainingMaterialSourceType {
  const name = filename.toLowerCase();
  const mime = mimeType.toLowerCase();
  if (name.endsWith(".csv") || mime.includes("csv")) return "csv";
  if (name.endsWith(".xlsx") || name.endsWith(".xls") || mime.includes("spreadsheet") || mime.includes("excel")) return "xlsx";
  if (name.endsWith(".docx") || mime.includes("wordprocessingml")) return "docx";
  if (mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name)) return "image";
  return "txt";
}

async function extractImageText(
  buffer: Buffer,
  filename: string,
  mimeType = "",
  googleAiApiKey = "",
  googleAiModel = "gemini-2.5-flash",
  warnings: string[]
): Promise<string> {
  const name = filename.toLowerCase();
  const source = buffer.toString("utf8");
  if (name.endsWith(".svg") || mimeType.includes("svg")) {
    const text = source
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
    if (text) return text;
  }

  if (!googleAiApiKey) {
    warnings.push("图片 OCR 需要配置商户 Google AI Studio Key；当前图片未提取到文字");
    return "";
  }

  const mediaType = mimeType || guessImageMime(filename);
  const contents: Part[] = [
    { inlineData: { mimeType: mediaType, data: buffer.toString("base64") } },
    { text: "请只提取图片中的全部可读文字，保持原语言和换行，不要解释。" }
  ];
  return generateGeminiText({ GOOGLE_AI_API_KEY: googleAiApiKey, GOOGLE_AI_MODEL: googleAiModel }, contents);
}

function guessImageMime(filename: string): string {
  const name = filename.toLowerCase();
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".svg")) return "image/svg+xml";
  return "image/png";
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}|\r\n{2,}/)
    .flatMap((part) => part.split(/\n(?=\s*(?:[-*]|\d+[.)]|[A-Za-z\u4e00-\u9fa5].{0,16}[：:]))/))
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 8)
    .slice(0, 300);
}

function detectLanguage(text: string): string {
  if (/[ãõçáéíóúâêô]/i.test(text)) return "pt-BR";
  if (/[\u0E00-\u0E7F]/.test(text)) return "th";
  if (/[àạảãáâầấậẩẫăằắặẳẵèẹẻẽéêềếệểễìịỉĩíòọỏõóôồốộổỗơờớợởỡùụủũúưừứựửữỳỵỷỹýđ]/i.test(text)) return "vi";
  if (/[\u4e00-\u9fa5]/.test(text)) return "zh";
  return "en";
}

function clipRawText(text: string): string {
  const normalized = text.replace(/\u0000/g, "").trim();
  return normalized.length > 20000 ? `${normalized.slice(0, 20000)}...` : normalized;
}
