import { analyzeMessage } from "../domain/analyzer.js";
import { rankSamples } from "../domain/sampleRetrieval.js";
import { buildStrictFlowReply, strictFlowNeedsInviteCode } from "../domain/strictFlow.js";
import { A2CClient } from "../clients/a2c.js";
import { GeminiReplyClient } from "../clients/gemini.js";
import { TelegramClient } from "../clients/telegram.js";
import type { AppConfig } from "../config.js";
import type { MerchantConfigRecord } from "../repositories.js";
import type { Repositories } from "../repositories.js";
import { buildHandoffMessage } from "./handoff.js";
import { translateForOperator } from "./translation.js";

export interface A2CWebhookPayload {
  id: string;
  timestamp: number;
  type: string;
  data: {
    messageId: string;
    content?: string;
    from: string;
    to: string;
    msgType: string;
    timestamp: number;
    nickname?: string;
    headImg?: string;
    fileName?: string;
    url?: string;
    caption?: string;
  };
}

export class WebhookProcessor {
  constructor(
    private readonly repos: Repositories,
    private readonly ai: GeminiReplyClient,
    private readonly a2c: A2CClient,
    private readonly telegram: TelegramClient,
    private readonly config: AppConfig
  ) {}

  async process(payload: A2CWebhookPayload, merchantId?: string): Promise<{ status: string; conversationId?: string }> {
    if (payload.type !== "CUSTOMER_MESSAGE") return { status: "ignored" };

    const data = payload.data;
    const msgType = normalizeMessageType(data.msgType, data.url);
    const mediaUrl = data.url || (isUrl(data.content) ? data.content : "");
    const analysisText = msgType === "text" ? data.content || data.caption || "" : data.caption || "";
    const content = msgType === "text" ? analysisText : data.caption || mediaLabel(msgType);
    const merchant = merchantId ? this.repos.getMerchant(merchantId) ?? this.repos.findMerchantByA2CAccount(data.to) : this.repos.findMerchantByA2CAccount(data.to);
    const merchantConfig = this.repos.getMerchantConfig(merchant.id);
    const country = this.repos.ensurePrimaryCountry(merchant.id);
    const runtimeConfig = appConfigForMerchant(this.config, merchantConfig, country);
    const ai = new GeminiReplyClient(runtimeConfig);
    const a2c = new A2CClient(runtimeConfig, this.repos.a2cTokenStore(merchant.id));
    const telegram = new TelegramClient(runtimeConfig);
    const conversation = this.repos.getOrCreateConversation(data.from, data.to, data.nickname ?? "", merchant.id, country.id);
    const analysis = analyzeMessage(analysisText, conversation.language);
    const inboundTranslation = analysisText
      ? await translateForOperator(runtimeConfig, analysisText, analysis.language)
      : { originalText: content, translatedText: "", targetLanguage: "zh-CN", status: "skipped" as const, error: "" };

    const inserted = this.repos.insertMessage({
      conversationId: conversation.id,
      direction: "inbound",
      externalId: data.messageId || payload.id,
      content,
      msgType,
      language: analysis.language,
      intent: analysis.intent,
      phoneDetected: analysis.phone,
      telegramDetected: analysis.telegram,
      whatsappDetected: analysis.whatsapp,
      rawPayload: {
        ...payload,
        originalContent: inboundTranslation.originalText,
        translatedContent: inboundTranslation.translatedText,
        targetLanguage: inboundTranslation.targetLanguage,
        translationStatus: inboundTranslation.status,
        translationError: inboundTranslation.error || "",
        mediaUrl,
        fileName: data.fileName || ""
      }
    });
    if (!inserted.inserted) return { status: "duplicate", conversationId: conversation.id };

    conversation.language = analysis.language;
    conversation.stage = analysis.stage;
    conversation.extractedPhone = conversation.extractedPhone || analysis.phone;
    conversation.extractedTelegram = conversation.extractedTelegram || analysis.telegram;
    conversation.extractedWhatsApp = conversation.extractedWhatsApp || analysis.whatsapp;
    if (analysis.intent === "platform_register_done") {
      this.repos.markInviteCodeUsedForConversation(conversation.id, conversation.merchantId);
    }
    this.repos.upsertCustomerFromConversation(conversation);
    const inboundMemory = this.repos.updateCustomerMemoryFromMessage(conversation, { intent: analysis.intent, content: analysisText || content, direction: "inbound" });

    if (conversation.status === "human_handoff") {
      this.repos.updateConversation(conversation);
      this.repos.upsertCustomerFromConversation(conversation);
      return { status: "already_handoff", conversationId: conversation.id };
    }

    if (isCountryGoalComplete(conversation, country)) {
      conversation.stage = "ready_for_handoff";
      conversation.status = "human_handoff";
      this.repos.markInviteCodeUsedForConversation(conversation.id, conversation.merchantId);
      if (merchantConfig.smartReplyEnabled) {
        await this.sendVerificationReply(conversation, data, analysis.language, a2c);
      }
      await this.notifyHandoffOnce(conversation, data.messageId, new Date((data.timestamp || Date.now()) * 1000).toISOString(), telegram);
      this.repos.updateConversation(conversation);
      this.repos.upsertCustomerFromConversation(conversation);
      return { status: "handoff", conversationId: conversation.id };
    }

    if (!merchantConfig.smartReplyEnabled) {
      this.repos.updateConversation(conversation);
      this.repos.upsertCustomerFromConversation(conversation);
      return { status: "auto_reply_disabled", conversationId: conversation.id };
    }

    const useNaturalReply = shouldBypassStrictFlowForNaturalReply(analysisText || content, conversation);
    if (!useNaturalReply) {
      const strictNeedsInviteCode = strictFlowNeedsInviteCode({
        merchant,
        country,
        conversation,
        analysis,
        customerText: analysisText || content
      });
      const strictInviteCode = strictNeedsInviteCode
        ? this.repos.reserveInviteCodeForConversation(conversation)
        : undefined;
      const strictReply = buildStrictFlowReply({
        merchant,
        country,
        conversation,
        analysis,
        customerText: analysisText || content,
        inviteCode: strictInviteCode,
        config: runtimeConfig
      });
      if (strictReply.enabled) {
      conversation.language = strictReply.language;
      conversation.stage = strictReply.stage;
      conversation.flowStep = strictReply.nextFlowStep;

      let externalId = "";
      let a2cSendStatus: "sent" | "failed" = "sent";
      let a2cSendError = "";
      try {
        externalId = await a2c.sendMessage({
          to: data.from,
          senderPhoneNumber: data.to,
          type: "text",
          content: strictReply.reply
        });
        if (!externalId) externalId = `a2c_strict:${data.messageId || payload.id}:${Date.now()}`;
      } catch (error) {
        a2cSendStatus = "failed";
        a2cSendError = error instanceof Error ? error.message : "unknown";
        externalId = `strict_send_failed:${data.messageId || payload.id}:${Date.now()}:${a2cSendError.slice(0, 120)}`;
      }

      const outboundTranslation = await translateForOperator(runtimeConfig, strictReply.reply, strictReply.language);
      const outbound = this.repos.insertMessage({
        conversationId: conversation.id,
        direction: "outbound",
        externalId,
        content: strictReply.reply,
        msgType: "text",
        language: strictReply.language,
        intent: "unknown",
        rawPayload: {
          strictFlow: true,
          strictFlowStep: strictReply.nextFlowStep,
          aiFallback: Boolean(strictReply.fallback),
          originalContent: outboundTranslation.originalText,
          operatorTranslatedContent: outboundTranslation.translatedText,
          operatorTranslationTargetLanguage: outboundTranslation.targetLanguage,
          operatorTranslationStatus: outboundTranslation.status,
          operatorTranslationError: outboundTranslation.error || "",
          a2cSendStatus,
          a2cSendError,
          inviteCodeRequired: Boolean(country.requirePlatformAccount),
          inviteCodeMissing: Boolean(strictReply.needsInviteCode && !strictInviteCode),
          assignedInviteCode: strictInviteCode ? {
            id: strictInviteCode.id,
            code: strictInviteCode.code,
            registerUrl: strictInviteCode.registerUrl,
            status: strictInviteCode.status
          } : null
        }
      });
      this.repos.updateConversation(conversation);
      this.repos.upsertCustomerFromConversation(conversation);
      this.repos.updateCustomerMemoryFromMessage(conversation, { intent: "unknown", content: strictReply.reply, direction: "outbound" });
      return { status: a2cSendStatus === "sent" && outbound.inserted ? "strict_flow_replied" : "strict_flow_send_failed", conversationId: conversation.id };
      }
    }

    const enabledSamples = this.repos.listTrainingSamples({ merchantId: merchant.id, countryId: country.id, enabled: true });
    const knowledge = this.repos.listKnowledgeItems({ merchantId: merchant.id, countryId: country.id, enabled: true });
    const trainingMaterials = this.repos.listTrainingMaterialSnippets(merchant.id, 20, country.id);
    const shouldIncludeRegistrationDetails = shouldUseInviteForReply(country, conversation, analysis.intent, analysisText || content);
    const inviteCode = shouldIncludeRegistrationDetails
      ? this.repos.reserveInviteCodeForConversation(conversation)
      : undefined;
    const samples = rankSamples(enabledSamples, {
      text: analysisText || content,
      language: analysis.language,
      intent: analysis.intent,
      stage: analysis.stage
    });
    const history = this.repos.listConversationMessages(conversation.id, 20);
    const aiReply = await ai.generateReply({ customerText: analysisText || content, conversation, history, samples, knowledge, trainingMaterials, memory: inboundMemory, country, inviteCode });
    if (!shouldIncludeRegistrationDetails) {
      aiReply.reply = suppressRegistrationDetailsForNonLinkStep(aiReply.reply, runtimeConfig, country, conversation, aiReply.language || conversation.language);
    }

    if (aiReply.extractedPhone && !conversation.extractedPhone) conversation.extractedPhone = aiReply.extractedPhone;
    if (aiReply.extractedTelegram && !conversation.extractedTelegram) conversation.extractedTelegram = aiReply.extractedTelegram;
    if (aiReply.extractedWhatsApp && !conversation.extractedWhatsApp) conversation.extractedWhatsApp = aiReply.extractedWhatsApp;
    if (aiReply.language) conversation.language = aiReply.language;
    if (aiReply.stage === "ready_for_handoff" || isCountryGoalComplete(conversation, country)) {
      conversation.stage = "ready_for_handoff";
      conversation.status = "human_handoff";
      this.repos.markInviteCodeUsedForConversation(conversation.id, conversation.merchantId);
      await this.sendVerificationReply(conversation, data, aiReply.language || analysis.language, a2c);
      await this.notifyHandoffOnce(conversation, data.messageId, new Date((data.timestamp || Date.now()) * 1000).toISOString(), telegram);
      this.repos.updateConversation(conversation);
      this.repos.upsertCustomerFromConversation(conversation);
      return { status: "handoff", conversationId: conversation.id };
    }

    let externalId = "";
    let a2cSendStatus: "sent" | "failed" = "sent";
    let a2cSendError = "";
    try {
      externalId = await a2c.sendMessage({
        to: data.from,
        senderPhoneNumber: data.to,
        type: "text",
        content: aiReply.reply
      });
      if (!externalId) externalId = `a2c_sent:${data.messageId || payload.id}:${Date.now()}`;
    } catch (error) {
      a2cSendStatus = "failed";
      a2cSendError = error instanceof Error ? error.message : "unknown";
      externalId = `send_failed:${data.messageId || payload.id}:${Date.now()}:${a2cSendError.slice(0, 120)}`;
    }

    const outboundTranslation = await translateForOperator(runtimeConfig, aiReply.reply, aiReply.language || conversation.language);
    const outbound = this.repos.insertMessage({
      conversationId: conversation.id,
      direction: "outbound",
      externalId,
      content: aiReply.reply,
      msgType: "text",
      language: aiReply.language || conversation.language,
      intent: "unknown",
      rawPayload: {
        samples: samples.map((sample) => sample.id),
        trainingMaterials: trainingMaterials.map((item) => item.id),
        aiFallback: Boolean(aiReply.fallback),
        aiError: aiReply.error || "",
        originalContent: outboundTranslation.originalText,
        operatorTranslatedContent: outboundTranslation.translatedText,
        operatorTranslationTargetLanguage: outboundTranslation.targetLanguage,
        operatorTranslationStatus: outboundTranslation.status,
        operatorTranslationError: outboundTranslation.error || "",
        a2cSendStatus,
        a2cSendError,
        inviteCodeRequired: Boolean(country.requirePlatformAccount),
        inviteCodeMissing: Boolean(country.requirePlatformAccount && !inviteCode),
        assignedInviteCode: inviteCode ? {
          id: inviteCode.id,
          code: inviteCode.code,
          registerUrl: inviteCode.registerUrl,
          status: inviteCode.status
        } : null
      }
    });
    this.repos.updateConversation(conversation);
    this.repos.upsertCustomerFromConversation(conversation);
    this.repos.updateCustomerMemoryFromMessage(conversation, { intent: "unknown", content: aiReply.reply, direction: "outbound" });

    return { status: a2cSendStatus === "sent" && outbound.inserted ? "replied" : "reply_send_failed", conversationId: conversation.id };
  }

