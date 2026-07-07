export const COUNTRY_PRESETS = [
  { name: "巴西", aliases: ["brazil", "br"], code: "br", defaultLanguage: "pt-BR" },
  { name: "菲律宾", aliases: ["philippines", "ph"], code: "ph", defaultLanguage: "en" },
  { name: "日本", aliases: ["japan", "jp"], code: "jp", defaultLanguage: "ja" },
  { name: "泰国", aliases: ["thailand", "th"], code: "th", defaultLanguage: "th" },
  { name: "越南", aliases: ["vietnam", "vn"], code: "vn", defaultLanguage: "vi" },
  { name: "印尼", aliases: ["indonesia", "id", "印度尼西亚"], code: "id", defaultLanguage: "id" },
  { name: "马来西亚", aliases: ["malaysia", "my"], code: "my", defaultLanguage: "ms" },
  { name: "中国", aliases: ["china", "cn"], code: "cn", defaultLanguage: "zh" },
  { name: "美国", aliases: ["united states", "usa", "us", "america"], code: "us", defaultLanguage: "en" },
  { name: "玻利维亚", aliases: ["bolivia", "bo"], code: "bo", defaultLanguage: "es" },
  { name: "墨西哥", aliases: ["mexico", "mx"], code: "mx", defaultLanguage: "es" },
  { name: "西班牙", aliases: ["spain", "es"], code: "es", defaultLanguage: "es" }
];

export const BEIJING_TIME_ZONE = "Asia/Shanghai";
export type TimeDisplayMode = "beijing" | "country";
export const TIME_DISPLAY_STORAGE_KEY = "a2c_time_display_mode";

const COUNTRY_TIME_ZONES: Record<string, string> = {
  br: "America/Sao_Paulo",
  brazil: "America/Sao_Paulo",
  "巴西": "America/Sao_Paulo",
  bo: "America/La_Paz",
  bolivia: "America/La_Paz",
  "玻利维亚": "America/La_Paz",
  ph: "Asia/Manila",
  philippines: "Asia/Manila",
  "菲律宾": "Asia/Manila",
  jp: "Asia/Tokyo",
  japan: "Asia/Tokyo",
  "日本": "Asia/Tokyo",
  th: "Asia/Bangkok",
  thailand: "Asia/Bangkok",
  "泰国": "Asia/Bangkok",
  vn: "Asia/Ho_Chi_Minh",
  vietnam: "Asia/Ho_Chi_Minh",
  "越南": "Asia/Ho_Chi_Minh",
  id: "Asia/Jakarta",
  indonesia: "Asia/Jakarta",
  "印尼": "Asia/Jakarta",
  "印度尼西亚": "Asia/Jakarta",
  my: "Asia/Kuala_Lumpur",
  malaysia: "Asia/Kuala_Lumpur",
  "马来西亚": "Asia/Kuala_Lumpur",
  cn: BEIJING_TIME_ZONE,
  china: BEIJING_TIME_ZONE,
  "中国": BEIJING_TIME_ZONE,
  us: "America/New_York",
  usa: "America/New_York",
  america: "America/New_York",
  "united states": "America/New_York",
  "美国": "America/New_York",
  mx: "America/Mexico_City",
  mexico: "America/Mexico_City",
  "墨西哥": "America/Mexico_City",
  es: "Europe/Madrid",
  spain: "Europe/Madrid",
  "西班牙": "Europe/Madrid"
};

let activeTimeDisplayMode: TimeDisplayMode = readTimeDisplayMode();

export function getTimeDisplayMode(): TimeDisplayMode {
  return activeTimeDisplayMode;
}

export function setTimeDisplayMode(mode: TimeDisplayMode) {
  activeTimeDisplayMode = mode;
  if (typeof window !== "undefined") window.localStorage.setItem(TIME_DISPLAY_STORAGE_KEY, mode);
}

export function timeZoneForCountry(country?: unknown) {
  const keys = countryLookupKeys(country);
  for (const key of keys) {
    const zone = COUNTRY_TIME_ZONES[key];
    if (zone) return zone;
  }
  return BEIJING_TIME_ZONE;
}

export function timeDisplayModeLabel(mode: TimeDisplayMode) {
  return mode === "country" ? "国家时间" : "北京时间";
}

export function formatTime(value: string, country?: unknown) {
  if (!value) return "";
  const date = parseServerDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("zh-CN", { timeZone: effectiveTimeZone(country), hour: "2-digit", minute: "2-digit", hour12: false });
}

