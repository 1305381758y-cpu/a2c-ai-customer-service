import { GoogleGenAI, Type, type Part, type Schema } from "@google/genai";
import type { AppConfig } from "../config.js";
import type { A2CInviteCodeRecord, MerchantAgentProfileRecord, MerchantCountryRecord } from "../repositories.js";
import { isContextualIntentLabel, isInternalIntentLabel, type ContextualIntentLabel, type InternalIntentLabel } from "../domain/analyzer.js";
import { agentProfileBlock, safeAgentProfile } from "./aiAgentProfilePrompt.js";
import type { AiReply, ReplyInput } from "./aiReplyTypes.js";

export type GeminiConfig = Pick<AppConfig, "GOOGLE_AI_API_KEY" | "GOOGLE_AI_MODEL">;

const GEMINI_TIMEOUT_MS = 15_000;

const replySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    reply: { type: Type.STRING },
    language: { type: Type.STRING },
    stage: { type: Type.STRING },
    extractedPhone: { type: Type.STRING },
    extractedTelegram: { type: Type.STRING },
    extractedWhatsApp: { type: Type.STRING },
    shouldHandoff: { type: Type.BOOLEAN }
  },
  required: ["reply", "language", "stage", "extractedPhone", "extractedTelegram", "extractedWhatsApp", "shouldHandoff"],
  propertyOrdering: ["reply", "language", "stage", "extractedPhone", "extractedTelegram", "extractedWhatsApp", "shouldHandoff"]
};

export class GeminiReplyClient {
  private readonly client?: GoogleGenAI;

  constructor(private readonly config: AppConfig) {
    const apiKey = geminiApiKey(config);
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : undefined;
  }

  async generateReply(input: ReplyInput): Promise<AiReply> {
    if (!this.client) return fallbackReply(input, this.config);

    try {
      const response = await this.client.models.generateContent({
        model: geminiModel(this.config),
        contents: JSON.stringify({
          customerText: input.customerText,
          conversation: input.conversation,
          recentHistory: input.history,
          relevantTrainingSamples: input.samples,
          knowledgeItems: input.knowledge,
          trainingMaterials: input.trainingMaterials ?? [],
          customerMemory: input.memory ?? null,
          country: input.country ?? null,
          agentProfile: safeAgentProfile(input.agentProfile),
          assignedInviteCode: input.inviteCode ? {
            code: input.inviteCode.code,
            registerUrl: inviteRegisterUrl(input.inviteCode, fallbackRegisterUrl(input, this.config)),
            displayText: inviteDisplayText(input.inviteCode, input.conversation.language, fallbackRegisterUrl(input, this.config)),
            status: input.inviteCode.status
          } : null
        }),
        config: {
          abortSignal: timeoutSignal(),
          httpOptions: { timeout: GEMINI_TIMEOUT_MS },
          systemInstruction: buildSystemPrompt(this.config, input.agentProfile),
          responseMimeType: "application/json",
          responseSchema: replySchema,
          temperature: 0.45,
          maxOutputTokens: 800,
          thinkingConfig: { thinkingBudget: 0 }
        }
      });

      return normalizeAiReply(JSON.parse(response.text?.trim() || "{}"), input, this.config);
    } catch (error) {
      const fallback = fallbackReply(input, this.config);
      fallback.fallback = true;
      fallback.error = error instanceof Error ? error.message : "Gemini reply failed";
      return fallback;
    }
  }
}

export async function generateGeminiText(
  config: GeminiConfig,
  contents: string | Part[],
  options: { systemInstruction?: string; temperature?: number } = {}
): Promise<string> {
  const apiKey = geminiApiKey(config);
  if (!apiKey) throw new Error("Google AI Studio Key 未配置");
  const client = new GoogleGenAI({ apiKey });
  const response = await client.models.generateContent({
    model: geminiModel(config),
    contents,
    config: {
      abortSignal: timeoutSignal(),
      httpOptions: { timeout: GEMINI_TIMEOUT_MS },
      systemInstruction: options.systemInstruction,
      temperature: options.temperature ?? 0.2,
      maxOutputTokens: 1200,
      thinkingConfig: { thinkingBudget: 0 }
    }
  });
  return response.text?.trim() || "";
}

export interface GeminiImageAnalysis {
  text: string;
  status: "ok" | "failed" | "skipped";
  error?: string;
}

export async function analyzeGeminiImage(config: GeminiConfig, imageUrl: string): Promise<GeminiImageAnalysis> {
  if (!imageUrl) return { text: "", status: "skipped" };
  if (!geminiApiKey(config)) return { text: "", status: "skipped", error: "Google AI Studio Key 未配置" };

  try {
    const response = await fetch(imageUrl, { signal: timeoutSignal() });
    if (!response.ok) throw new Error(`图片下载失败 ${response.status}`);
    const mimeType = normalizeImageMimeType(response.headers.get("content-type") || imageUrl);
    if (!mimeType) return { text: "", status: "skipped", error: "不是可识别图片格式" };
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) return { text: "", status: "skipped", error: "图片为空" };
    if (buffer.length > 8 * 1024 * 1024) return { text: "", status: "skipped", error: "图片超过 8MB，跳过识别" };

    const text = await generateGeminiText(config, [
      {
        text: `请分析这张客户发来的开户注册/Telegram 操作截图。
只输出一段很短的内部中文说明，30 字以内。
重点判断：客户是否遇到链接打不开、页面报错、验证码、邀请码、注册字段、Telegram 用户名等问题。
不要输出图片 URL，不要提取或猜测手机号，不要编造页面上没有的信息。`
      },
      {
        inlineData: {
          mimeType,
          data: buffer.toString("base64")
        }
      }
    ], { temperature: 0 });
    return { text: text.slice(0, 160), status: text ? "ok" : "skipped" };
  } catch (error) {
    return { text: "", status: "failed", error: error instanceof Error ? error.message : "图片识别失败" };
  }
}