  private async sendVerificationReply(
    conversation: Parameters<Repositories["updateConversation"]>[0],
    data: A2CWebhookPayload["data"],
    language: string,
    a2c: A2CClient
  ): Promise<void> {
    const content = verificationReply(language);
    let externalId = "";
    let a2cSendStatus: "sent" | "failed" = "sent";
    let a2cSendError = "";
    try {
      externalId = await a2c.sendMessage({
        to: data.from,
        senderPhoneNumber: data.to,
        type: "text",
        content
      });
      if (!externalId) externalId = `a2c_verify:${data.messageId}:${Date.now()}`;
    } catch (error) {
      a2cSendStatus = "failed";
      a2cSendError = error instanceof Error ? error.message : "unknown";
      externalId = `verify_failed:${data.messageId}:${Date.now()}:${a2cSendError.slice(0, 120)}`;
    }

    const operatorTranslation = await translateForOperator(appConfigForConversation(this.config, this.repos, conversation), content, language);
    this.repos.insertMessage({
      conversationId: conversation.id,
      direction: "outbound",
      externalId,
      content,
      msgType: "text",
      language,
      intent: "human_request",
      rawPayload: {
        systemFinalReply: true,
        originalContent: operatorTranslation.originalText,
        operatorTranslatedContent: operatorTranslation.translatedText,
        operatorTranslationTargetLanguage: operatorTranslation.targetLanguage,
        operatorTranslationStatus: operatorTranslation.status,
        operatorTranslationError: operatorTranslation.error || "",
        a2cSendStatus,
        a2cSendError
      }
    });
    this.repos.updateCustomerMemoryFromMessage(conversation, { intent: "human_request", content, direction: "outbound" });
  }

