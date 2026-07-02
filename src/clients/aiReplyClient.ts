import type { AppConfig } from "../config.js";
import type { A2CInviteCodeRecord, MerchantAgentProfileRecord } from "../repositories.js";
import { GeminiReplyClient } from "./gemini.js";
import { agentProfileBlock, safeAgentProfile } from "./aiAgentProfilePrompt.js";
import { generateAiText, selectedAiProvider } from "./aiProvider.js";
import type { AiReply, ReplyInput } from "./aiReplyTypes.js";
export type { AiReply, ReplyInput } from "./aiReplyTypes.js";

export class AiReplyClient {
  constructor(private readonly config: AppConfig) {}

  async generateReply(input: ReplyInput): Promise<AiReply> {
    if (selectedAiProvider(this.config) === "gemini") {
      return new GeminiReplyClient(this.config).generateReply(input);
    }
    try {
      const text = await generateAiText(this.config, JSON.stringify({
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
          registerUrl: input.inviteCode.registerUrl,
          status: input.inviteCode.status
        } : null
      }), {
        temperature: 0.45,
        maxOutputTokens: 900,
        systemInstruction: buildReplySystemPrompt(input.agentProfile)
      });
      return normalizeAiReply(JSON.parse(stripJsonFence(text)) as Partial<AiReply>, input, this.config);
    } catch (error) {
      const fallback = fallbackReply(input, this.config);
      fallback.fallback = true;
      fallback.error = error instanceof Error ? error.message : "AI 回复失败";
      return fallback;
    }
  }
}

function normalizeAiReply(value: Partial<AiReply>, input: ReplyInput, config: AppConfig): AiReply {
  if (!value || typeof value.reply !== "string" || !value.reply.trim()) return fallbackReply(input, config);
  return {
    reply: sanitizeCustomerVisibleReply(value.reply.trim()),
    language: typeof value.language === "string" && value.language ? value.language : input.conversation.language,
    stage: typeof value.stage === "string" && value.stage ? value.stage : input.conversation.stage,
    extractedPhone: typeof value.extractedPhone === "string" ? value.extractedPhone : input.conversation.extractedPhone,
    extractedTelegram: typeof value.extractedTelegram === "string" ? value.extractedTelegram : input.conversation.extractedTelegram,
    extractedWhatsApp: typeof value.extractedWhatsApp === "string" ? value.extractedWhatsApp : input.conversation.extractedWhatsApp,
    shouldHandoff: Boolean(value.shouldHandoff)
  };
}

