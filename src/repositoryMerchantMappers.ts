import { normalizeInviteCodeStatus } from "./repositoryInviteCodes.js";
import { normalizeTelegramBindingStatus } from "./repositoryStatuses.js";
import type {
  A2CInviteCodeRecord,
  MerchantA2CAccountRecord,
  MerchantAgentProfileRecord,
  MerchantConfigRecord,
  MerchantCountryRecord,
  MerchantRecord
} from "./repositoryTypes.js";

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
    a2cWebhookVerifyToken: String(row.a2c_webhook_verify_token ?? ""),
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
    a2cAuthBlockedUntil: Number(row.a2c_auth_blocked_until ?? 0),
    smartReplyEnabled: Boolean(Number(row.smart_reply_enabled ?? 1)),
    trainingSimulationEnabled: Boolean(Number(row.training_simulation_enabled ?? 0)),
    strictScriptFlowEnabled: Boolean(Number(row.strict_script_flow_enabled ?? 0)),
    platformRegisterUrl: String(row.platform_register_url ?? ""),
    tgRegisterGuideUrl: String(row.tg_register_guide_url ?? ""),
    registrationTutorialImageUrl: String(row.registration_tutorial_image_url ?? ""),
    sessionPrice: Number(row.session_price ?? 0),
    balance: Number(row.balance ?? 0),
    balanceCurrency: String(row.balance_currency ?? "CNY")
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

export function mapMerchantA2CAccount(row: Record<string, unknown>): MerchantA2CAccountRecord {
  const merchantId = String(row.merchant_id ?? "default");
  return {
    id: Number(row.id),
    merchantId,
    countryId: String(row.country_id ?? `${merchantId}:default`),
    countryCode: String(row.country_code ?? "default"),
    countryName: String(row.country_name ?? "默认国家"),
    defaultLanguage: String(row.default_language ?? "unknown"),
    groupId: row.group_id == null ? undefined : Number(row.group_id),
    groupName: String(row.group_name ?? ""),
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
    source: String(row.invite_source ?? "account") === "group" ? "group" : "account",
    groupId: row.group_id == null ? undefined : Number(row.group_id),
    groupName: String(row.group_name ?? ""),
    code: String(row.code ?? ""),
    registerUrl: String(row.register_url ?? ""),
    status: normalizeInviteCodeStatus(row.status, "available"),
    reusable: Boolean(Number(row.reusable ?? 0)),
    usageCount: Number(row.usage_count ?? 0),
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