  private async notifyHandoffOnce(conversation: Parameters<Repositories["updateConversation"]>[0], lastMessageId: string, lastMessageTime: string, telegram = this.telegram): Promise<void> {
    if (conversation.handoffNotified) return;
    const history = this.repos.listConversationMessages(conversation.id, 8);
    const summary = history.map((item) => `${item.direction}: ${item.content}`).join("\n");
    const message = buildHandoffMessage({ conversation, lastMessageId, lastMessageTime, summary });
    try {
      await telegram.sendHandoffMessage(message);
      conversation.handoffNotified = 1;
      this.repos.insertHandoffEvent(conversation.id, message, true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "unknown";
      this.repos.markTelegramBindingInvalid(conversation.merchantId, errorMessage);
      this.repos.insertHandoffEvent(conversation.id, message, false, errorMessage);
    }
  }
}

function appConfigForMerchant(config: AppConfig, merchantConfig: MerchantConfigRecord, country?: { platformRegisterUrl?: string; tgRegisterGuideUrl?: string }): AppConfig {
  return {
    ...config,
    A2C_BASE_URL: merchantConfig.a2cBaseUrl || config.A2C_BASE_URL,
    A2C_APP_ID: merchantConfig.a2cAppId || config.A2C_APP_ID,
    A2C_APP_SECRET: merchantConfig.a2cAppSecret || config.A2C_APP_SECRET,
    OPENAI_API_KEY: merchantConfig.openaiApiKey || config.OPENAI_API_KEY,
    OPENAI_MODEL: merchantConfig.openaiModel || config.OPENAI_MODEL,
    GOOGLE_AI_API_KEY: merchantConfig.googleAiApiKey || config.GOOGLE_AI_API_KEY,
    GOOGLE_AI_MODEL: merchantConfig.googleAiModel || config.GOOGLE_AI_MODEL,
    TELEGRAM_BOT_TOKEN: merchantConfig.telegramBotToken || config.TELEGRAM_BOT_TOKEN,
    TELEGRAM_HANDOFF_CHAT_ID: merchantConfig.telegramHandoffChatId || config.TELEGRAM_HANDOFF_CHAT_ID,
    PLATFORM_REGISTER_URL: country?.platformRegisterUrl || merchantConfig.platformRegisterUrl || config.PLATFORM_REGISTER_URL,
    TG_REGISTER_GUIDE_URL: country?.tgRegisterGuideUrl || merchantConfig.tgRegisterGuideUrl || config.TG_REGISTER_GUIDE_URL
  };
}

function appConfigForConversation(config: AppConfig, repos: Repositories, conversation: Parameters<Repositories["updateConversation"]>[0]): AppConfig {
  const merchantConfig = repos.getMerchantConfig(conversation.merchantId);
  const country = repos.getMerchantCountry(conversation.countryId);
  return appConfigForMerchant(config, merchantConfig, country);
}

function isCountryGoalComplete(
  conversation: { extractedPhone: string; extractedTelegram: string; extractedWhatsApp: string },
  country: { requirePhone: boolean; requireTelegram: boolean; requireWhatsApp: boolean }
): boolean {
  if (country.requirePhone && !conversation.extractedPhone) return false;
  if (country.requireTelegram && !conversation.extractedTelegram) return false;
  if (country.requireWhatsApp && !conversation.extractedWhatsApp) return false;
  return country.requirePhone || country.requireTelegram || country.requireWhatsApp;
}

function shouldUseInviteForReply(
  country: { requirePlatformAccount: boolean },
  conversation: { stage: string; extractedPhone: string; extractedTelegram: string; status: string },
  intent: string,
  customerText: string
): boolean {
  if (!country.requirePlatformAccount || conversation.status === "human_handoff") return false;
  return asksForRegistrationLink(customerText, intent);
}

export function shouldBypassStrictFlowForNaturalReply(
  customerText: string,
  conversation: { flowStep?: string; stage?: string }
): boolean {
  const text = customerText.trim();
  if (!text) return false;
  if (/(介绍一下自己|你是谁|你是做什么|什么平台|机械|僵硬|重复|只会|一句话|听不懂|不是|不对|不用|不需要|别发|烦|打扰|who are you|introduce yourself|what are you|robotic|repeat|same thing|not this|wrong|não é|nao e|mecânico|mecanico|repetindo|quem é você|quem e voce)/i.test(text)) {
    return true;
  }
  const hasStartedFlow = Boolean(conversation.flowStep || (conversation.stage && conversation.stage !== "need_platform_register"));
  if (hasStartedFlow && /^(你好|您好|在吗|在不在|hi|hello|hey|good morning|good afternoon|good evening|ol[aá]|oi|bom dia|boa tarde|boa noite|こんにちは|こんばんは)\s*[。.!?？！]*$/i.test(text)) {
    return true;
  }
  if (hasStartedFlow && /(找工作|找一份工作|兼职|线上工作|在线工作|工作机会|赚钱|收入|job|work|part[-\s]?time|online work|extra income|emprego|trabalho|renda extra|vaga)/i.test(text)) {
    return true;
  }
  return false;
}

function asksForRegistrationLink(customerText: string, intent: string): boolean {
  return intent === "ask_link" || intent === "ask_platform_register" || /(邀请码|邀請碼|开户链接|注册链接|注册入口|link|invite code|invitation code|código|codigo|convite|cadastro)/i.test(customerText);
}

export function suppressRegistrationDetailsForNonLinkStep(
  reply: string,
  config: Pick<AppConfig, "PLATFORM_REGISTER_URL">,
  country: { platformRegisterUrl?: string; requireTelegram?: boolean },
  conversation: { extractedPhone?: string; extractedTelegram?: string },
  language: string
): string {
  const cleaned = reply
    .split(/(?<=[。！？])\s*|\n+/)
    .map((part) => stripKnownRegistrationUrls(part, config, country).trim())
    .filter((part) => part && !isRegistrationInviteSentence(part) && !isEmptyRegistrationInstruction(part))
    .join(language === "zh" || /[\u4E00-\u9FFF]/.test(reply) ? "" : " ")
    .replace(/\s{2,}/g, " ")
    .replace(/([。.!?！？]){2,}/g, "$1")
    .trim();
  if (country.requireTelegram && conversation.extractedPhone && !conversation.extractedTelegram) {
    if (cleaned && !asksForAlreadyCollectedPhone(cleaned) && !isLowSignalReply(cleaned)) return cleaned;
    if (language === "en") return "Please send me your Telegram username starting with @.";
    if (language === "pt-BR") return "Por favor, envie seu nome de usuário do Telegram começando com @.";
    return "请把 @ 开头的 Telegram 用户名发给我。";
  }
  if (cleaned && !isLowSignalReply(cleaned)) return cleaned;
  if (language === "en") return "Okay, I will continue helping you with the next step.";
  if (language === "pt-BR") return "Certo, vou continuar ajudando você no próximo passo.";
  return "好的，我继续协助您。";
}

function stripKnownRegistrationUrls(
  value: string,
  config: Pick<AppConfig, "PLATFORM_REGISTER_URL">,
  country: { platformRegisterUrl?: string }
): string {
  let result = value;
  for (const template of [country.platformRegisterUrl || "", config.PLATFORM_REGISTER_URL || ""]) {
    if (!template) continue;
    for (const candidate of registrationUrlCandidates(template)) {
      result = result.split(candidate).join("");
    }
    const escaped = escapeRegExp(template);
    const pattern = new RegExp(
      escaped.replace("\\{code\\}", "[^\\s。.!?！？，,；;]+"),
      "gi"
    );
    result = result.replace(pattern, "");
  }
  return result
    .replace(/(?:开户链接和邀请码|开户链接|注册链接|注册入口|开户链接和邀請碼|registration link and invitation code|registration link|register link|link de cadastro e código de convite|link de cadastro)\s*[:：]?\s*/gi, "")
    .replace(/(?:邀请码|邀請碼|invitation code|invite code|código de convite|codigo de convite)\s*[:：]?\s*[A-Za-z0-9_-]+/gi, "")
    .trim();
}

function registrationUrlCandidates(template: string): string[] {
  const withoutCode = template.replace(/\{code\}/g, "");
  const withoutTrailingSlash = withoutCode.replace(/\/+$/, "");
  const withTrailingSlash = `${withoutTrailingSlash}/`;
  return Array.from(new Set([template, withoutCode, withoutTrailingSlash, withTrailingSlash].filter(Boolean)));
}

function isRegistrationInviteSentence(value: string): boolean {
  const hasInvite = /(邀请码|邀請碼|invite code|invitation code|código de convite|codigo de convite|convite)/i.test(value);
  const hasRegister = /(开户链接|注册链接|注册入口|点击.*注册|开户注册|register|registration link|cadastro)/i.test(value);
  const hasUrl = /https?:\/\//i.test(value);
  return (hasInvite || hasUrl) && hasRegister || hasInvite;
}

function isEmptyRegistrationInstruction(value: string): boolean {
  const normalized = value.replace(/\s+/g, "");
  const asksToClickMissingLink = /(点击|打開|打开|open|acesse|clique).*(链接|連結|link)/i.test(value) && !/https?:\/\//i.test(value);
  const mentionsRegistration = /(开户注册|注册|註冊|register|registration|cadastro)/i.test(value);
  const onlyRegisterShell = /[:：]\s*[。.!！?？]?$/.test(value) || /链接[：:]?[。.!！?？]?$/i.test(normalized);
  return mentionsRegistration && (asksToClickMissingLink || onlyRegisterShell);
}

function asksForAlreadyCollectedPhone(value: string): boolean {
  return /(手机号|手機號|电话号码|電話號碼|phone number|telefone|número de telefone|numero de telefone)/i.test(value);
}

function isLowSignalReply(value: string): boolean {
  return /^(您好|你好|嗨|hello|hi|ol[aá]|oi)[!！.。]*$/i.test(value.trim());
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeMessageType(msgType = "", url = ""): "text" | "image" | "video" | "audio" | "document" {
  const value = String(msgType || "").toLowerCase();
  if (value === "text" || value === "image" || value === "video" || value === "audio" || value === "document") return value;
  if (value === "1") return "text";
  if (value === "2") return "image";
  if (value === "3") return "video";
  if (value === "4") return "audio";
  if (value === "5") return "document";
  if (/\.(png|jpe?g|webp|gif|bmp|svg)(\?|$)/i.test(url)) return "image";
  if (/\.(mp4|mov|webm|m4v)(\?|$)/i.test(url)) return "video";
  if (/\.(mp3|wav|m4a|ogg)(\?|$)/i.test(url)) return "audio";
  if (url) return "document";
  return "text";
}

function mediaLabel(type: string): string {
  if (type === "image") return "[图片]";
  if (type === "video") return "[视频]";
  if (type === "audio") return "[音频]";
  if (type === "document") return "[文件]";
  return "";
}

function isUrl(value = ""): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function verificationReply(language: string): string {
  if (language === "en") return "We are verifying your information. Please wait a moment.";
  if (language === "pt-BR") return "Estamos verificando suas informações. Aguarde um momento.";
  if (language === "ja") return "情報を確認しています。少々お待ちください。";
  if (language === "th") return "เรากำลังตรวจสอบข้อมูลของคุณ กรุณารอสักครู่";
  if (language === "vi") return "Chúng tôi đang xác minh thông tin của bạn. Vui lòng chờ một chút.";
  if (language === "ms") return "Kami sedang menyemak maklumat anda. Sila tunggu sebentar.";
  if (language === "id") return "Kami sedang memverifikasi informasi Anda. Mohon tunggu sebentar.";
  return "我们正在核实，请稍后。";
}
