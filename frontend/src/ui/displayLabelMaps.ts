export const LANGUAGE_NAMES: Record<string, string> = {
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
};

export const REPLY_MODE_LABELS: Record<string, string> = {
  strict_flow: "话本流程",
  gemini: "普通回复",
  fallback: "兜底回复",
  manual: "人工发送"
};

export const STATUS_TONE_VALUES = {
  success: ["active", "enabled", "ok", "success", "bound", "done", "ready_for_handoff", "available", "reviewed", "promoted"],
  warning: ["pending", "processing", "waiting", "need_platform_register", "need_phone_or_tg", "reserved", "candidate"],
  danger: ["disabled", "error", "invalid", "human_handoff", "irrelevant_or_spam", "ignored"]
} satisfies Record<string, string[]>;

export const DISPLAY_LABELS: Record<string, string> = {
  merchants: "商户", conversations: "会话", handoffs: "接管", samples: "样本", knowledge: "知识库", materials: "素材", training: "训练中心", scriptFlows: "话本流程", intentLearning: "意图学习", operationLogs: "操作日志", customers: "客户", active: "当前启用", disabled: "停用", enabled: "启用", pendingHandoffs: "待接管",
  name: "名称", status: "状态", id: "ID", email: "邮箱", role: "角色", merchantId: "商户ID", customerPhone: "客户", customerKey: "客户", nickname: "昵称",
  language: "语言", stage: "阶段", handoffStatus: "接管状态", customerMessage: "客户问题", standardReply: "标准回复", intent: "意图",
  priority: "优先级", a2cBaseUrl: "A2C地址", a2cAppId: "A2C应用ID", a2cAppSecret: "A2C密钥", a2cAccountPhone: "A2C接收账号", a2cWebhookVerifyToken: "Webhook验证Token", a2cWebhookUrl: "A2C回调地址",
  aiProvider: "智能供应商", minimaxApiKey: "MiniMax密钥", minimaxModel: "MiniMax模型", deepseekApiKey: "DeepSeek密钥", deepseekModel: "DeepSeek模型", googleAiApiKey: "兼容Gemini密钥", googleAiModel: "兼容Gemini模型", smartReplyEnabled: "智能回复", strictScriptFlowEnabled: "话本流程", openaiApiKey: "旧版智能密钥", openaiModel: "旧版智能模型", telegramBotToken: "TG机器人", telegramHandoffChatId: "TG群ID",
  platformRegisterUrl: "开户链接", tgRegisterGuideUrl: "老师TG链接", registrationTutorialImageUrl: "注册教程图片", type: "类型", title: "标题", content: "内容", password: "新密码",
  url: "链接", rotationCount: "轮询次数", assignedCount: "已分配次数",
  inviteCode: "邀请码", registerUrl: "注册链接", assignedCustomerKey: "绑定客户", assignedConversationId: "绑定会话", platformAccount: "注册账号", assignedAt: "分配时间", usedAt: "使用时间", updatedAt: "更新时间",
  candidateKey: "候选键", suggestedIntent: "建议意图", displayName: "意图名称", description: "说明", customerText: "客户表达", detectedIntent: "原始意图", inferredIntent: "推断意图", contextualIntent: "上下文意图", occurrenceCount: "出现次数",
  limit: "数量", q: "关键词搜索", startAt: "开始时间", endAt: "结束时间", version: "版本", stepCount: "节点数", draft: "草稿", true: "启用", false: "停用", faq: "问答", script: "话术", rule: "规则", forbidden: "禁用表达",
  pending: "待处理", processing: "处理中", done: "已完成", sourceType: "资料类型", count: "数量", filename: "文件名", itemCount: "学习数", sampleCount: "样本数",
  knowledgeCount: "知识数", createdAt: "创建时间", csv: "表格", xlsx: "表格", docx: "文档", txt: "文本", image: "图片",
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
  actorName: "操作人", actorRole: "操作角色", action: "操作", resourceType: "资源", targetId: "目标", route: "接口", method: "请求方式",
  create: "新增", update: "修改", delete: "删除", import: "导入", sync: "同步", restore: "恢复", enable: "启用", send: "发送", mark_read: "标记已读", success: "成功",
  merchant_config: "商户配置", agent_profile: "智能体配置", script_flow: "话本流程", training_material: "训练资料", training_sample: "训练样本", invite_code: "邀请码", teacher_tg_link: "导师TG链接", a2c_account: "A2C客服账号", country: "国家配置", customer: "客户", conversation: "会话", user: "后台账号", merchant: "商户", intent_learning: "意图学习", system: "系统操作",
  text: "文本", video: "视频", audio: "音频", document: "文件", sample: "样本", item: "条目", available: "可用", reserved: "已分配", used: "已使用", candidate: "待处理", reviewed: "已确认", promoted: "已沉淀", ignored: "已忽略",
  inbound: "客户", outbound: "客服", unknown: "未知",
  strict_flow: "话本流程", fallback: "兜底回复", manual: "人工发送", ai: "智能回复",
  need_platform_register: "待开户注册", need_phone_or_tg: "待补联系方式", ready_for_handoff: "可接管",
  first_greeting: "首次问候", interest_screening: "兴趣筛选", project_intro: "项目介绍", registration_intent: "确认注册意向", send_register_link: "发送链接邀请码",
  wait_registration: "等待完成注册", telegram_confirm: "确认TG", telegram_download: "引导下载TG", collect_telegram: "发送TG链接", human_handoff: "人工接管", ended: "结束",
  flowCode: "流程编号", flowName: "流程名称", flowStep: "系统步骤", goal: "当前节点目标", triggerCondition: "触发条件", customerExpressions: "客户常见表达",
  collectInfo: "需要收集的信息", sendLink: "发链接", sendInvite: "发邀请码", sendTutorialImage: "发教程图", nextCondition: "下一步条件", nextFlowCode: "下一流程编号", nextFlowStep: "下一系统步骤", sortOrder: "顺序", notes: "备注",
  greeting: "打招呼", ask_platform_register: "询问开户注册", platform_register_done: "开户注册完成", ask_tg_register: "询问TG注册", no_telegram: "没有TG",
  provide_phone: "提供手机号", provide_telegram: "提供TG", provide_phone_and_telegram: "提供手机号和TG", ask_link: "索要链接",
  ask_promotion: "询问活动", trust_concern: "信任疑虑", need_help: "需要协助", human_request: "要求人工", irrelevant_or_spam: "无关或垃圾消息",
  custom_unknown_question: "未知问题", contextual_acknowledgement: "上下文短确认", custom_unclassified_or_noise: "待判断噪声", custom_unclassified: "待识别新意图",
  language_detection: "语言识别", intent_classification: "意图识别", contextual_intent: "上下文理解", strict_flow_naturalize: "口语化改写", translation: "翻译", availability_check: "配置检测", conversation_review: "对话复盘", training_image_ocr: "素材图片识别", conversation_reply: "普通回复", customer_image_analysis: "客户图片分析", minimax: "MiniMax", gemini: "Gemini", deepseek: "DeepSeek"
};
