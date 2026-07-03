import type { ConversationExportRecord } from "../repositories.js";

export type ConversationExportQuery = {
  merchantId?: string;
  countryId?: string;
  status?: string;
  handoffStatus?: string;
  language?: string;
  a2cAccountPhone?: string;
  customerPhone?: string;
  direction?: string;
  startAt?: string;
  endAt?: string;
  limit?: string;
  format?: "csv" | "jsonl";
};

export type NormalizedConversationExportQuery = ReturnType<typeof normalizeConversationExportQuery>;

export type ConversationExportFile = {
  contentType: string;
  filename: string;
  body: string;
};

export function normalizeConversationExportQuery(query: ConversationExportQuery) {
  const direction = query.direction === "inbound" || query.direction === "outbound" ? query.direction : undefined;
  const limit = query.limit ? Number(query.limit) : undefined;
  return {
    merchantId: cleanQueryValue(query.merchantId),
    countryId: cleanQueryValue(query.countryId),
    status: query.status === "active" || query.status === "human_handoff" ? query.status : undefined,
    handoffStatus: query.handoffStatus === "pending" || query.handoffStatus === "processing" || query.handoffStatus === "done" ? query.handoffStatus : undefined,
    language: cleanQueryValue(query.language),
    a2cAccountPhone: cleanQueryValue(query.a2cAccountPhone),
    customerPhone: cleanQueryValue(query.customerPhone),
    direction,
    startAt: cleanQueryValue(query.startAt),
    endAt: cleanQueryValue(query.endAt),
    limit: Number.isFinite(limit) ? limit : undefined
  };
}

export function buildConversationExportFile(rows: ConversationExportRecord[], format: string | undefined, prefix: string, now = new Date()): ConversationExportFile {
  const safeDate = formatBeijingDateTimeForFile(now);
  const beijingRows = rows.map((row) => ({ ...row, createdAt: formatBeijingDateTime(row.createdAt) }));
  if (format === "jsonl") {
    const body = beijingRows.map((row) => JSON.stringify(row)).join("\n");
    return {
      contentType: "application/x-ndjson; charset=utf-8",
      filename: `${prefix}-${safeDate}.jsonl`,
      body: body ? `${body}\n` : ""
    };
  }
  return {
    contentType: "text/csv; charset=utf-8",
    filename: `${prefix}-${safeDate}.csv`,
    body: `\uFEFF${conversationExportCsv(beijingRows)}`
  };
}

function cleanQueryValue(value?: string): string | undefined {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed : undefined;
}

function formatBeijingDateTime(value: string | Date): string {
  const date = normalizeDate(value);
  if (!date) return typeof value === "string" ? value : "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date).replace(/\//g, "-");
}

function formatBeijingDateTimeForFile(value: Date): string {
  return formatBeijingDateTime(value).replace(/[ :]/g, "-");
}

function normalizeDate(value: string | Date): Date | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)
    ? `${trimmed.replace(" ", "T")}Z`
    : trimmed;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

const CONVERSATION_EXPORT_COLUMNS: Array<{ key: keyof ConversationExportRecord; label: string }> = [
  { key: "createdAt", label: "消息时间" },
  { key: "merchantId", label: "商户ID" },
  { key: "countryName", label: "国家/市场" },
  { key: "countryCode", label: "国家代码" },
  { key: "conversationId", label: "会话ID" },
  { key: "customerPhone", label: "客户发送账号号码" },
  { key: "nickname", label: "客户昵称" },
  { key: "a2cAccountPhone", label: "A2C客服账号" },
  { key: "direction", label: "方向" },
  { key: "msgType", label: "消息类型" },
  { key: "content", label: "系统内容" },
  { key: "originalContent", label: "原文" },
  { key: "translatedContent", label: "中文译文" },
  { key: "operatorTranslatedContent", label: "客服译文" },
  { key: "messageLanguage", label: "消息语言" },
  { key: "intent", label: "意图" },
  { key: "conversationStage", label: "会话阶段" },
  { key: "flowStep", label: "流程步骤" },
  { key: "replyMode", label: "回复模式" },
  { key: "strictFlowStep", label: "严格流程步骤" },
  { key: "a2cSendStatus", label: "A2C发送状态" },
  { key: "a2cSendError", label: "A2C失败原因" },
  { key: "extractedPhone", label: "已识别手机号" },
  { key: "extractedTelegram", label: "已识别Telegram" },
  { key: "extractedWhatsApp", label: "已识别WhatsApp" },
  { key: "phoneDetected", label: "本条手机号" },
  { key: "telegramDetected", label: "本条Telegram" },
  { key: "whatsappDetected", label: "本条WhatsApp" },
  { key: "conversationStatus", label: "会话状态" },
  { key: "handoffStatus", label: "接管状态" },
  { key: "externalId", label: "外部消息ID" }
];

function conversationExportCsv(rows: ConversationExportRecord[]): string {
  return [
    CONVERSATION_EXPORT_COLUMNS.map((column) => csvCell(column.label)).join(","),
    ...rows.map((row) => CONVERSATION_EXPORT_COLUMNS.map((column) => csvCell(String(row[column.key] ?? ""))).join(","))
  ].join("\n");
}

function csvCell(value: string): string {
  const normalized = value.replace(/\r?\n/g, " ").replace(/\t/g, " ").trim();
  return `"${normalized.replaceAll("\"", "\"\"")}"`;
}
