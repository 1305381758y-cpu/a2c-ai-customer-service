import type { ConversationStage } from "./domain/intents.js";
import type {
  ConversationReviewItemRecord,
  ConversationReviewRecord,
  KnowledgeItemRecord,
  MerchantConfigRecord,
  ScriptFlowRecord
} from "./repositoryTypes.js";

export function normalizeKnowledgeType(value: unknown): KnowledgeItemRecord["type"] {
  return value === "script" || value === "rule" || value === "forbidden" || value === "faq" ? value : "faq";
}

export function normalizeScriptFlowStatus(value: unknown): ScriptFlowRecord["status"] {
  return value === "active" || value === "disabled" || value === "draft" ? value : "draft";
}

export function normalizeTelegramBindingStatus(value: unknown): MerchantConfigRecord["telegramHandoffChatStatus"] {
  return value === "waiting" || value === "bound" || value === "invalid" || value === "unbound" ? value : "unbound";
}

export function normalizeConversationReviewStatus(value: unknown): ConversationReviewRecord["status"] {
  return value === "draft" || value === "ready" || value === "applied" ? value : "ready";
}

export function normalizeConversationReviewItemType(value: unknown): ConversationReviewItemRecord["itemType"] {
  return value === "sample" || value === "knowledge" ? value : "knowledge";
}

export function normalizeConversationReviewItemStatus(value: unknown): ConversationReviewItemRecord["status"] {
  return value === "applied" || value === "ignored" || value === "candidate" ? value : "candidate";
}

export function normalizeReviewSampleStage(value: unknown): ConversationStage {
  const text = String(value || "");
  if (text === "need_tg_register" || text === "need_phone_or_tg" || text === "ready_for_handoff" || text === "need_platform_register") return text;
  return "need_platform_register";
}