export function formatDateTime(value: string, country?: unknown) {
  if (!value) return "";
  const date = parseServerDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { timeZone: effectiveTimeZone(country), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).replace(/\//g, "-");
}

export function formatConversationDate(value: string, country?: unknown) {
  if (!value) return "";
  const date = parseServerDate(value);
  if (Number.isNaN(date.getTime())) return "";
  const timeZone = effectiveTimeZone(country);
  const day = dateKey(date, timeZone);
  const today = dateKey(new Date(), timeZone);
  const yesterday = dateKey(new Date(Date.now() - 24 * 60 * 60 * 1000), timeZone);
  if (day === today) return "今天";
  if (day === yesterday) return "昨天";
  return day;
}

function dateKey(date: Date, timeZone: string) {
  return date.toLocaleDateString("zh-CN", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).replace(/\//g, "-");
}

function parseServerDate(value: string) {
  const trimmed = value.trim();
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)
    ? `${trimmed.replace(" ", "T")}Z`
    : trimmed;
  return new Date(normalized);
}

function effectiveTimeZone(country?: unknown) {
  return activeTimeDisplayMode === "country" ? timeZoneForCountry(country) : BEIJING_TIME_ZONE;
}

function readTimeDisplayMode(): TimeDisplayMode {
  if (typeof window === "undefined") return "beijing";
  const stored = window.localStorage.getItem(TIME_DISPLAY_STORAGE_KEY);
  return stored === "country" ? "country" : "beijing";
}

function countryLookupKeys(country?: unknown) {
  const values: string[] = [];
  if (country && typeof country === "object") {
    const record = country as Record<string, unknown>;
    values.push(String(record.countryCode || ""), String(record.code || ""), String(record.countryName || ""), String(record.name || ""), String(record.countryId || ""));
  } else {
    values.push(String(country || ""));
  }
  const expanded = values.flatMap((value) => {
    const trimmed = value.trim();
    const suffix = trimmed.includes(":") ? trimmed.split(":").pop() || trimmed : trimmed;
    return [trimmed, suffix, countryLabel(trimmed), countryLabel(suffix)];
  });
  return expanded.map((value) => value.trim().toLowerCase()).filter(Boolean);
}

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
  if (["status", "enabled", "role", "stage", "intent", "type", "sourceType", "handoffStatus", "msgType", "kind", "taskType", "provider", "flowStep", "nextFlowStep", "strictFlowStep", "replyMode", "suggestedIntent", "detectedIntent", "inferredIntent", "contextualIntent", "nextAction"].includes(column)) {
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

export function countryLabel(value: unknown): string {
  const text = String(value || "").trim();
  if (!text) return "";
  const normalized = text.toLowerCase();
  if (normalized.includes(":")) {
    const suffix = normalized.split(":").pop() || normalized;
    const translated: string = countryLabel(suffix);
    if (translated !== suffix) return translated;
  }
  const dictionary: Record<string, string> = {
    "default": "默认国家",
    "default:default": "默认国家",
    "默认国家": "默认国家",
    "brazil": "巴西",
    "br": "巴西",
    "philippines": "菲律宾",
    "ph": "菲律宾",
    "japan": "日本",
    "jp": "日本",
    "malaysia": "马来西亚",
    "my": "马来西亚",
    "indonesia": "印尼",
    "id": "印尼",
    "thailand": "泰国",
    "th": "泰国",
    "vietnam": "越南",
    "vn": "越南",
    "china": "中国",
    "cn": "中国",
    "united states": "美国",
    "usa": "美国",
    "us": "美国",
    "bolivia": "玻利维亚",
    "bo": "玻利维亚",
    "mexico": "墨西哥",
    "mx": "墨西哥",
    "spain": "西班牙",
    "es": "西班牙"
  };
  return dictionary[normalized] || text;
}

export function inferCountryProfile(value: string) {
  const text = value.trim();
  const normalized = text.toLowerCase();
  const preset = COUNTRY_PRESETS.find((item) => item.name === text || item.code === normalized || item.aliases.includes(normalized));
  if (preset) return { code: preset.code, defaultLanguage: preset.defaultLanguage };
  const ascii = normalized.replace(/[^a-z]/g, "").slice(0, 2);
  return { code: ascii || "default", defaultLanguage: "en" };
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
  if (["active", "enabled", "ok", "bound", "done", "ready_for_handoff", "available", "reviewed", "promoted"].includes(value)) return "success";
  if (["pending", "processing", "waiting", "need_platform_register", "need_phone_or_tg", "reserved", "candidate"].includes(value)) return "warning";
  if (["disabled", "error", "invalid", "human_handoff", "irrelevant_or_spam", "ignored"].includes(value)) return "danger";
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
  return ({
    zh: "中文",
    "zh-CN": "中文",
    en: "英语",
    ja: "日语",
    "pt-BR": "葡语",
    pt: "葡语",
    es: "西语",
    ms: "马来语",
    id: "印尼语",
    th: "泰语",
    vi: "越南语",
    unknown: "未知"
  } as Record<string, string>)[String(code || "")] || String(code || "");
}

export function replyModeLabel(mode?: string) {
  return ({
    strict_flow: "严格话本",
    gemini: "普通回复",
    fallback: "兜底回复",
    manual: "人工发送"
  } as Record<string, string>)[String(mode || "")] || "未记录";
}

export function label(key: string) {
  return ({
    merchants: "商户", conversations: "会话", handoffs: "接管", samples: "样本", knowledge: "知识库", materials: "素材", training: "训练中心", scriptFlows: "话本流程", intentLearning: "意图学习", customers: "客户", active: "活跃", disabled: "停用", enabled: "启用", pendingHandoffs: "待接管",
    name: "名称", status: "状态", id: "ID", email: "邮箱", role: "角色", merchantId: "商户ID", customerPhone: "客户", customerKey: "客户", nickname: "昵称",
    language: "语言", stage: "阶段", handoffStatus: "接管状态", customerMessage: "客户问题", standardReply: "标准回复", intent: "意图",
    priority: "优先级", a2cBaseUrl: "A2C地址", a2cAppId: "A2C应用ID", a2cAppSecret: "A2C密钥", a2cAccountPhone: "A2C接收账号", a2cWebhookUrl: "A2C回调地址",
    aiProvider: "AI供应商", minimaxApiKey: "MiniMax密钥", minimaxModel: "MiniMax模型", deepseekApiKey: "DeepSeek密钥", deepseekModel: "DeepSeek模型", googleAiApiKey: "兼容Gemini密钥", googleAiModel: "兼容Gemini模型", smartReplyEnabled: "智能回复", strictScriptFlowEnabled: "严格话本流程", openaiApiKey: "旧版AI密钥", openaiModel: "旧版AI模型", telegramBotToken: "TG机器人", telegramHandoffChatId: "TG群ID",
    platformRegisterUrl: "开户链接", tgRegisterGuideUrl: "TG注册说明", registrationTutorialImageUrl: "注册教程图片", type: "类型", title: "标题", content: "内容", password: "新密码",
    inviteCode: "邀请码", registerUrl: "注册链接", assignedCustomerKey: "绑定客户", assignedConversationId: "绑定会话", platformAccount: "注册账号", assignedAt: "分配时间", usedAt: "使用时间", updatedAt: "更新时间",
    candidateKey: "候选键", suggestedIntent: "建议意图", displayName: "意图名称", description: "说明", customerText: "客户表达", detectedIntent: "原始意图", inferredIntent: "推断意图", contextualIntent: "上下文意图", occurrenceCount: "出现次数",
    limit: "数量", q: "关键词搜索", startAt: "开始时间", endAt: "结束时间", version: "版本", stepCount: "节点数", draft: "草稿", true: "启用", false: "停用", faq: "问答", script: "话术", rule: "规则", forbidden: "禁用表达",
    pending: "待处理", processing: "处理中", done: "已完成", sourceType: "资料类型", count: "数量", filename: "文件名", itemCount: "学习数", sampleCount: "样本数",
    knowledgeCount: "知识数", createdAt: "导入时间", csv: "表格", xlsx: "表格", docx: "文档", txt: "文本", image: "图片",
    lastA2CAccountPhone: "最近接收账号", firstA2CAccountPhone: "首次接收账号", extractedPhone: "手机号", extractedTelegram: "Telegram",
    extractedWhatsApp: "WhatsApp", countryId: "国家", countryName: "国家", countryCode: "国家代码", code: "国家代码", defaultLanguage: "默认语言",
    requirePlatformAccount: "需平台开户", requirePhone: "需手机号", requireTelegram: "需TG", requireWhatsApp: "需WS",
    conversationCount: "会话数", lastSeenAt: "最近消息时间", firstSeenAt: "首次消息时间", lastConversationId: "最近会话ID",
    totalCalls: "调用总数", successCalls: "成功", errorCalls: "失败", successRate: "成功率", averageDurationMs: "平均耗时ms", taskType: "调用类型", provider: "供应商", model: "模型", errorMessage: "失败原因", httpStatus: "状态码", requestSummary: "请求摘要", responseSummary: "返回摘要", lastCalledAt: "最近调用时间", lastFailedAt: "最近失败时间",
    ok: "正常", missing: "未配置", error: "异常", unbound: "未绑定", waiting: "等待入群", bound: "已绑定", invalid: "已失效", apiPhone: "客服账号", verifiedName: "显示名称",
    continue: "继续推进", need_complete_phone: "需要完整手机号", wait_registration_ack: "等待客户开户注册", "save phone and continue telegram step": "保存手机号并进入TG步骤",
    "save telegram and check handoff": "保存TG并检查接管", "guide telegram download": "引导下载TG", "guide telegram username setup": "引导设置TG链接",
    "collect telegram username": "发送TG链接", "help registration": "协助开户注册", "answer previous registration question": "回答上一个注册问题",
    "answer registration field question": "回答注册字段问题", "pause politely": "礼貌暂停", "wait for telegram username": "等待发送TG链接",
    "send registration steps": "发送注册步骤", "guide download": "引导下载",
    wabaId: "业务账号ID", numberStatus: "号码状态", qualityRating: "质量评分", messagingLimit: "消息额度", syncedAt: "同步时间",
    platform_admin: "平台管理员", merchant_admin: "商户管理员", merchant_operator: "商户运营",
    text: "文本", video: "视频", audio: "音频", document: "文件", sample: "样本", item: "条目", available: "可用", reserved: "已分配", used: "已使用", candidate: "待处理", reviewed: "已确认", promoted: "已沉淀", ignored: "已忽略",
    inbound: "客户", outbound: "客服", unknown: "未知",
    strict_flow: "严格话本", fallback: "兜底回复", manual: "人工发送", ai: "智能回复",
    need_platform_register: "待开户注册", need_phone_or_tg: "待补联系方式", ready_for_handoff: "可接管",
    first_greeting: "首次问候", interest_screening: "兴趣筛选", project_intro: "项目介绍", registration_intent: "确认注册意向", send_register_link: "发送链接邀请码",
    wait_registration: "等待完成注册", telegram_confirm: "确认TG", telegram_download: "引导下载TG", collect_telegram: "发送TG链接", human_handoff: "人工接管", ended: "结束",
    flowCode: "流程编号", flowName: "流程名称", flowStep: "系统步骤", goal: "当前节点目标", triggerCondition: "触发条件", customerExpressions: "客户常见表达",
    collectInfo: "需要收集的信息", sendLink: "发链接", sendInvite: "发邀请码", sendTutorialImage: "发教程图", nextCondition: "下一步条件", nextFlowCode: "下一流程编号", nextFlowStep: "下一系统步骤", sortOrder: "顺序", notes: "备注",
    greeting: "打招呼", ask_platform_register: "询问开户注册", platform_register_done: "开户注册完成", ask_tg_register: "询问TG注册",
    provide_phone: "提供手机号", provide_telegram: "提供TG", provide_phone_and_telegram: "提供手机号和TG", ask_link: "索要链接",
    ask_promotion: "询问活动", trust_concern: "信任疑虑", need_help: "需要协助", human_request: "要求人工", irrelevant_or_spam: "无关或垃圾消息",
    custom_unknown_question: "未知问题", contextual_acknowledgement: "上下文短确认", custom_unclassified_or_noise: "待判断噪声", custom_unclassified: "待识别新意图",
    language_detection: "语言识别", intent_classification: "意图识别", contextual_intent: "上下文理解", strict_flow_naturalize: "口语化改写", translation: "翻译", availability_check: "配置检测", conversation_review: "对话复盘", training_image_ocr: "素材图片识别", conversation_reply: "普通回复", customer_image_analysis: "客户图片分析", minimax: "MiniMax", gemini: "Gemini", deepseek: "DeepSeek"
  } as Record<string, string>)[key] || key;
}