export async function classifyGeminiIntent(
  config: GeminiConfig,
  input: {
    customerText: string;
    language: string;
    flowStep: string;
    recentHistory: Array<{ direction: string; content: string; intent: string; createdAt: string }>;
  }
): Promise<InternalIntentLabel> {
  const prompt = JSON.stringify({
    customerText: input.customerText,
    language: input.language,
    flowStep: input.flowStep,
    recentHistory: input.recentHistory.slice(-6).map((item) => ({
      direction: item.direction,
      content: item.content,
      intent: item.intent
    }))
  });
  try {
    const text = await generateGeminiText(config, prompt, {
      temperature: 0,
      systemInstruction: `
你只负责把客户当前消息归类为一个固定标签，不要解释，不要输出 JSON。
可选标签只有：
positive_confirmation, negative_refusal, need_help, ask_platform_register, ask_link, ask_tg_register, platform_register_done, payment_concern, investment_concern, trust_concern, earning_concern, workflow_question, job_question, complaint, chat, sensitive_request, unknown

判断规则：
- 客户表示“是、可以、继续、好的、同意、愿意、yes、ok、sim、claro”等，输出 positive_confirmation。
- 客户明确拒绝、不要、不感兴趣、停止，输出 negative_refusal。
- 客户说不会、帮我、怎么弄、需要协助，输出 need_help。
- 客户询问开户链接、邀请码、入口、URL，输出 ask_link。
- 客户询问注册、开户、平台是什么、在哪里注册，输出 ask_platform_register。
- 客户询问 Telegram/TG 下载、注册、账号，输出 ask_tg_register。
- 客户表示已经注册完成，输出 platform_register_done。
- 客户问是否需要付钱、收费、转账、充值，输出 payment_concern。
- 客户问投资、本金、押金、垫付、先付，输出 investment_concern。
- 客户质疑诈骗、骗子、安全、真假、可靠，输出 trust_concern。
- 客户质疑收入、收益、佣金、多久到账，输出 earning_concern。
- 客户问下一步、怎么做、需要什么资料、怎么操作，输出 workflow_question。
- 客户问工作是什么、具体做什么、兼职内容，输出 job_question。
- 客户抱怨你没回答、重复、机械、听不懂，输出 complaint。
- 客户想闲聊、问能不能聊天或你是谁，输出 chat。
- 客户要求处理验证码、密码、支付、证件等敏感资料，输出 sensitive_request。
- 无法判断才输出 unknown。
`
    });
    const label = text.trim().replace(/[`"'。.!?！？\s]/g, "");
    return isInternalIntentLabel(label) ? label : "unknown";
  } catch {
    return "unknown";
  }
}

export async function classifyGeminiContextualIntent(
  config: GeminiConfig,
  input: {
    customerText: string;
    language: string;
    flowStep: string;
    previousAssistantMessage: string;
    recentHistory: Array<{ direction: string; content: string; intent: string; createdAt: string }>;
    knownPhone: string;
    knownTelegram: string;
  }
): Promise<{
  intent: ContextualIntentLabel;
  answeredPreviousQuestion: boolean;
  isQuestion: boolean;
  shouldPause: boolean;
  questionType: string;
  nextAction: string;
  reason: string;
}> {
  const fallback = {
    intent: "unknown" as ContextualIntentLabel,
    answeredPreviousQuestion: false,
    isQuestion: false,
    shouldPause: false,
    questionType: "none",
    nextAction: "",
    reason: ""
  };
  const prompt = JSON.stringify({
    customerText: input.customerText,
    language: input.language,
    flowStep: input.flowStep,
    previousAssistantMessage: input.previousAssistantMessage,
    knownPhone: input.knownPhone,
    knownTelegram: input.knownTelegram,
    recentHistory: input.recentHistory.slice(-10).map((item) => ({
      direction: item.direction,
      content: item.content,
      intent: item.intent
    }))
  });
  try {
    const text = await generateGeminiText(config, prompt, {
      temperature: 0,
      systemInstruction: `
你只做开户注册流程的上下文意图分类，不能生成客服回复，不能决定跳流程。
必须只输出 JSON，不要 Markdown，不要解释。

JSON 字段：
{
  "intent": "固定标签",
  "answeredPreviousQuestion": boolean,
  "isQuestion": boolean,
  "shouldPause": boolean,
  "questionType": "none|telegram|payment|investment|trust|earning|workflow|job|complaint|chat|sensitive|unknown",
  "nextAction": "一句内部动作描述",
  "reason": "极短原因"
}

intent 只能是：
phone_submission, telegram_submission, positive_confirmation, acknowledgement, negative_refusal, not_available, not_registered, no_telegram, telegram_installed, telegram_username_help, need_help, ask_platform_register, ask_link, ask_tg_register, platform_register_done, payment_concern, investment_concern, trust_concern, earning_concern, workflow_question, job_question, complaint, chat, sensitive_request, unknown_question, unknown

判断重点：
- 资料提交优先：手机号是 phone_submission，@用户名是 telegram_submission。
- 短句必须结合 previousAssistantMessage 和 flowStep。比如上一句问 Telegram，客户说“我没有”就是 no_telegram；上一句问是否有空，客户说“我没有”就是 not_available；上一句问是否完成注册，客户说“我没有”就是 not_registered。
- telegram_download 阶段的“装好了/下载好了/安装好了”是 telegram_installed，不是平台开户完成。
- 客户问“@ 在哪里/怎么找用户名/怎么设置用户名/没有 @/找不到 username”是 telegram_username_help，questionType=telegram。
- collect_telegram 阶段的“ok/好的/明白了”多半是 acknowledgement，表示客户明白了但还没提交资料。
- 客户问“为什么/TG 是什么/怎么下载”属于 ask_tg_register 或 workflow_question，questionType=telegram。
- 客户问费用、投资、本金、押金、诈骗、安全、收益时分别分类，不要归 unknown。
- 客户明确说不想继续、别发了、不要了才是 negative_refusal。
`
    });
    const parsed = JSON.parse(stripJsonFence(text)) as Partial<typeof fallback> & { intent?: string };
    const intent = parsed.intent && isContextualIntentLabel(parsed.intent) ? parsed.intent : "unknown";
    return {
      intent,
      answeredPreviousQuestion: Boolean(parsed.answeredPreviousQuestion),
      isQuestion: Boolean(parsed.isQuestion),
      shouldPause: Boolean(parsed.shouldPause),
      questionType: typeof parsed.questionType === "string" ? parsed.questionType : "none",
      nextAction: typeof parsed.nextAction === "string" ? parsed.nextAction.slice(0, 120) : "",
      reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 120) : ""
    };
  } catch {
    return fallback;
  }
}

export async function naturalizeStrictFlowText(
  config: GeminiConfig,
  input: {
    customerText: string;
    draftReply: string;
    language: string;
    flowStep: string;
    questionType: string;
    recentHistory: Array<{ direction: string; content: string; intent: string; createdAt: string }>;
    allowLinkOrInvite: boolean;
    agentProfile?: MerchantAgentProfileRecord;
  }
): Promise<{ text: string; used: boolean; error?: string }> {
  if (!geminiApiKey(config)) return { text: input.draftReply, used: false, error: "Google AI Studio Key 未配置" };
  if (!input.draftReply.trim()) return { text: input.draftReply, used: false };
  try {
    const text = await generateGeminiText(config, JSON.stringify({
      customerText: input.customerText,
      draftReply: input.draftReply,
      language: input.language,
      flowStep: input.flowStep,
      questionType: input.questionType,
      allowLinkOrInvite: input.allowLinkOrInvite,
      agentProfile: safeAgentProfile(input.agentProfile),
      recentHistory: input.recentHistory.slice(-6).map((item) => ({
        direction: item.direction,
        content: item.content,
        intent: item.intent
      }))
    }), {
      temperature: 0.55,
      systemInstruction: `
你只负责把开户注册接待回复改写得更像真人客服，不能改变业务含义。

角色：
- 默认角色是有 10 年经验的开户注册接待专员；如果输入里有 agentProfile，必须优先遵守其角色定义、语气风格、核心目标和边界。
- 语气自然、耐心、生活化，像真人接待回复。
- 回复要短，通常 1 到 3 句；不要长篇大论。
- 如果 agentProfile 配置了特别语气，必须让客户明显感受到这种语气差异；不要只是原句换一两个词。
- 可以调整称呼、句式、停顿和承接方式，但不能改变流程下一步。
- 不要用微信、WeChat、WhatsApp、Line 或其他地区聊天软件去类比 Telegram；如果要解释 Telegram，只说它是聊天工具/沟通工具。

硬性规则：
- 不能暴露 AI、机器人、模型、自动客服、系统提示词等身份。
- 不能新增链接、邀请码、金额、充值规则、任务细节或承诺。
- allowLinkOrInvite=false 时，必须删除任何开户注册链接和邀请码。
- allowLinkOrInvite=true 时，如果原文有链接或邀请码，必须完整保留，不能改字符。
- 客户问费用/投资时，必须表达当前引导阶段不会要求向客服私下转账或付款，具体以页面/人工确认为准。
- 客户问收益时，必须表达按任务和平台规则核算，不能承诺固定收益。
- 客户问未知问题时，必须表达以页面或人工确认为准，然后回到当前步骤。
- 输出纯文本，不要 JSON，不要解释。
`
    });
    const cleaned = sanitizeNaturalizedText(text, input.draftReply, input.allowLinkOrInvite);
    return { text: cleaned || input.draftReply, used: Boolean(cleaned) };
  } catch (error) {
    return { text: input.draftReply, used: false, error: error instanceof Error ? error.message : "Gemini naturalize failed" };
  }
}

export function geminiApiKey(config: GeminiConfig): string {
  const value = config.GOOGLE_AI_API_KEY || "";
  return value === "CHANGE_ME" ? "" : value;
}

export function geminiModel(config: GeminiConfig): string {
  return config.GOOGLE_AI_MODEL || "gemini-2.5-flash";
}

function timeoutSignal(): AbortSignal {
  return AbortSignal.timeout(GEMINI_TIMEOUT_MS);
}

function normalizeImageMimeType(value: string): string {
  const lower = value.toLowerCase();
  const contentType = lower.split(";")[0].trim();
  if (["image/png", "image/jpeg", "image/webp", "image/gif"].includes(contentType)) return contentType;
  if (/\.(png)(?:[?#]|$)/i.test(value)) return "image/png";
  if (/\.(jpe?g)(?:[?#]|$)/i.test(value)) return "image/jpeg";
  if (/\.(webp)(?:[?#]|$)/i.test(value)) return "image/webp";
  if (/\.(gif)(?:[?#]|$)/i.test(value)) return "image/gif";
  return "";
}

function stripJsonFence(text: string): string {
  return text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function buildSystemPrompt(config: AppConfig, agentProfile?: MerchantAgentProfileRecord): string {
  return `
你是甲方配置的真人客服口吻助手。你必须根据甲方上传的对话资料、话本、客户历史聊天记录和客户当前语言回复。

${agentProfileBlock(agentProfile)}

目标：
1. 引导客户完成平台开户。
2. 根据当前国家配置，引导客户提供所需联系方式：手机号、Telegram 或 WhatsApp。
3. 当客户满足当前国家 completion targets 后，停止继续引导，进入人工接管。

语言规则：
- 必须使用客户最近消息的主要语言回复。
- 可以把甲方中文样本翻译成客户语言，但不能改变链接、金额、承诺、规则、平台名称或业务含义。

安全和业务规则：
- 面向客户的 reply 里，任何情况下都不能暴露自己是 AI、机器人、模型、自动客服或自动回复。
- 如果客户问“你是真人吗 / 你是机器人吗 / 是 AI 吗”，不能正面承认自动化身份，只能用客服口吻自然回复，例如“我这边会继续帮您处理，您现在卡在哪一步？”
- 优先参考 relevantTrainingSamples 中的标准回复。
- 同时参考 knowledgeItems 中启用的 FAQ、话术、规则和禁用表达。
- 同时参考 trainingMaterials，它来自商户上传的聊天记录、文档、文本和图片 OCR 文字。
- 同时参考 customerMemory，它是该客户自己的长期记忆文件，包括历史阶段、已提供资料、最近意图和人工备注。
- 同时参考 country，它是当前 A2C 客服账号绑定的国家配置；不同国家的链接、语言、目标可能不同。
- 只收集 country 当前要求的联系方式。country.requireWhatsApp=false 时，禁止要求客户提供 WhatsApp，因为客户本身通常已经通过 WhatsApp 联系我们。
- country.requireTelegram=true 且客户说没有 Telegram 时，必须引导客户注册/下载 Telegram，然后发送 @ 开头的 Telegram 用户名；不能改为要求 WhatsApp。
- country.requireTelegram=false 时，禁止要求 Telegram。
- 如果 assignedInviteCode 存在，开户注册引导必须同时包含它的 registerUrl 和邀请码 code；如果 registerUrl 已经包含邀请码，也仍要清楚表达这是专属开户链接。
- 开户开户链接和邀请码是开户注册必需信息，不能漏掉其中任何一个，不能自己编造邀请码。
- 如果客户追问邀请码、质疑是否需要邀请码，必须直接回答：注册需要邀请码，并给出 assignedInviteCode；禁止说“不需要邀请码”。
- 如果没有 assignedInviteCode，不能说“不需要邀请码”，只能说明“我这边正在确认专属邀请码，请稍等”。
- 不要连续重复同一句开户链接话术；客户追问时先回答问题，再轻轻推进下一步。
- 不要连续重复同一句开场白；如果客户只是再次打招呼，要结合历史判断是继续当前步骤还是询问遇到的问题。
- 如果客户说“介绍一下自己、你只会这一句话吗、太机械了、不是、不需要”等表达，必须先回应客户当前情绪或问题，再用一句话轻轻拉回当前业务步骤。
- type=forbidden 的内容表示不能说或不能做的事，必须遵守。
- type=rule 的内容优先级高于普通样本。
- 不要编造样本中没有的信息。
- 不要要求客户提供密码、验证码、支付信息或证件敏感信息。
- 每次只给客户当前最需要的一步，简短自然，像真人客服。
- 不要用微信、WeChat、WhatsApp、Line 或其他地区聊天软件去类比 Telegram；面向海外客户只描述 Telegram 自身用途。
- 全局平台注册链接：${config.PLATFORM_REGISTER_URL || "未配置"}
- 全局 Telegram 注册说明链接：${config.TG_REGISTER_GUIDE_URL || "未配置"}

输出必须是 JSON，字段为 reply、language、stage、extractedPhone、extractedTelegram、extractedWhatsApp、shouldHandoff。
`;
}

function normalizeAiReply(value: Partial<AiReply>, input: ReplyInput, config: AppConfig): AiReply {
  if (!value || typeof value.reply !== "string" || !value.reply.trim()) return fallbackReply(input, config);
  const expectedLanguage = input.conversation.language && input.conversation.language !== "unknown" ? input.conversation.language : "";
  const policyReply = enforceContactPolicy(value.reply.trim(), input, config);
  const sanitizedReply = sanitizeCustomerVisibleReply(ensureInviteInReply(policyReply, input, config), expectedLanguage || input.conversation.language);
  const reply = isMechanicalTemplateReply(sanitizedReply)
    ? sanitizeCustomerVisibleReply(ensureInviteInReply(contextualFallbackReply(input, config), input, config), expectedLanguage || input.conversation.language)
    : sanitizedReply;
  return {
    reply,
    language: expectedLanguage || (typeof value.language === "string" && value.language ? value.language : input.conversation.language),
    stage: typeof value.stage === "string" && value.stage ? value.stage : input.conversation.stage,
    extractedPhone: typeof value.extractedPhone === "string" ? value.extractedPhone : input.conversation.extractedPhone,
    extractedTelegram: typeof value.extractedTelegram === "string" ? value.extractedTelegram : input.conversation.extractedTelegram,
    extractedWhatsApp: typeof value.extractedWhatsApp === "string" ? value.extractedWhatsApp : input.conversation.extractedWhatsApp,
    shouldHandoff: Boolean(value.shouldHandoff)
  };
}

export function sanitizeNaturalizedText(text: string, fallback: string, allowLinkOrInvite: boolean): string {
  let cleaned = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^(回复|改写|输出)\s*[:：]\s*/i, "")
    .trim();
  if (!cleaned) return "";
  if (looksLikeStructuredAiPayload(cleaned)) return fallback;
  cleaned = sanitizeRegionalChatAppComparisons(cleaned);
  if (/(我是|作为|身为).{0,8}(AI|人工智能|机器人|機器人|模型|自动客服|自動客服)|\b(AI|robot|bot|model)\b/i.test(cleaned)) {
    return fallback;
  }
  if (!allowLinkOrInvite) {
    cleaned = cleaned
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/(?:邀请码|邀請碼|invitation code|invite code|código de convite|codigo de convite)\s*[:：]?\s*[A-Za-z0-9_-]+/gi, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } else {
    const fallbackUrls: string[] = fallback.match(/https?:\/\/\S+/gi) ?? [];
    const cleanedUrls: string[] = cleaned.match(/https?:\/\/\S+/gi) ?? [];
    if (fallbackUrls.some((url) => !cleanedUrls.includes(url))) return fallback;
    const fallbackInvite = fallback.match(/(?:邀请码|邀請碼|Invitation code|Invite code|Código de convite|Codigo de convite)\s*[:：]?\s*([A-Za-z0-9_-]+)/i)?.[1];
    if (fallbackInvite && !cleaned.includes(fallbackInvite)) return fallback;
  }
  return cleaned;
}

function looksLikeStructuredAiPayload(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return false;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return ["reply", "language", "stage", "shouldHandoff"].some((key) => Object.prototype.hasOwnProperty.call(parsed, key));
  } catch {
    return /"reply"\s*:|"language"\s*:|"stage"\s*:|"shouldHandoff"\s*:/i.test(trimmed);
  }
}

function fallbackReply(input: ReplyInput, config: AppConfig): AiReply {
  const sample = input.samples[0];
  const language = input.conversation.language === "unknown" ? "zh" : input.conversation.language;
  const sampleReply = sample?.standardReply && !isMechanicalTemplateReply(sample.standardReply) ? sample.standardReply : "";
  const baseReply = contextualFallbackReply(input, config) || sampleReply || defaultReply(language, config, input.inviteCode);
  const reply = sanitizeCustomerVisibleReply(ensureInviteInReply(baseReply, input, config), language);
  return {
    reply,
    language,
    stage: input.conversation.stage,
    extractedPhone: input.conversation.extractedPhone,
    extractedTelegram: input.conversation.extractedTelegram,
    extractedWhatsApp: input.conversation.extractedWhatsApp,
    shouldHandoff: false,
    fallback: true
  };
}

function defaultReply(language: string, config: AppConfig, inviteCode?: A2CInviteCodeRecord): string {
  const registration = inviteCode ? inviteDisplayText(inviteCode, language, config.PLATFORM_REGISTER_URL) : config.PLATFORM_REGISTER_URL;
  const link = registration ? ` ${registration}` : "";
  if (language === "en") return `Please complete the platform registration first, then send us your phone number and Telegram account.${link}`;
  if (language === "ms") return `Sila lengkapkan pendaftaran platform dahulu, kemudian hantar nombor telefon dan akaun Telegram anda.${link}`;
  if (language === "id") return `Silakan selesaikan pendaftaran platform terlebih dahulu, lalu kirim nomor telepon dan akun Telegram Anda.${link}`;
  if (language === "th") return `กรุณาสมัครบัญชีแพลตฟอร์มให้เสร็จก่อน จากนั้นส่งเบอร์โทรและบัญชี Telegram ของคุณมาให้เรา${link}`;
  if (language === "vi") return `Vui lòng hoàn tất đăng ký tài khoản nền tảng trước, sau đó gửi số điện thoại và tài khoản Telegram của bạn.${link}`;
  if (language === "pt-BR") return `Conclua primeiro o cadastro na plataforma. Depois, envie seu número de telefone e sua conta do Telegram.${link}`;
  if (language === "ja") return `まずプラットフォーム登録を完了してください。完了後、電話番号とTelegramアカウントを送ってください。${link}`;
  return `请先完成平台开户，完成后把您的手机号和 Telegram 账号发给我。${link}`;
}

function inviteRegisterUrl(inviteCode: A2CInviteCodeRecord, fallbackUrl = ""): string {
  const template = inviteCode.registerUrl || fallbackUrl;
  if (!template) return inviteCode.code;
  return template.includes("{code}") ? template.replaceAll("{code}", encodeURIComponent(inviteCode.code)) : template;
}

function inviteDisplayText(inviteCode: A2CInviteCodeRecord, language: string, fallbackUrl = ""): string {
  const template = inviteCode.registerUrl || fallbackUrl;
  const url = inviteRegisterUrl(inviteCode, fallbackUrl);
  if (template.includes("{code}")) return url;
  if (language === "en") return `${url} Invitation code: ${inviteCode.code}`;
  if (language === "pt-BR") return `${url} Código de convite: ${inviteCode.code}`;
  if (language === "ja") return `${url} 招待コード：${inviteCode.code}`;
  if (language === "th") return `${url} รหัสเชิญ: ${inviteCode.code}`;
  if (language === "vi") return `${url} Mã mời: ${inviteCode.code}`;
  if (language === "ms" || language === "id") return `${url} Kode undangan: ${inviteCode.code}`;
  return `${url} 邀请码：${inviteCode.code}`;
}

function ensureInviteInReply(reply: string, input: ReplyInput, config: AppConfig): string {
  if (!input.country?.requirePlatformAccount) return reply;
  if (!input.inviteCode) return sanitizeNoInviteReply(reply, input.conversation.language, config);
  const fallbackUrl = fallbackRegisterUrl(input, config);
  const display = inviteDisplayText(input.inviteCode, input.conversation.language, fallbackUrl);
  const hasCode = reply.includes(input.inviteCode.code);
  const registerUrl = inviteRegisterUrl(input.inviteCode, fallbackUrl);
  const hasUrl = registerUrl ? reply.includes(registerUrl) || Boolean(input.inviteCode.registerUrl && reply.includes(input.inviteCode.registerUrl)) || Boolean(fallbackUrl && reply.includes(fallbackUrl)) : true;
  if (hasCode && hasUrl) return reply;
  const separator = /[。.!?！？]\s*$/.test(reply) ? "\n" : "\n";
  if (input.conversation.language === "en") return `${reply}${separator}Registration link and invitation code: ${display}`;
  if (input.conversation.language === "pt-BR") return `${reply}${separator}Link de cadastro e código de convite: ${display}`;
  if (input.conversation.language === "ja") return `${reply}${separator}登録リンクと招待コード：${display}`;
  return `${reply}${separator}开户链接和邀请码：${display || config.PLATFORM_REGISTER_URL}`;
}

function contextualFallbackReply(input: ReplyInput, config: AppConfig): string {
  const language = input.conversation.language === "unknown" ? "zh" : input.conversation.language;
  const text = input.customerText.trim();
  if (isMechanicalComplaint(text)) return naturalComplaintReply(language);
  if (asksAboutServiceIdentity(text)) return naturalServiceIntroReply(language);
  if (isJobIntent(text)) return naturalJobIntentReply(language);
  if (isGreetingOnly(text) && hasRecentOutbound(input)) return naturalGreetingReply(language, input);
  if (/(邀请码|invite code|invitation code|código|codigo|招待コード)/i.test(input.customerText)) {
    if (input.inviteCode) {
      const display = inviteDisplayText(input.inviteCode, language, fallbackRegisterUrl(input, config));
      if (language === "en") return `Yes, registration requires an invitation code. Please use this registration link and invitation code: ${display}`;
      if (language === "pt-BR") return `Sim, o cadastro precisa de código de convite. Use este link de cadastro e código: ${display}`;
      if (language === "ja") return `はい、登録には招待コードが必要です。こちらの登録リンクと招待コードを使ってください：${display}`;
      return `需要邀请码才能注册。请使用这个开户链接和邀请码：${display}`;
    }
    return missingInviteReply(language, config);
  }
  if (/(今天|几号|日期|what date|what day|today|data de hoje)/i.test(input.customerText)) {
    if (language === "en") return "Today is June 13, 2026. I can continue helping you with the registration after this.";
    if (language === "pt-BR") return "Hoje é 13 de junho de 2026. Depois disso, posso continuar ajudando você com o cadastro.";
    return "今天是 2026年6月13日。您这边如果继续注册，我可以接着协助。";
  }
  return "";
}

function isMechanicalTemplateReply(reply: string): boolean {
  const text = reply.replace(/\s+/g, " ").trim();
  if (!text) return false;
  return /(我是平台客服|平台客服，会继续协助您完成注册流程|想了解如何开户(?:注册)?|协助您完成注册、排查问题、确认手机号|Não entendi sua mensagem|Nao entendi sua mensagem|Pode escrever sua dúvida em uma frase curta|Posso ajudar com cadastro, link, telefone, Telegram|I can help with registration, link, phone, Telegram|Please write your question in one short sentence)/i.test(text);
}

function enforceContactPolicy(reply: string, input: ReplyInput, config: AppConfig): string {
  const country = input.country;
  if (!country) return reply;
  const language = input.conversation.language === "unknown" ? country.defaultLanguage || "zh" : input.conversation.language;
  if (country.requireTelegram && !input.conversation.extractedTelegram && customerSaysNoTelegram(input)) {
    return telegramGuideReply(language, config, country);
  }
  let normalized = reply;
  if (!country.requireWhatsApp) {
    normalized = removeForbiddenContactAsk(normalized, /WhatsApp|Whatsapp|\bWS\b|\bWA\b|WPP|whats app/i);
  }
  if (!country.requireTelegram) {
    normalized = removeForbiddenContactAsk(normalized, /Telegram|\bTG\b|电报|飞机|เทเลแกรม/i);
  }
  if (!normalized.trim()) return defaultReply(language, config, input.inviteCode);
  return normalized.trim();
}

function customerSaysNoTelegram(input: ReplyInput): boolean {
  const text = input.customerText.trim();
  const recentBotAskedTelegram = input.history
    .slice(-4)
    .some((item) => item.direction === "outbound" && /Telegram|\bTG\b|电报|飞机|@用户名|username/i.test(item.content));
  if (/(没有|沒有|不会|不想|没有tg|没有 telegram|no telegram|don't have telegram|dont have telegram|sem telegram|não tenho telegram|nao tenho telegram)/i.test(text)) {
    return /Telegram|\bTG\b|电报|飞机/i.test(text) || recentBotAskedTelegram || text.length <= 12;
  }
  return false;
}

function telegramGuideReply(language: string, config: AppConfig, country?: MerchantCountryRecord): string {
  const guide = country?.tgRegisterGuideUrl || config.TG_REGISTER_GUIDE_URL;
  const suffix = guide ? ` ${guide}` : "";
  if (language === "en") return `No problem. Please register or download Telegram first, then send us your Telegram username starting with @.${suffix}`;
  if (language === "pt-BR") return `Sem problema. Cadastre ou baixe o Telegram primeiro e depois envie seu nome de usuário do Telegram começando com @.${suffix}`;
  if (language === "ja") return `大丈夫です。先にTelegramを登録またはダウンロードしてから、@で始まるユーザー名を送ってください。${suffix}`;
  if (language === "th") return `ไม่เป็นไร กรุณาสมัครหรือดาวน์โหลด Telegram ก่อน จากนั้นส่งชื่อผู้ใช้ Telegram ที่ขึ้นต้นด้วย @ มาให้เรา${suffix}`;
  if (language === "vi") return `Không sao. Vui lòng đăng ký hoặc tải Telegram trước, rồi gửi tên người dùng Telegram bắt đầu bằng @ cho chúng tôi.${suffix}`;
  if (language === "ms" || language === "id") return `Tidak apa-apa. Sila daftar atau muat turun Telegram dahulu, kemudian hantar username Telegram yang bermula dengan @ kepada kami.${suffix}`;
  return `没关系，请先注册或下载 Telegram，然后把 @ 开头的 Telegram 用户名发给我们。${suffix}`;
}

function removeForbiddenContactAsk(reply: string, contactPattern: RegExp): string {
  return reply
    .split(/(?<=[。.!?！？])\s+|\n+/)
    .filter((sentence) => !(contactPattern.test(sentence) && /(提供|发送|发给|send|provide|hantar|envie|enviar|送って|ส่ง)/i.test(sentence)))
    .join("\n");
}

function fallbackRegisterUrl(input: ReplyInput, config: AppConfig): string {
  return input.country?.platformRegisterUrl || config.PLATFORM_REGISTER_URL || "";
}

function sanitizeNoInviteReply(reply: string, language: string, config: AppConfig): string {
  if (/(不需要邀请码|无需邀请码|不需要.*邀请码|no invite|no invitation code|does not need.*invite)/i.test(reply)) {
    return missingInviteReply(language, config);
  }
  return reply;
}

function missingInviteReply(language: string, config: AppConfig): string {
  const suffix = config.PLATFORM_REGISTER_URL ? ` ${config.PLATFORM_REGISTER_URL}` : "";
  if (language === "en") return `Registration requires an invitation code. I am confirming your dedicated invitation code now. Please wait a moment.${suffix}`;
  if (language === "pt-BR") return `O cadastro precisa de código de convite. Estou confirmando seu código exclusivo agora. Aguarde um momento.${suffix}`;
  if (language === "ja") return `登録には招待コードが必要です。専用の招待コードを確認していますので、少々お待ちください。${suffix}`;
  return `注册需要邀请码。我这边正在确认您的专属邀请码，请稍等。${suffix}`;
}

function sanitizeCustomerVisibleReply(reply: string, language: string): string {
  const normalized = sanitizeRegionalChatAppComparisons(reply)
    .replace(/作为(?:一个)?(?:AI|人工智能|机器人|自?动客服|自?动回复)[，,：:\s]*/gi, "")
    .replace(/\b(as an?|i am an?|i'm an?)\s+(ai|artificial intelligence|bot|robot|automated assistant|automated reply)\b[:,\s]*/gi, "")
    .replace(/\b(sou|como)\s+(uma?\s+)?(ia|intelig[eê]ncia artificial|rob[oô]|bot)\b[:,\s]*/gi, "")
    .trim();
  const sentences = normalized
    .split(/(?<=[。.!?！？])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => !containsIdentityDisclosure(sentence));
  const cleaned = sentences.join(language === "zh" || /[\u4E00-\u9FFF]/.test(normalized) ? "\n" : " ").trim();
  return cleaned || platformServiceReply(language);
}

function sanitizeRegionalChatAppComparisons(text: string): string {
  return text
    .replace(/(?:就)?像\s*(?:微信|WeChat)\s*一样[，,、\s]*/gi, "")
    .replace(/(?:和|跟|与)?\s*(?:微信|WeChat)\s*(?:差不多|类似|一样)[，,、\s]*/gi, "")
    .replace(/(?:类似|像)\s*(?:微信|WeChat)[，,、\s]*/gi, "")
    .replace(/(?:微信|WeChat)/gi, "聊天工具")
    .replace(/Telegram\s*[,，]?\s*是个聊天工具/gi, "Telegram 是个聊天工具")
    .replace(/Telegram\s*[,，]?\s*是一个聊天工具/gi, "Telegram 是个聊天工具")
    .trim();
}

function containsIdentityDisclosure(value: string): boolean {
  return /(我是|我只是|这里是|本客服是|客服是).{0,10}(AI|人工智能|机器人|自?动客服|自?动回复|智能客服)|(?:AI|人工智能|机器人|自?动客服|自?动回复).{0,8}(客服|助手|回复|系统)|\b(i am|i'm|this is|we are).{0,20}\b(ai|artificial intelligence|bot|robot|automated assistant|automated reply)\b|\b(ai|bot|robot|automated assistant)\b.{0,12}\b(customer service|support|reply)\b|(?:sou|somos|este atendimento é).{0,20}(ia|intelig[eê]ncia artificial|rob[oô]|bot)/i.test(value);
}

function platformServiceReply(language: string): string {
  if (language === "en") return "I am here. Tell me where you are stuck, and I will help you with the next step.";
  if (language === "pt-BR") return "Estou aqui. Me diga em qual etapa você parou e eu ajudo você a continuar.";
  if (language === "ja") return "こちらで対応します。どの手順で止まっているか教えてください。";
  if (language === "th") return "ฉันอยู่ตรงนี้ แจ้งได้เลยว่าติดขั้นตอนไหน แล้วจะช่วยต่อให้";
  if (language === "vi") return "Tôi vẫn ở đây. Bạn đang vướng ở bước nào thì gửi tôi biết, tôi sẽ hỗ trợ tiếp.";
  if (language === "ms" || language === "id") return "Saya masih di sini. Beri tahu Anda tersangkut di langkah mana, saya akan bantu lanjutkan.";
  return "我在的。您现在卡在哪一步，直接告诉我，我继续帮您处理。";
}

function isMechanicalComplaint(text: string): boolean {
  return /(机械|僵硬|重复|只会|一句话|听不懂|不是|不对|不用|不需要|别发|烦|打扰|robotic|repeat|same thing|not this|wrong|não é|nao e|mecânico|mecanico|repetindo)/i.test(text);
}

function asksAboutServiceIdentity(text: string): boolean {
  return /(介绍一下自己|你是谁|你是做什么|什么平台|who are you|what are you|introduce yourself|quem é você|quem e voce|o que você faz|o que voce faz)/i.test(text);
}

function isGreetingOnly(text: string): boolean {
  return /^(你好|您好|在吗|在不在|hi|hello|hey|good morning|good afternoon|good evening|ol[aá]|oi|bom dia|boa tarde|boa noite|こんにちは|こんばんは)\s*[。.!?？！]*$/i.test(text);
}

function isJobIntent(text: string): boolean {
  return /(找工作|找一份工作|兼职|线上工作|在线工作|工作机会|赚钱|收入|job|work|part[-\s]?time|online work|extra income|emprego|trabalho|renda extra|vaga)/i.test(text);
}

function hasRecentOutbound(input: ReplyInput): boolean {
  return input.history.slice(-6).some((item) => item.direction === "outbound" && item.content.trim());
}

function naturalComplaintReply(language: string): string {
  if (language === "en") return "Sorry, I did not understand you well just now. You can tell me directly whether you want to register, check Telegram, or verify your phone number, and I will handle that step.";
  if (language === "pt-BR") return "Desculpe, não entendi bem agora. Você pode me dizer direto se quer se cadastrar, resolver o Telegram ou confirmar o telefone, e eu sigo por essa etapa.";
  if (language === "ja") return "すみません、先ほどはうまく理解できていませんでした。登録、Telegram、電話番号確認のどれを進めたいか教えてください。";
  return "抱歉，刚才没有理解准确。您可以直接告诉我：是想注册、处理 Telegram，还是核对手机号？我按您当前这一步来处理。";
}

function naturalServiceIntroReply(language: string): string {
  if (language === "en") return "I mainly help you complete the platform registration and contact verification. If you want to continue, I can guide you step by step.";
  if (language === "pt-BR") return "Eu ajudo principalmente com o cadastro na plataforma e a verificação do contato. Se quiser continuar, posso orientar você passo a passo.";
  if (language === "ja") return "主にプラットフォーム登録と連絡先確認をお手伝いします。続ける場合は、順番に案内します。";
  return "我这边主要协助您完成开户注册和联系方式核对。您如果要继续，我可以按步骤带您处理。";
}

function naturalJobIntentReply(language: string): string {
  if (language === "en") return "Yes, I can help you understand this online work opportunity. If you are interested, I will guide you step by step, starting with the registration.";
  if (language === "pt-BR") return "Sim, posso explicar esta oportunidade de trabalho online. Se você tiver interesse, eu oriento passo a passo, começando pelo cadastro.";
  if (language === "ja") return "はい、このオンラインの仕事について案内できます。興味があれば、登録から順番にサポートします。";
  return "可以的，我先帮您了解这份线上工作。如果您有兴趣，我会从注册开始一步一步带您处理。";
}

function naturalGreetingReply(language: string, input: ReplyInput): string {
  if (input.country?.requireTelegram && input.conversation.extractedPhone && !input.conversation.extractedTelegram) {
    if (language === "en") return "I am here. Please send me your Telegram username starting with @ when it is ready.";
    if (language === "pt-BR") return "Estou aqui. Quando estiver pronto, envie seu nome de usuário do Telegram começando com @.";
    return "我在的。您准备好后，把 @ 开头的 Telegram 用户名发给我就可以。";
  }
  if (language === "en") return "I am here. Do you want to continue with the registration, or did you run into a problem?";
  if (language === "pt-BR") return "Estou aqui. Você quer continuar o cadastro ou encontrou algum problema?";
  if (language === "ja") return "対応しています。登録を続けますか、それとも問題がありましたか？";
  return "我在的。您是想继续注册，还是刚才哪一步遇到问题了？";
}
