import type { UserRole } from "./auth.js";
import type {
  A2CInviteCodeRecord,
  ConversationReviewItemRecord,
  ConversationReviewRecord,
  CustomerRecord,
  IntentLearningEventRecord,
  KnowledgeItemRecord,
  MerchantA2CAccountRecord,
  MerchantAgentProfileRecord,
  MerchantConfigRecord,
  MerchantCountryRecord,
  MerchantRecord,
  ScriptFlowRecord,
  ScriptFlowStepRecord,
  ScriptFlowVersionRecord,
  TrainingMaterialItemRecord,
  TrainingMaterialRecord,
  UserRecord,
} from "./repositories.js";
import { normalizeInviteCodeStatus } from "./repositoryInviteCodes.js";
import { parseJsonArray, parseJsonRecordArray } from "./repositoryJson.js";
import { booleanPatchValue } from "./repositoryPatchValues.js";
import {
  normalizeConversationReviewItemStatus,
  normalizeConversationReviewItemType,
  normalizeConversationReviewStatus,
  normalizeKnowledgeType,
  normalizeScriptFlowStatus,
  normalizeTelegramBindingStatus
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

export function mapMerchant(row: Record<string, unknown>): MerchantRecord {
  return { id: String(row.id), name: String(row.name), status: String(row.status ?? "active") as "active" | "disabled" };
}

export function mapMerchantConfig(row: Record<string, unknown>): MerchantConfigRecord {
  return {
    merchantId: String(row.merchant_id),
    a2cBaseUrl: String(row.a2c_base_url ?? ""),
    a2cAppId: String(row.a2c_app_id ?? ""),
    a2cAppSecret: String(row.a2c_app_secret ?? ""),
    a2cAccountPhone: String(row.a2c_account_phone ?? ""),
    openaiApiKey: String(row.openai_api_key ?? ""),
    openaiModel: String(row.openai_model ?? "gpt-5-mini"),
    aiProvider: row.ai_provider === "gemini" || row.ai_provider === "deepseek" ? row.ai_provider : "minimax",
    minimaxApiKey: String(row.minimax_api_key ?? ""),
    minimaxModel: String(row.minimax_model ?? "MiniMax-M3"),
    deepseekApiKey: String(row.deepseek_api_key ?? ""),
    deepseekModel: String(row.deepseek_model ?? "deepseek-chat"),
    googleAiApiKey: String(row.google_ai_api_key ?? ""),
    googleAiModel: String(row.google_ai_model ?? "gemini-2.5-flash"),
    telegramBotToken: String(row.telegram_bot_token ?? ""),
    telegramHandoffChatId: String(row.telegram_handoff_chat_id ?? ""),
    telegramHandoffChatTitle: String(row.telegram_handoff_chat_title ?? ""),
    telegramHandoffChatStatus: normalizeTelegramBindingStatus(row.telegram_handoff_chat_status),
    telegramHandoffChatError: String(row.telegram_handoff_chat_error ?? ""),
    a2cTokenCacheKey: String(row.a2c_token_cache_key ?? ""),
    a2cAccessToken: String(row.a2c_access_token ?? ""),
    a2cTokenExpiresAt: Number(row.a2c_token_expires_at ?? 0),
    smartReplyEnabled: Boolean(Number(row.smart_reply_enabled ?? 1)),
    trainingSimulationEnabled: Boolean(Number(row.training_simulation_enabled ?? 0)),
    strictScriptFlowEnabled: Boolean(Number(row.strict_script_flow_enabled ?? 0)),
    platformRegisterUrl: String(row.platform_register_url ?? ""),
    tgRegisterGuideUrl: String(row.tg_register_guide_url ?? ""),
    registrationTutorialImageUrl: String(row.registration_tutorial_image_url ?? "")
  };
}

export function mapMerchantAgentProfile(row: Record<string, unknown>): MerchantAgentProfileRecord {
  return {
    merchantId: String(row.merchant_id ?? "default"),
    agentName: String(row.agent_name ?? "开户注册接待专员"),
    roleDefinition: String(row.role_definition ?? "拥有10年开户注册接待经验的客户引导专员，负责自然、耐心地引导客户完成开户注册。"),
    toneStyle: String(row.tone_style ?? "简短、口语化、耐心、像真人客服，不长篇大论。"),
    coreGoal: String(row.core_goal ?? "引导客户完成开户注册并提交手机号和 Telegram。"),
    mustFollow: String(row.must_follow ?? "客户提问时先简短回答，再轻轻拉回当前流程；每次只处理当前最需要的一步。"),
    forbidden: String(row.forbidden ?? "不能暴露 AI、机器人、模型、自动客服身份；不能承诺固定收益；不能要求私下转账；不能收集密码、验证码、银行卡或证件敏感信息。"),
    uncertaintyPolicy: String(row.uncertainty_policy ?? "不确定的业务规则、收益、充值、任务细节，以页面说明或人工确认为准。"),
    handoffPolicy: String(row.handoff_policy ?? "客户提交手机号和 Telegram 后回复正在核实并转人工；客户强烈要求人工或连续无法解决时也可转人工。"),
    enabled: Boolean(Number(row.enabled ?? 1)),
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

export function mapMerchantA2CAccount(row: Record<string, unknown>): MerchantA2CAccountRecord {
  const merchantId = String(row.merchant_id ?? "default");
  return {
    id: Number(row.id),
    merchantId,
    countryId: String(row.country_id ?? `${merchantId}:default`),
    countryCode: String(row.country_code ?? "default"),
    countryName: String(row.country_name ?? "默认国家"),
    defaultLanguage: String(row.default_language ?? "unknown"),
    apiPhone: String(row.api_phone ?? ""),
    wabaId: String(row.waba_id ?? ""),
    status: Number(row.status ?? 0),
    numberStatus: Number(row.number_status ?? 0),
    qualityRating: Number(row.quality_rating ?? 0),
    messagingLimit: Number(row.messaging_limit ?? 0),
    verifiedName: String(row.verified_name ?? ""),
    enabled: Boolean(Number(row.enabled ?? 1)),
    syncedAt: String(row.synced_at ?? "")
  };
}

export function mapA2CInviteCode(row: Record<string, unknown>): A2CInviteCodeRecord {
  const merchantId = String(row.merchant_id ?? "default");
  return {
    id: Number(row.id ?? 0),
    merchantId,
    countryId: String(row.country_id ?? `${merchantId}:default`),
    countryCode: String(row.country_code ?? "default"),
    countryName: String(row.country_name ?? "默认国家"),
    a2cAccountId: Number(row.a2c_account_id ?? 0),
    a2cAccountPhone: String(row.a2c_account_phone ?? ""),
    code: String(row.code ?? ""),
    registerUrl: String(row.register_url ?? ""),
    status: normalizeInviteCodeStatus(row.status, "available"),
    assignedCustomerKey: String(row.assigned_customer_key ?? ""),
    assignedConversationId: String(row.assigned_conversation_id ?? ""),
    platformAccount: String(row.platform_account ?? ""),
    assignedAt: String(row.assigned_at ?? ""),
    usedAt: String(row.used_at ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

export function mapMerchantCountry(row: Record<string, unknown>): MerchantCountryRecord {
  return {
    id: String(row.id),
    merchantId: String(row.merchant_id ?? "default"),
    code: String(row.code ?? "default"),
    name: String(row.name ?? "默认国家"),
    defaultLanguage: String(row.default_language ?? "unknown"),
    platformRegisterUrl: String(row.platform_register_url ?? ""),
    tgRegisterGuideUrl: String(row.tg_register_guide_url ?? ""),
    requirePlatformAccount: Boolean(Number(row.require_platform_account ?? 1)),
    requirePhone: Boolean(Number(row.require_phone ?? 1)),
    requireTelegram: Boolean(Number(row.require_telegram ?? 1)),
    requireWhatsApp: Boolean(Number(row.require_whatsapp ?? 0)),
    status: String(row.status ?? "active") as "active" | "disabled"
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
