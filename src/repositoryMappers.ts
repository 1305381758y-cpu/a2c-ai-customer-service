import type { UserRole } from "./auth.js";
import type {
  CustomerRecord,
  IntentLearningEventRecord,
  UserRecord,
} from "./repositories.js";
import { parseJsonRecordArray } from "./repositoryJson.js";
import { booleanPatchValue } from "./repositoryPatchValues.js";

export {
  inviteCodeAccountMatches,
  normalizeInviteCodeStatus,
  phoneDigits
} from "./repositoryInviteCodes.js";

export {
  normalizeScriptFlowStep,
  normalizeScriptFlowStepValue
} from "./repositoryScriptFlowSteps.js";

export { booleanPatchValue } from "./repositoryPatchValues.js";

export {
  normalizeConversationReviewItemStatus,
  normalizeConversationReviewItemType,
  normalizeConversationReviewStatus,
  normalizeKnowledgeType,
  normalizeReviewSampleStage,
  normalizeScriptFlowStatus,
  normalizeTelegramBindingStatus
} from "./repositoryStatuses.js";

export {
  buildCustomerMemorySummary,
  clipText,
  parseJsonArray,
  parseJsonObject,
  parseJsonRecordArray
} from "./repositoryJson.js";

export { mapConversation, mapConversationExportRecord, mapConversationMessage, mapCustomerMemory } from "./repositoryConversationMappers.js";
export {
  mapA2CInviteCode,
  mapMerchant,
  mapMerchantA2CAccount,
  mapMerchantAgentProfile,
  mapMerchantConfig,
  mapMerchantCountry
} from "./repositoryMerchantMappers.js";
export { mapKnowledgeItem, mapTrainingMaterial, mapTrainingMaterialItem } from "./repositoryTrainingMappers.js";
export { mapScriptFlow, mapScriptFlowStep, mapScriptFlowVersion } from "./repositoryScriptFlowMappers.js";
export { mapConversationReview, mapConversationReviewItem } from "./repositoryReviewMappers.js";

export function mapIntentLearningEvent(row: Record<string, unknown>): IntentLearningEventRecord {
  return {
    id: Number(row.id ?? 0),
    merchantId: String(row.merchant_id ?? "default"),
    countryId: String(row.country_id ?? ""),
    conversationId: String(row.conversation_id ?? ""),
    messageId: row.message_id === null || row.message_id === undefined ? null : Number(row.message_id),
    candidateKey: String(row.candidate_key ?? ""),
    suggestedIntent: String(row.suggested_intent ?? "custom_unknown"),
    displayName: String(row.display_name ?? ""),
    description: String(row.description ?? ""),
    customerText: String(row.customer_text ?? ""),
    language: String(row.language ?? "unknown"),
    detectedIntent: String(row.detected_intent ?? "unknown"),
    inferredIntent: String(row.inferred_intent ?? "unknown"),
    contextualIntent: String(row.contextual_intent ?? "unknown"),
    flowStep: String(row.flow_step ?? ""),
    status: String(row.status ?? "candidate") as IntentLearningEventRecord["status"],
    occurrenceCount: Number(row.occurrence_count ?? 0),
    examples: parseJsonRecordArray(row.examples_json),
    lastSeenAt: String(row.last_seen_at ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

export function mapUser(row: Record<string, unknown>): UserRecord {
  return {
    id: String(row.id),
    merchantId: row.merchant_id ? String(row.merchant_id) : null,
    email: String(row.email),
    name: String(row.name),
    passwordHash: String(row.password_hash),
    role: String(row.role) as UserRole,
    status: String(row.status ?? "active") as "active" | "disabled"
  };
}

export function mapCustomer(row: Record<string, unknown>): CustomerRecord {
  const merchantId = String(row.merchant_id ?? "default");
  return {
    id: Number(row.id),
    merchantId,
    countryId: String(row.country_id ?? `${merchantId}:default`),
    countryCode: String(row.country_code ?? "default"),
    countryName: String(row.country_name ?? "默认国家"),
    customerKey: String(row.customer_key ?? ""),
    nickname: String(row.nickname ?? ""),
    firstA2CAccountPhone: String(row.first_a2c_account_phone ?? ""),
    lastA2CAccountPhone: String(row.last_a2c_account_phone ?? ""),
    language: String(row.language ?? "unknown"),
    stage: String(row.stage ?? "need_platform_register"),
    extractedPhone: String(row.extracted_phone ?? ""),
    extractedTelegram: String(row.extracted_telegram ?? ""),
    extractedWhatsApp: String(row.extracted_whatsapp ?? ""),
    status: String(row.status ?? "active") as "active" | "human_handoff",
    conversationCount: Number(row.conversation_count ?? 0),
    lastConversationId: String(row.last_conversation_id ?? ""),
    firstSeenAt: String(row.first_seen_at ?? ""),
    lastSeenAt: String(row.last_seen_at ?? "")
  };
}
