import type { Conversation } from "./repositoryTypes.js";

export function parseJsonObject(value: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(value || "{}")) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function parseJsonArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value || "[]")) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

export function parseJsonRecordArray(value: unknown): Array<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(String(value || "[]")) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
      : [];
  } catch {
    return [];
  }
}

export function clipText(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

export function buildCustomerMemorySummary(conversation: Conversation, lastIntent: string, operatorNotes: string): string {
  const parts = [
    `客户语言: ${conversation.language || "unknown"}`,
    `国家: ${conversation.countryName || conversation.countryCode || "默认国家"}`,
    `当前阶段: ${conversation.stage}`,
    `最近意图: ${lastIntent || "unknown"}`,
    `手机号: ${conversation.extractedPhone || "未识别"}`,
    `Telegram: ${conversation.extractedTelegram || "未识别"}`,
    `WhatsApp: ${conversation.extractedWhatsApp || "未识别"}`
  ];
  if (operatorNotes.trim()) parts.push(`人工备注: ${clipText(operatorNotes.trim(), 220)}`);
  return parts.join("；");
}
