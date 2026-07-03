import type { ConversationStage } from "./domain/intents.js";
import { parseJsonObject } from "./repositoryJson.js";
import type {
  Conversation,
  ConversationExportRecord,
  ConversationMessageRecord,
  CustomerMemoryRecord
} from "./repositoryTypes.js";

export function mapConversation(row: Record<string, unknown>): Conversation {
  return {
    id: String(row.id),
    merchantId: String(row.merchant_id ?? "default"),
    countryId: String(row.country_id ?? `${String(row.merchant_id ?? "default")}:default`),
    countryCode: String(row.country_code ?? "default"),
    countryName: String(row.country_name ?? "默认国家"),
    customerPhone: String(row.customer_phone),
    a2cAccountPhone: String(row.a2c_account_phone),
    nickname: String(row.nickname ?? ""),
    language: String(row.language ?? "unknown"),
    stage: String(row.stage ?? "need_platform_register") as ConversationStage,
    flowStep: String(row.flow_step ?? ""),
    extractedPhone: String(row.extracted_phone ?? ""),
    extractedTelegram: String(row.extracted_telegram ?? ""),
    extractedWhatsApp: String(row.extracted_whatsapp ?? ""),
    status: String(row.status ?? "active") as "active" | "human_handoff",
    handoffStatus: String(row.handoff_status ?? "pending") as "pending" | "processing" | "done",
    handoffNotified: Number(row.handoff_notified ?? 0),
    unreadCount: Number(row.unread_count ?? 0),
    pinnedAt: String(row.pinned_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

export function mapConversationMessage(row: Record<string, unknown>): ConversationMessageRecord {
  return {
    id: Number(row.id ?? 0),
    direction: String(row.direction),
    content: String(row.content ?? ""),
    msgType: String(row.msg_type ?? "text"),
    language: String(row.language ?? "unknown"),
    intent: String(row.intent ?? "unknown"),
    rawPayload: parseJsonObject(row.raw_payload),
    createdAt: String(row.created_at ?? "")
  };
}

export function mapConversationExportRecord(row: Record<string, unknown>): ConversationExportRecord {
  const rawPayload = parseJsonObject(row.raw_payload);
  return {
    merchantId: String(row.merchant_id ?? "default"),
    countryId: String(row.country_id ?? ""),
    countryCode: String(row.country_code ?? "default"),
    countryName: String(row.country_name ?? "默认国家"),
    conversationId: String(row.conversation_id ?? ""),
    customerPhone: String(row.customer_phone ?? ""),
    nickname: String(row.nickname ?? ""),
    a2cAccountPhone: String(row.a2c_account_phone ?? ""),
    conversationLanguage: String(row.conversation_language ?? "unknown"),
    conversationStage: String(row.conversation_stage ?? ""),
    flowStep: String(row.flow_step ?? ""),
    conversationStatus: String(row.conversation_status ?? ""),
    handoffStatus: String(row.handoff_status ?? ""),
    extractedPhone: String(row.extracted_phone ?? ""),
    extractedTelegram: String(row.extracted_telegram ?? ""),
    extractedWhatsApp: String(row.extracted_whatsapp ?? ""),
    messageId: Number(row.message_id ?? 0),
    direction: String(row.direction ?? ""),
    msgType: String(row.msg_type ?? "text"),
    messageLanguage: String(row.message_language ?? "unknown"),
    intent: String(row.intent ?? "unknown"),
    content: String(row.content ?? ""),
    originalContent: String(rawPayload.originalContent ?? row.content ?? ""),
    translatedContent: String(rawPayload.translatedContent ?? ""),
    targetLanguage: String(rawPayload.targetLanguage ?? ""),
    operatorTranslatedContent: String(rawPayload.operatorTranslatedContent ?? ""),
    replyMode: String(rawPayload.replyMode ?? ""),
    strictFlowStep: String(rawPayload.strictFlowStep ?? ""),
    a2cSendStatus: String(rawPayload.a2cSendStatus ?? ""),
    a2cSendError: String(rawPayload.a2cSendError ?? ""),
    phoneDetected: String(row.phone_detected ?? ""),
    telegramDetected: String(row.telegram_detected ?? ""),
    whatsappDetected: String(rawPayload.whatsappDetected ?? ""),
    externalId: String(row.external_id ?? ""),
    createdAt: String(row.created_at ?? "")
  };
}

export function mapCustomerMemory(row: Record<string, unknown>): CustomerMemoryRecord {
  const merchantId = String(row.merchant_id ?? "default");
  return {
    id: Number(row.id),
    merchantId,
    countryId: String(row.country_id ?? `${merchantId}:default`),
    countryCode: String(row.country_code ?? "default"),
    countryName: String(row.country_name ?? "默认国家"),
    customerKey: String(row.customer_key ?? ""),
    conversationId: String(row.conversation_id ?? ""),
    language: String(row.language ?? "unknown"),
    stage: String(row.stage ?? "need_platform_register"),
    extractedPhone: String(row.extracted_phone ?? ""),
    extractedTelegram: String(row.extracted_telegram ?? ""),
    extractedWhatsApp: String(row.extracted_whatsapp ?? ""),
    lastIntent: String(row.last_intent ?? "unknown"),
    summary: String(row.summary ?? ""),
    facts: parseJsonObject(row.facts_json),
    operatorNotes: String(row.operator_notes ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}