function fallbackReply(input: ReplyInput, config: AppConfig): AiReply {
  const language = input.conversation.language === "unknown" ? "zh" : input.conversation.language;
  const sample = input.samples.find((item) => item.standardReply && !isMechanicalTemplateReply(item.standardReply));
  const safeSampleReply = sample?.standardReply && !containsNoInviteClaim(sample.standardReply)
    ? sample.standardReply
    : "";
  const baseReply = safeSampleReply || contextualFallbackReply(input, config) || defaultReply(input, config);
  const reply = sanitizeCustomerVisibleReply(ensureInviteInReply(baseReply, input, config));
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

function sanitizeCustomerVisibleReply(text: string): string {
  return text
    .replace(/(?:我是|我这边是|作为|身为)\s*(AI|人工智能|机器人|機器人|自动客服|自動客服|模型)/gi, "我这边")
    .replace(/\b(AI|robot|bot|model)\b/gi, "")
    .trim();
}

function defaultReply(input: ReplyInput, config: AppConfig): string {
  const language = input.conversation.language === "unknown" ? "zh" : input.conversation.language;
  const registration = input.inviteCode ? inviteDisplayText(input.inviteCode, language, fallbackRegisterUrl(input, config)) : fallbackRegisterUrl(input, config);
  const link = registration ? ` ${registration}` : "";
  if (language === "en") return `Please complete the platform registration first, then send us your phone number and Telegram account.${link}`;
  if (language === "es") return `Primero complete el registro en la plataforma y luego envíeme su número de teléfono y su cuenta de Telegram.${link}`;
  if (language === "pt-BR") return `Conclua primeiro o cadastro na plataforma. Depois, envie seu número de telefone e sua conta do Telegram.${link}`;
  return `请先完成平台开户，完成后把您的手机号和 Telegram 账号发给我。${link}`;
}

function contextualFallbackReply(input: ReplyInput, config: AppConfig): string {
  const language = input.conversation.language === "unknown" ? "zh" : input.conversation.language;
  const text = input.customerText.trim();
  if (/(邀请码|invite code|invitation code|código|codigo|招待コード)/i.test(text)) {
    if (input.inviteCode) {
      const display = inviteDisplayText(input.inviteCode, language, fallbackRegisterUrl(input, config));
      if (language === "en") return `Yes, registration requires an invitation code. Please use this registration link and invitation code: ${display}`;
      if (language === "es") return `Sí, el registro necesita un código de invitación. Use este enlace de registro y este código: ${display}`;
      if (language === "pt-BR") return `Sim, o cadastro precisa de código de convite. Use este link de cadastro e código: ${display}`;
      return `需要邀请码才能注册。请使用这个开户链接和邀请码：${display}`;
    }
    return missingInviteReply(language, input, config);
  }
  if (/(发我链接|注册链接|开户链接|注册入口|link please|register link|registration link)/i.test(text) && input.inviteCode) {
    const display = inviteDisplayText(input.inviteCode, language, fallbackRegisterUrl(input, config));
    if (language === "en") return `Please use this registration link and invitation code: ${display}`;
    if (language === "es") return `Use este enlace de registro y este código de invitación: ${display}`;
    if (language === "pt-BR") return `Use este link de cadastro e código de convite: ${display}`;
    return `请使用这个开户链接和邀请码：${display}`;
  }
  return "";
}

function ensureInviteInReply(reply: string, input: ReplyInput, config: AppConfig): string {
  if (!input.inviteCode) return containsNoInviteClaim(reply) ? missingInviteReply(input.conversation.language, input, config) : reply;
  const fallbackUrl = fallbackRegisterUrl(input, config);
  const display = inviteDisplayText(input.inviteCode, input.conversation.language, fallbackUrl);
  const registerUrl = inviteRegisterUrl(input.inviteCode, fallbackUrl);
  const hasCode = reply.includes(input.inviteCode.code);
  const hasUrl = registerUrl ? reply.includes(registerUrl) || Boolean(input.inviteCode.registerUrl && reply.includes(input.inviteCode.registerUrl)) || Boolean(fallbackUrl && reply.includes(fallbackUrl)) : true;
  if (hasCode && hasUrl) return reply;
  if (!/(注册链接|开户链接|register|cadastro|link|邀请码|invite|convite)/i.test(input.customerText + "\n" + reply)) return reply;
  const language = input.conversation.language === "unknown" ? "zh" : input.conversation.language;
  if (language === "en") return `${reply}\nRegistration link and invitation code: ${display}`;
  if (language === "es") return `${reply}\nEnlace de registro y código de invitación: ${display}`;
  if (language === "pt-BR") return `${reply}\nLink de cadastro e código de convite: ${display}`;
  return `${reply}\n开户链接和邀请码：${display}`;
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
  if (language === "es") return `${url} Código de invitación: ${inviteCode.code}`;
  if (language === "pt-BR") return `${url} Código de convite: ${inviteCode.code}`;
  return `${url} 邀请码：${inviteCode.code}`;
}

function fallbackRegisterUrl(input: ReplyInput, config: AppConfig): string {
  return input.country?.platformRegisterUrl || config.PLATFORM_REGISTER_URL || "";
}

function missingInviteReply(language: string, input: ReplyInput, config: AppConfig): string {
  const suffix = fallbackRegisterUrl(input, config) ? ` ${fallbackRegisterUrl(input, config)}` : "";
  if (language === "en") return `Registration requires an invitation code. I am confirming your dedicated invitation code now. Please wait a moment.${suffix}`;
  if (language === "es") return `El registro necesita un código de invitación. Estoy confirmando su código exclusivo ahora. Espere un momento.${suffix}`;
  if (language === "pt-BR") return `O cadastro precisa de código de convite. Estou confirmando seu código exclusivo agora. Aguarde um momento.${suffix}`;
  return `注册需要邀请码。我这边正在确认您的专属邀请码，请稍等。${suffix}`;
}

function containsNoInviteClaim(reply: string): boolean {
  return /(不需要邀请码|无需邀请码|不需要.*邀请码|no invite|no invitation code|does not need.*invite)/i.test(reply);
}

function isMechanicalTemplateReply(reply: string): boolean {
  return /(我是平台客服|平台客服，会继续协助您完成注册流程|想了解如何开户注册|请问您现在想先处理哪一步|Não entendi sua mensagem|Please write your question in one short sentence)/i.test(reply);
}

function buildReplySystemPrompt(agentProfile?: MerchantAgentProfileRecord): string {
  return `
你是甲方配置的真人客服口吻助手。你必须根据甲方上传的对话资料、话本、客户历史聊天记录和客户当前语言回复。
${agentProfileBlock(agentProfile)}
目标：
1. 引导客户完成平台开户。
2. 根据当前国家配置，引导客户提供手机号、Telegram 或 WhatsApp。
3. 当客户满足当前国家目标后，停止继续引导，进入人工接管。
规则：
- 面向客户的 reply 里，任何情况下都不能暴露自己是 AI、机器人、模型、自动客服或自动回复。
- 必须使用客户最近消息的主要语言回复。
- 优先参考 relevantTrainingSamples、knowledgeItems、trainingMaterials、customerMemory、country。
- 只收集 country 当前要求的联系方式。
- 如果 assignedInviteCode 存在，开户注册引导必须同时包含 registerUrl 和邀请码 code。
- 不要要求客户提供密码、验证码、支付信息或证件敏感信息。
- 每次只给客户当前最需要的一步，简短自然，像真人客服。
输出必须是 JSON，字段为 reply、language、stage、extractedPhone、extractedTelegram、extractedWhatsApp、shouldHandoff。
`;
}

function stripJsonFence(text: string): string {
  return text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}
