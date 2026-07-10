import { countryLabel } from "./countryFormatters.js";
import { DISPLAY_LABELS, LANGUAGE_NAMES, REPLY_MODE_LABELS, STATUS_TONE_VALUES } from "./displayLabelMaps.js";
import { formatDateTime } from "./timeFormatters.js";

export { COUNTRY_PRESETS, countryLabel, inferCountryProfile } from "./countryFormatters.js";
export { BEIJING_TIME_ZONE, formatConversationDate, formatDateTime, formatTime, getTimeDisplayMode, setTimeDisplayMode, timeDisplayModeLabel, timeZoneForCountry } from "./timeFormatters.js";
export type { TimeDisplayMode } from "./timeFormatters.js";

export function normalizeText(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function displayValue(column: string, value: unknown, row?: Record<string, unknown>) {
  if (typeof value === "boolean") return value ? "是" : "否";
  if (value === null || value === undefined || value === "") return "";
  if (column === "successRate") return `${value}%`;
  if (isDateTimeColumn(column)) return formatDateTime(String(value), row);
  if (["countryId", "countryName", "countryCode"].includes(column)) return countryLabel(value);
  if (["language", "defaultLanguage"].includes(column)) return languageName(String(value));
  if (["status", "enabled", "role", "actorRole", "action", "resourceType", "stage", "intent", "type", "sourceType", "handoffStatus", "msgType", "kind", "taskType", "provider", "flowStep", "nextFlowStep", "strictFlowStep", "replyMode", "suggestedIntent", "detectedIntent", "inferredIntent", "contextualIntent", "nextAction"].includes(column)) {
    const text = label(String(value));
    if (["status", "enabled", "handoffStatus", "stage", "intent"].includes(column)) return <span className={`status-pill ${statusTone(String(value))}`}>{text}</span>;
    return text;
  }
  return String(value);
}

const DATE_TIME_COLUMNS = new Set([
  "assignedAt",
  "assigned_at",
  "createdAt",
  "created_at",
  "finishedAt",
  "finished_at",
  "firstSeenAt",
  "first_seen_at",
  "lastMessageAt",
  "last_message_at",
  "lastCalledAt",
  "last_called_at",
  "lastFailedAt",
  "last_failed_at",
  "lastSeenAt",
  "last_seen_at",
  "pinnedAt",
  "pinned_at",
  "sentAt",
  "sent_at",
  "syncedAt",
  "synced_at",
  "updatedAt",
  "updated_at",
  "usedAt",
  "used_at"
]);

function isDateTimeColumn(column: string) {
  return DATE_TIME_COLUMNS.has(column);
}

export function localizeSystemText(value: unknown) {
  return String(value || "")
    .replace(/default:default/gi, "默认国家")
    .replace(/\bBrazil\b/gi, "巴西")
    .replace(/\bPhilippines\b/gi, "菲律宾")
    .replace(/\bJapan\b/gi, "日本")
    .replace(/\bMalaysia\b/gi, "马来西亚")
    .replace(/\bIndonesia\b/gi, "印尼")
    .replace(/\bneed_platform_register\b/g, label("need_platform_register"))
    .replace(/\bneed_phone_or_tg\b/g, label("need_phone_or_tg"))
    .replace(/\bready_for_handoff\b/g, label("ready_for_handoff"))
    .replace(/\bfirst_greeting\b/g, label("first_greeting"))
    .replace(/\binterest_screening\b/g, label("interest_screening"))
    .replace(/\bproject_intro\b/g, label("project_intro"))
    .replace(/\bregistration_intent\b/g, label("registration_intent"))
    .replace(/\bsend_register_link\b/g, label("send_register_link"))
    .replace(/\bwait_registration\b/g, label("wait_registration"))
    .replace(/\btelegram_confirm\b/g, label("telegram_confirm"))
    .replace(/\btelegram_download\b/g, label("telegram_download"))
    .replace(/\bcollect_telegram\b/g, label("collect_telegram"))
    .replace(/\bhuman_handoff\b/g, label("human_handoff"))
    .replace(/\bended\b/g, label("ended"))
    .replace(/\bstrict_flow\b/g, label("strict_flow"))
    .replace(/\bfallback\b/g, label("fallback"))
    .replace(/\bmanual\b/g, label("manual"))
    .replace(/\bai\b/g, label("ai"))
    .replace(/\bgemini\b/g, label("gemini"))
    .replace(/\btrust_concern\b/g, label("trust_concern"))
    .replace(/\birrelevant_or_spam\b/g, label("irrelevant_or_spam"))
    .replace(/\bgreeting\b/g, label("greeting"))
    .replace(/\bunknown\b/g, label("unknown"));
}

export function optionLabel(field: string, option: string) {
  if (field === "countryId" || field === "countryName" || field === "countryCode") return countryLabel(option);
  return label(option);
}

export function statusTone(value: string) {
  if (STATUS_TONE_VALUES.success.includes(value)) return "success";
  if (STATUS_TONE_VALUES.warning.includes(value)) return "warning";
  if (STATUS_TONE_VALUES.danger.includes(value)) return "danger";
  return "neutral";
}

export function translateSystemMessage(message: unknown) {
  const value = String(message || "");
  if (!value) return "";
  return value
    .replace(/invalid credentials/gi, "账号或密码错误")
    .replace(/A2C auth failed:/gi, "A2C认证失败：")
    .replace(/A2C send failed:/gi, "A2C发送失败：")
    .replace(/Visit too frequently, please try again later/gi, "访问过于频繁，请稍后再试")
    .replace(/A2C credentials are not configured/gi, "A2C配置未完成")
    .replace(/telegram bot token is required/gi, "请先填写TG机器人Token")
    .replace(/not found/gi, "未找到")
    .replace(/send failed/gi, "发送失败")
    .replace(/unknown/gi, "未知");
}

export function languageName(code: unknown) {
  return LANGUAGE_NAMES[String(code || "")] || String(code || "");
}

export function replyModeLabel(mode?: string) {
  return REPLY_MODE_LABELS[String(mode || "")] || "未记录";
}

export function label(key: string) {
  return DISPLAY_LABELS[key] || key;
}
