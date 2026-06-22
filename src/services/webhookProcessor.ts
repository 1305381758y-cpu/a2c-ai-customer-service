import { analyzeMessage, type InternalIntentLabel, type MessageAnalysis } from "../domain/analyzer.js";
import { rankSamples } from "../domain/sampleRetrieval.js";
import { buildRuleContextualIntent, buildStrictFlowFollowUp, buildStrictFlowReply, isStrictFlowEnabled, resolveEffectiveStrictFlowStep, strictFlowNeedsInviteCode, type StrictContextualIntent } from "../domain/strictFlow.js";
import { A2CClient } from "../clients/a2c.js";
import { classifyGeminiContextualIntent, classifyGeminiIntent, GeminiReplyClient, naturalizeStrictFlowText } from "../clients/gemini.js";
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
    let analysis = analyzeMessage(analysisText, conversation.language);
    const historyForIntent = this.repos.listConversationMessages(conversation.id, 8);
    const scriptFlow = this.repos.getActiveScriptFlow(merchant.id, country.id);
    const strictFlowEnabled = Boolean(scriptFlow) || isStrictFlowEnabled(merchant, country, merchantConfig);
    const effectiveStrictFlowStep = strictFlowEnabled
      ? resolveEffectiveStrictFlowStep(conversation, historyForIntent)
      : "";
    if (effectiveStrictFlowStep && conversation.flowStep !== effectiveStrictFlowStep) {
      conversation.flowStep = effectiveStrictFlowStep;
    }
    const contextualPhone = detectContextualRegistrationPhone(analysisText, effectiveStrictFlowStep || conversation.flowStep);
    if (contextualPhone && !analysis.phone) {
      analysis = { ...analysis, phone: contextualPhone, intent: "provide_phone", stage: "need_phone_or_tg" };
    }
    const inferredIntent = await this.inferStrictFlowIntent({
      runtimeConfig,
      merchant,
      country,
      conversation,
      analysis,
      customerText: analysisText || content,
      strictFlowEnabled,
      history: historyForIntent
    });
    if (inferredIntent !== "unknown") {
      analysis = applyInternalIntent(analysis, inferredIntent);
    }
    const contextualIntent = await this.inferContextualIntent({
      runtimeConfig,
      conversation,
      analysis,
      customerText: analysisText || content,
      strictFlowEnabled,
      history: historyForIntent,
      inferredIntent
    });
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
        inferredIntent,
        contextualIntent,
        strictFlowEnabled,
        strictFlowStepBefore: effectiveStrictFlowStep || conversation.flowStep || "",
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
        customerText: analysisText || content,
        strictFlowEnabled,
        inferredIntent
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
        config: runtimeConfig,
        inferredIntent,
        contextualIntent,
        strictFlowEnabled,
        scriptFlow
      });
      if (strictReply.enabled) {
      conversation.language = strictReply.language;
      conversation.stage = strictReply.stage;
      conversation.flowStep = strictReply.nextFlowStep;
      const naturalized = await naturalizeStrictReply(runtimeConfig, {
        customerText: analysisText || content,
        draftReply: strictReply.reply,
        language: strictReply.language,
        flowStep: strictReply.nextFlowStep,
        questionType: strictReply.controlledQuestionType || "none",
        history: historyForIntent,
        allowLinkOrInvite: strictReply.needsInviteCode
      });
      strictReply.reply = naturalized.reply;

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
          replyMode: strictReply.fallback ? "fallback" : "strict_flow",
          strictFlow: true,
          strictFlowEnabled,
          strictFlowStep: strictReply.nextFlowStep,
          controlledQuestionType: strictReply.controlledQuestionType || "none",
          controlledQuestionFallback: Boolean(strictReply.controlledQuestionFallback),
          strictQuestionType: strictReply.controlledQuestionType || "none",
          contextualIntent: strictReply.contextualIntent,
          intentSource: strictReply.contextualIntent?.source || "none",
          answeredPreviousQuestion: Boolean(strictReply.contextualIntent?.answeredPreviousQuestion),
          questionType: strictReply.contextualIntent?.questionType || strictReply.controlledQuestionType || "none",
          nextAction: strictReply.contextualIntent?.nextAction || "",
          usedGeminiNaturalizer: naturalized.used,
          naturalizerError: naturalized.error || "",
          knowledgeHit: false,
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
        replyMode: aiReply.fallback ? "fallback" : "gemini",
        strictFlowEnabled,
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

  async processDueFollowUps(limit = 50): Promise<{ scanned: number; sent: number; skipped: number; failed: number }> {
    const candidates = this.repos.listDueFollowUpCandidates(limit);
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (const candidate of candidates) {
      const conversation = candidate.conversation;
      const merchant = this.repos.getMerchant(conversation.merchantId);
      if (!merchant || merchant.status !== "active") {
        skipped += 1;
        continue;
      }
      const merchantConfig = this.repos.getMerchantConfig(conversation.merchantId);
      if (!merchantConfig.smartReplyEnabled) {
        skipped += 1;
        continue;
      }
      const country = this.repos.getMerchantCountry(conversation.countryId);
      const runtimeConfig = appConfigForMerchant(this.config, merchantConfig, country);
      const content = buildStrictFlowFollowUp(conversation.flowStep || conversation.stage, conversation.language || country?.defaultLanguage || "zh");
      const a2c = new A2CClient(runtimeConfig, this.repos.a2cTokenStore(conversation.merchantId));
      const flowStep = conversation.flowStep || conversation.stage || "unknown";
      let externalId = "";
      let errorMessage = "";
      try {
        externalId = await a2c.sendMessage({
          to: conversation.customerPhone,
          senderPhoneNumber: conversation.a2cAccountPhone,
          type: "text",
          content
        });
        if (!externalId) externalId = `followup:${conversation.id}:${Date.now()}`;
        this.repos.insertMessage({
          conversationId: conversation.id,
          direction: "outbound",
          externalId,
          content,
          msgType: "text",
          language: conversation.language || country?.defaultLanguage || "unknown",
          intent: "unknown",
          rawPayload: {
            replyMode: "strict_flow",
            followupSent: true,
            followupReason: "idle_2m",
            followupStep: flowStep,
            strictFlow: true,
            strictFlowStep: flowStep,
            a2cSendStatus: "sent"
          }
        });
        this.repos.recordFollowUp({ merchantId: conversation.merchantId, conversationId: conversation.id, flowStep, sent: true });
        this.repos.updateCustomerMemoryFromMessage(conversation, { intent: "unknown", content, direction: "outbound" });
        sent += 1;
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : "follow-up send failed";
        this.repos.recordFollowUp({ merchantId: conversation.merchantId, conversationId: conversation.id, flowStep, sent: false, error: errorMessage });
        failed += 1;
      }
    }
    return { scanned: candidates.length, sent, skipped, failed };
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
        replyMode: "fallback",
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

  private async inferStrictFlowIntent(input: {
    runtimeConfig: AppConfig;
    merchant: Parameters<typeof isStrictFlowEnabled>[0];
    country: Parameters<typeof isStrictFlowEnabled>[1];
    conversation: Parameters<Repositories["updateConversation"]>[0];
    analysis: MessageAnalysis;
    customerText: string;
    strictFlowEnabled: boolean;
    history: Array<{ direction: string; content: string; intent: string; createdAt: string }>;
  }): Promise<InternalIntentLabel> {
    if (!input.customerText.trim()) return "unknown";
    if (!input.strictFlowEnabled) return "unknown";
    if (!input.conversation.flowStep) return "unknown";
    if (input.analysis.intent !== "unknown" && input.analysis.intent !== "irrelevant_or_spam") return "unknown";
    return classifyGeminiIntent(input.runtimeConfig, {
      customerText: input.customerText,
      language: input.analysis.language || input.conversation.language,
      flowStep: input.conversation.flowStep,
      recentHistory: input.history
    });
  }

  private async inferContextualIntent(input: {
    runtimeConfig: AppConfig;
    conversation: Parameters<Repositories["updateConversation"]>[0];
    analysis: MessageAnalysis;
    customerText: string;
    strictFlowEnabled: boolean;
    history: Array<{ direction: string; content: string; intent: string; createdAt: string }>;
    inferredIntent: InternalIntentLabel;
  }): Promise<StrictContextualIntent> {
    const rule = buildRuleContextualIntent({
      conversation: input.conversation,
      analysis: input.analysis,
      customerText: input.customerText,
      inferredIntent: input.inferredIntent
    }, input.history);
    if (!input.strictFlowEnabled || !input.conversation.flowStep || !shouldAskGeminiForContext(rule, input.customerText, input.analysis.intent)) {
      return rule;
    }
    const gemini = await classifyGeminiContextualIntent(input.runtimeConfig, {
      customerText: input.customerText,
      language: input.analysis.language || input.conversation.language,
      flowStep: input.conversation.flowStep,
      previousAssistantMessage: lastAssistantContent(input.history),
      recentHistory: input.history,
      knownPhone: input.conversation.extractedPhone,
      knownTelegram: input.conversation.extractedTelegram
    });
    if (gemini.intent === "unknown") return rule;
    return {
      intent: gemini.intent,
      source: "gemini",
      answeredPreviousQuestion: gemini.answeredPreviousQuestion,
      isQuestion: gemini.isQuestion,
      isSubmission: gemini.intent === "phone_submission" || gemini.intent === "telegram_submission",
      shouldPause: gemini.shouldPause,
      questionType: normalizeContextualQuestionType(gemini.questionType),
      nextAction: gemini.nextAction,
      reason: gemini.reason
    };
  }
}

function shouldAskGeminiForContext(rule: StrictContextualIntent, text: string, intent: MessageAnalysis["intent"]): boolean {
  if (rule.source === "rule" && rule.intent !== "unknown" && rule.intent !== "unknown_question") return false;
  const normalized = text.trim();
  if (!normalized) return false;
  return rule.intent === "unknown_question" ||
    intent === "unknown" ||
    intent === "irrelevant_or_spam" ||
    (intent === "greeting" && !/^(你好|您好|早上好|下午好|晚上好|hi|hello|hey)$/i.test(normalized)) ||
    normalized.length <= 16 ||
    /[?？为什么為什麼怎么怎麼如何什么什麼]/.test(normalized);
}

function normalizeContextualQuestionType(value: string): StrictContextualIntent["questionType"] {
  const normalized = value.trim().toLowerCase();
  if (normalized === "telegram") return "telegram";
  if (normalized === "payment") return "payment";
  if (normalized === "investment") return "investment";
  if (normalized === "trust") return "trust";
  if (normalized === "earning") return "earning";
  if (normalized === "workflow") return "help";
  if (normalized === "job") return "job";
  if (normalized === "complaint") return "complaint";
  if (normalized === "chat") return "chat";
  if (normalized === "sensitive") return "sensitive";
  if (normalized === "unknown") return "unknown";
  return "none";
}

function lastAssistantContent(history: Array<{ direction: string; content: string }>): string {
  return [...history].reverse().find((message) => message.direction === "outbound")?.content ?? "";
}

function applyInternalIntent(analysis: MessageAnalysis, inferredIntent: InternalIntentLabel): MessageAnalysis {
  const intentMap: Partial<Record<InternalIntentLabel, MessageAnalysis["intent"]>> = {
    positive_confirmation: "greeting",
    negative_refusal: "unknown",
    need_help: "need_help",
    ask_platform_register: "ask_platform_register",
    ask_link: "ask_link",
    ask_tg_register: "ask_tg_register",
    platform_register_done: "platform_register_done",
    trust_concern: "trust_concern",
    payment_concern: "unknown",
    investment_concern: "unknown",
    earning_concern: "unknown",
    workflow_question: "need_help",
    job_question: "greeting",
    complaint: "unknown",
    chat: "greeting",
    sensitive_request: "unknown"
  };
  const intent = intentMap[inferredIntent] ?? analysis.intent;
  const stage = intent === "ask_tg_register" || intent === "platform_register_done"
    ? "need_phone_or_tg"
    : analysis.stage;
  return { ...analysis, intent, stage };
}

async function naturalizeStrictReply(
  config: AppConfig,
  input: {
    customerText: string;
    draftReply: string;
    language: string;
    flowStep: string;
    questionType: string;
    history: Array<{ direction: string; content: string; intent: string; createdAt: string }>;
    allowLinkOrInvite: boolean;
  }
): Promise<{ reply: string; used: boolean; error?: string }> {
  if (!input.customerText.trim() || input.allowLinkOrInvite) {
    return { reply: input.draftReply, used: false };
  }
  if (input.questionType === "none" && input.draftReply.length <= 90) {
    return { reply: input.draftReply, used: false };
  }
  const result = await naturalizeStrictFlowText(config, {
    customerText: input.customerText,
    draftReply: input.draftReply,
    language: input.language,
    flowStep: input.flowStep,
    questionType: input.questionType,
    recentHistory: input.history,
    allowLinkOrInvite: input.allowLinkOrInvite
  });
  return { reply: result.text, used: result.used, error: result.error };
}

function detectContextualRegistrationPhone(text: string, flowStep: string): string {
  if (flowStep !== "wait_registration" && flowStep !== "telegram_confirm") return "";
  const normalized = text.trim();
  if (!/^\+?\d[\d\s-]{5,18}$/.test(normalized)) return "";
  const digits = normalized.replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 6 ? digits : "";
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
  void customerText;
  void conversation;
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
  if (language === "en") return "I am here. Please tell me whether you want to continue registration, check Telegram, or verify your phone number, and I will handle that step.";
  if (language === "pt-BR") return "Estou aqui. Me diga se você quer continuar o cadastro, resolver o Telegram ou confirmar o telefone, e eu sigo por essa etapa.";
  return "我在的。您可以直接告诉我：继续注册、处理 Telegram，还是核对手机号，我会按当前这一步处理。";
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
