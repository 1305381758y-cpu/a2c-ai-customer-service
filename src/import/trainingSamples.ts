import { parse } from "csv-parse/sync";
import readXlsxFile from "read-excel-file/node";
import { isIntentLabel, type ConversationStage, type IntentLabel } from "../domain/intents.js";

export interface ImportedTrainingSample {
  customerMessage: string;
  standardReply: string;
  stage: ConversationStage | "";
  intent: IntentLabel | "unknown";
  language: string;
  keywords: string;
  priority: number;
  enabled: boolean;
}

const headerMap: Record<string, keyof ImportedTrainingSample> = {
  "客户消息": "customerMessage",
  "customerMessage": "customerMessage",
  "question": "customerMessage",
  "标准回复": "standardReply",
  "standardReply": "standardReply",
  "answer": "standardReply",
  "适用阶段": "stage",
  "stage": "stage",
  "客户意图": "intent",
  "intent": "intent",
  "语言": "language",
  "language": "language",
  "关键词": "keywords",
  "keywords": "keywords",
  "优先级": "priority",
  "priority": "priority",
  "是否启用": "enabled",
  "enabled": "enabled"
};

export async function parseTrainingSamples(buffer: Buffer, filename: string): Promise<ImportedTrainingSample[]> {
  const rows = filename.toLowerCase().endsWith(".csv")
    ? parseCsvRows(buffer)
    : await parseExcelRows(buffer);
  return rows.map(normalizeRow).filter((row) => row.customerMessage && row.standardReply);
}

function parseCsvRows(buffer: Buffer): Record<string, unknown>[] {
  return parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true
  }) as Record<string, unknown>[];
}

async function parseExcelRows(buffer: Buffer): Promise<Record<string, unknown>[]> {
  const sheetRows = await readXlsxFile(buffer);
  const headers = (sheetRows[0] ?? []).map((value) => String(value ?? "").trim());
  return sheetRows.slice(1).map((row) => {
    const item: Record<string, unknown> = {};
    row.forEach((value, index) => {
      const header = headers[index];
      if (header) item[header] = value ?? "";
    });
    return item;
  });
}

function normalizeRow(row: Record<string, unknown>): ImportedTrainingSample {
  const normalized: Partial<Record<keyof ImportedTrainingSample, unknown>> = {};
  for (const [header, value] of Object.entries(row)) {
    const key = headerMap[header.trim()];
    if (key) normalized[key] = value;
  }

  const intent = String(normalized.intent || "unknown").trim();
  return {
    customerMessage: String(normalized.customerMessage || "").trim(),
    standardReply: String(normalized.standardReply || "").trim(),
    stage: String(normalized.stage || "").trim() as ConversationStage | "",
    intent: isIntentLabel(intent) ? intent : "unknown",
    language: String(normalized.language || "zh").trim(),
    keywords: String(normalized.keywords || "").trim(),
    priority: Number(normalized.priority || 0),
    enabled: parseEnabled(normalized.enabled)
  };
}

function parseEnabled(value: unknown): boolean {
  const text = String(value ?? "是").trim().toLowerCase();
  return !["否", "false", "0", "no", "disabled", "停用"].includes(text);
}
