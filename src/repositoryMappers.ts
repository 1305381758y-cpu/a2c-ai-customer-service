import type { UserRole } from "./auth.js";
import type {
  ConversationReviewItemRecord,
  ConversationReviewRecord,
  CustomerRecord,
  IntentLearningEventRecord,
  KnowledgeItemRecord,
  ScriptFlowRecord,
  ScriptFlowStepRecord,
  ScriptFlowVersionRecord,
  TrainingMaterialItemRecord,
  TrainingMaterialRecord,
  UserRecord,
} from "./repositories.js";
import { parseJsonArray, parseJsonRecordArray } from "./repositoryJson.js";
import { booleanPatchValue } from "./repositoryPatchValues.js";
import {
  normalizeConversationReviewItemStatus,
  normalizeConversationReviewItemType,
  normalizeConversationReviewStatus,
  normalizeKnowledgeType,
  normalizeScriptFlowStatus
} from "./repositoryStatuses.js";

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

export function mapConversationReview(row: Record<string, unknown>): ConversationReviewRecord {
  return {
    id: Number(row.id ?? 0),
    merchantId: String(row.merchant_id ?? "default"),
    conversationId: String(row.conversation_id ?? ""),
    score: Number(row.score ?? 0),
    goalCompleted: Boolean(Number(row.goal_completed ?? 0)),
    summary: String(row.summary ?? ""),
    mainConcerns: parseJsonArray(row.main_concerns_json),
    mistakes: parseJsonArray(row.mistakes_json),
    goodReplies: parseJsonArray(row.good_replies_json),
    suggestedSamples: parseJsonRecordArray(row.suggested_samples_json),
    suggestedKnowledge: parseJsonRecordArray(row.suggested_knowledge_json),
    improvementActions: parseJsonArray(row.improvement_actions_json),
    status: normalizeConversationReviewStatus(row.status),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

export function mapConversationReviewItem(row: Record<string, unknown>): ConversationReviewItemRecord {
  return {
    id: Number(row.id ?? 0),
    reviewId: Number(row.review_id ?? 0),
    merchantId: String(row.merchant_id ?? "default"),
    conversationId: String(row.conversation_id ?? ""),
    itemType: normalizeConversationReviewItemType(row.item_type),
    title: String(row.title ?? ""),
    content: String(row.content ?? ""),
    status: normalizeConversationReviewItemStatus(row.status),
    appliedTargetType: String(row.applied_target_type ?? ""),
    appliedTargetId: String(row.applied_target_id ?? ""),
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

export function mapKnowledgeItem(row: Record<string, unknown>): KnowledgeItemRecord {
  return {
    id: Number(row.id),
    merchantId: String(row.merchant_id ?? "default"),
    countryId: String(row.country_id ?? `${String(row.merchant_id ?? "default")}:default`),
    type: normalizeKnowledgeType(row.type),
    title: String(row.title ?? ""),
    content: String(row.content ?? ""),
    language: String(row.language ?? "zh"),
    priority: Number(row.priority ?? 0),
    enabled: Boolean(Number(row.enabled ?? 1))
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


export function mapTrainingMaterial(row: Record<string, unknown>): TrainingMaterialRecord {
  const merchantId = String(row.merchant_id ?? "default");
  return {
    id: Number(row.id),
    merchantId,
    countryId: String(row.country_id ?? `${merchantId}:default`),
    countryCode: String(row.country_code ?? "default"),
    countryName: String(row.country_name ?? "默认国家"),
    sourceType: String(row.source_type ?? "txt"),
    filename: String(row.filename ?? ""),
    mimeType: String(row.mime_type ?? ""),
    status: String(row.status ?? "enabled") as "enabled" | "disabled",
    rawText: String(row.raw_text ?? ""),
    itemCount: Number(row.item_count ?? 0),
    sampleCount: Number(row.sample_count ?? 0),
    knowledgeCount: Number(row.knowledge_count ?? 0),
    warnings: parseJsonArray(row.warnings_json),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

export function mapTrainingMaterialItem(row: Record<string, unknown>): TrainingMaterialItemRecord {
  return {
    id: Number(row.id),
    materialId: Number(row.material_id),
    merchantId: String(row.merchant_id ?? "default"),
    countryId: String(row.country_id ?? `${String(row.merchant_id ?? "default")}:default`),
    kind: String(row.kind ?? "knowledge") as "sample" | "knowledge",
    sampleId: row.sample_id === null || row.sample_id === undefined ? null : Number(row.sample_id),
    knowledgeId: row.knowledge_id === null || row.knowledge_id === undefined ? null : Number(row.knowledge_id),
    title: String(row.title ?? ""),
    content: String(row.content ?? ""),
    intent: String(row.intent ?? "unknown"),
    stage: String(row.stage ?? ""),
    language: String(row.language ?? "zh"),
    enabled: Boolean(Number(row.enabled ?? 1))
  };
}

export function mapScriptFlow(row: Record<string, unknown>): ScriptFlowRecord {
  const merchantId = String(row.merchant_id ?? "default");
  return {
    id: Number(row.id),
    merchantId,
    countryId: String(row.country_id ?? `${merchantId}:default`),
    countryCode: String(row.country_code ?? "default"),
    countryName: String(row.country_name ?? "默认国家"),
    name: String(row.name ?? ""),
    status: normalizeScriptFlowStatus(row.status),
    active: Boolean(Number(row.active ?? 0)),
    version: Number(row.version ?? 1),
    sourceFilename: String(row.source_filename ?? ""),
    stepCount: Number(row.step_count ?? 0),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

export function mapScriptFlowStep(row: Record<string, unknown>): ScriptFlowStepRecord {
  return {
    id: Number(row.id),
    flowId: Number(row.flow_id),
    merchantId: String(row.merchant_id ?? "default"),
    countryId: String(row.country_id ?? `${String(row.merchant_id ?? "default")}:default`),
    flowCode: String(row.flow_code ?? ""),
    flowName: String(row.flow_name ?? ""),
    flowStep: String(row.flow_step ?? ""),
    goal: String(row.goal ?? ""),
    triggerCondition: String(row.trigger_condition ?? ""),
    customerExpressions: String(row.customer_expressions ?? ""),
    standardReply: String(row.standard_reply ?? ""),
    collectInfo: String(row.collect_info ?? ""),
    sendLink: Boolean(Number(row.send_link ?? 0)),
    sendInvite: Boolean(Number(row.send_invite ?? 0)),
    nextCondition: String(row.next_condition ?? ""),
    nextFlowCode: String(row.next_flow_code ?? ""),
    nextFlowStep: String(row.next_flow_step ?? ""),
    forbidden: String(row.forbidden ?? ""),
    notes: String(row.notes ?? ""),
    sortOrder: Number(row.sort_order ?? 0),
    enabled: Boolean(Number(row.enabled ?? 1)),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

export function mapScriptFlowVersion(row: Record<string, unknown>): ScriptFlowVersionRecord {
  return {
    id: Number(row.id),
    flowId: Number(row.flow_id),
    merchantId: String(row.merchant_id ?? "default"),
    version: Number(row.version ?? 1),
    note: String(row.note ?? ""),
    createdBy: String(row.created_by ?? ""),
    createdAt: String(row.created_at ?? "")
  };
}
