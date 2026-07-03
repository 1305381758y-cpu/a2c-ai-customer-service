import type { UserRole } from "./auth.js";
import type { ConversationStage } from "./domain/intents.js";
import type {
  A2CInviteCodeRecord,
  Conversation,
  ConversationExportRecord,
  ConversationMessageRecord,
  ConversationReviewItemRecord,
  ConversationReviewRecord,
  CustomerMemoryRecord,
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
import { parseJsonArray, parseJsonObject, parseJsonRecordArray } from "./repositoryJson.js";

export {
  buildCustomerMemorySummary,
  clipText,
  parseJsonArray,
  parseJsonObject,
  parseJsonRecordArray
} from "./repositoryJson.js";

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

export function normalizeKnowledgeType(value: unknown): KnowledgeItemRecord["type"] {
  return value === "script" || value === "rule" || value === "forbidden" || value === "faq" ? value : "faq";
}

export function normalizeScriptFlowStatus(value: unknown): ScriptFlowRecord["status"] {
  return value === "active" || value === "disabled" || value === "draft" ? value : "draft";
}

export function normalizeScriptFlowStep(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
  const dictionary: Record<string, string> = {
    a: "interest_screening",
    "首次问候": "interest_screening",
    first_greeting: "interest_screening",
    greeting: "interest_screening",
    b: "interest_screening",
    "兴趣筛选": "interest_screening",
    interest_screening: "interest_screening",
    c: "registration_intent",
    "项目介绍": "registration_intent",
    project_intro: "registration_intent",
    d: "registration_intent",
    "注册意向": "registration_intent",
    registration_intent: "registration_intent",
    e: "wait_registration",
    "发送注册链接": "wait_registration",
    "发送链接": "wait_registration",
    send_register_link: "wait_registration",
    f: "wait_registration",
    "等待注册": "wait_registration",
    wait_registration: "wait_registration",
    g: "telegram_confirm",
    "telegram确认": "telegram_confirm",
    "tg确认": "telegram_confirm",
    telegram_confirm: "telegram_confirm",
    h: "telegram_download",
    "telegram下载": "telegram_download",
    "tg下载": "telegram_download",
    telegram_download: "telegram_download",
    i: "collect_telegram",
    "获取telegram账号": "collect_telegram",
    "收集telegram": "collect_telegram",
    collect_telegram: "collect_telegram",
    j: "human_handoff",
    "转交真人": "human_handoff",
    human_handoff: "human_handoff",
    k: "ended",
    "结束": "ended",
    ended: "ended"
  };
  return dictionary[normalized] || normalized;
}

export function normalizeScriptFlowStepValue(key: string, value: unknown): string | number {
  if (key === "sendLink" || key === "sendInvite" || key === "enabled") return booleanPatchValue(value, true);
  if (key === "sortOrder") return Number(value || 0);
  if (key === "flowStep" || key === "nextFlowStep") return normalizeScriptFlowStep(String(value || ""));
  return String(value ?? "");
}

export function normalizeTelegramBindingStatus(value: unknown): MerchantConfigRecord["telegramHandoffChatStatus"] {
  return value === "waiting" || value === "bound" || value === "invalid" || value === "unbound" ? value : "unbound";
}

export function normalizeInviteCodeStatus(value: unknown, fallback: A2CInviteCodeRecord["status"]): A2CInviteCodeRecord["status"] {
  return value === "available" || value === "reserved" || value === "used" || value === "disabled" ? value : fallback;
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

export function booleanPatchValue(value: unknown, fallback: boolean): number {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (normalized === "true" || normalized === "1") return 1;
    if (normalized === "false" || normalized === "0") return 0;
  }
  return fallback ? 1 : 0;
}

export function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function inviteCodeAccountMatches(inviteAccountPhone: string, conversationAccountPhone: string): boolean {
  const rawInvitePhone = inviteAccountPhone.trim();
  const rawConversationPhone = conversationAccountPhone.trim();
  if (!rawInvitePhone || !rawConversationPhone) return false;
  if (rawInvitePhone === rawConversationPhone) return true;
  const inviteDigits = phoneDigits(inviteAccountPhone);
  const conversationDigits = phoneDigits(conversationAccountPhone);
  if (!inviteDigits || !conversationDigits) return false;
  if (inviteDigits === conversationDigits) return true;
  const minComparableLength = 8;
  return (
    inviteDigits.length >= minComparableLength &&
    conversationDigits.length >= minComparableLength &&
    (inviteDigits.endsWith(conversationDigits) || conversationDigits.endsWith(inviteDigits))
  );
}
