import { analyzeMessage, isContextualIntentLabel, isInternalIntentLabel, type ContextualIntentLabel, type InternalIntentLabel, type MessageAnalysis } from "../domain/analyzer.js";
import { rankSamples } from "../domain/sampleRetrieval.js";
import { buildRuleContextualIntent, buildStrictFlowFollowUp, buildStrictFlowReply, isStrictFlowEnabled, resolveEffectiveStrictFlowStep, strictFlowNeedsInviteCode, type StrictContextualIntent } from "../domain/strictFlow.js";
import { A2CClient } from "../clients/a2c.js";
import { analyzeGeminiImage, classifyGeminiContextualIntent, classifyGeminiIntent, GeminiReplyClient, naturalizeStrictFlowText } from "../clients/gemini.js";
import { TelegramClient } from "../clients/telegram.js";
import type { AppConfig } from "../config.js";
import type { IntentLearningEventRecord, MerchantConfigRecord } from "../repositories.js";
import type { Repositories } from "../repositories.js";
import { buildHandoffMessage } from "./handoff.js";
import { translateForCustomer, translateForOperator } from "./translation.js";

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

  async process(payload: A2CWebhookPayload, merchantId?: string, options: { simulation?: boolean } = {}): Promise<{ status: string; conversationId?: string }> {
    if (payload.type !== "CUSTOMER_MESSAGE") return { status: "ignored" };

    const data = payload.data;
    const msgType = normalizeMessageType(data.msgType, data.url);
    const mediaUrl = data.url || (isUrl(data.content) ? data.content : "");
    const analysisText = msgType === "text" ? data.content || data.caption || "" : data.caption || "";
    const content = msgType === "text" ? analysisText : data.caption || mediaLabel(msgType);
    const merchant = merchantId ? this.repos.getMerchant(merchantId) ?? this.repos.findMerchantByA2CAccount(data.to) : this.repos.findMerchantByA2CAccount(data.to);
    const merchantConfig = this.repos.getMerchantConfig(merchant.id);
    const simulation = Boolean(options.simulation || merchantConfig.trainingSimulationEnabled);
    const country = this.repos.ensurePrimaryCountry(merchant.id);
    const runtimeConfig = appConfigForMerchant(this.config, merchantConfig, country);
    const ai = new GeminiReplyClient(runtimeConfig);
    const a2c = new A2CClient(runtimeConfig, this.repos.a2cTokenStore(merchant.id));
    const telegram = new TelegramClient(runtimeConfig);
    const conversation = this.repos.getOrCreateConversation(data.from, data.to, data.nickname ?? "", merchant.id, country.id);
    const imageAnalysis = msgType === "image" && mediaUrl
      ? await analyzeGeminiImage(runtimeConfig, mediaUrl)
      : { text: "", status: "skipped" as const };
    const customerTextForAi = analysisText || (imageAnalysis.text ? `${content} ${imageAnalysis.text}` : content);
    let analysis = analyzeMessage(msgType === "text" || analysisText ? customerTextForAi : imageAnalysis.text, conversation.language);
    if (msgType === "image" && !analysisText && !imageAnalysis.text) {
      analysis = { ...analysis, language: conversation.language || analysis.language, intent: "need_help", stage: "need_platform_register" };
    }
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
    const learnedIntent = findLearnedIntentMatch({
      events: this.repos.listPromotedIntentLearningEvents({ merchantId: merchant.id, countryId: country.id }),
      customerText: customerTextForAi,
      flowStep: effectiveStrictFlowStep || conversation.flowStep || ""
    });
    let inferredIntent = await this.inferStrictFlowIntent({
      runtimeConfig,
      merchant,
      country,
      conversation,
      analysis,
      customerText: customerTextForAi,
      strictFlowEnabled,
      history: historyForIntent
    });
    if (learnedIntent?.internalIntent && inferredIntent === "unknown") {
      inferredIntent = learnedIntent.internalIntent;
    }
    if (inferredIntent !== "unknown") {
      analysis = applyInternalIntent(analysis, inferredIntent);
    }
    let contextualIntent = await this.inferContextualIntent({
      runtimeConfig,
      conversation,
      analysis,
      customerText: customerTextForAi,
      strictFlowEnabled,
      history: historyForIntent,
      inferredIntent
    });
    if (learnedIntent?.contextualIntent && (contextualIntent.intent === "unknown" || contextualIntent.intent === "unknown_question" || contextualIntent.source === "gemini")) {
      contextualIntent = {
        ...contextualIntent,
        intent: learnedIntent.contextualIntent,
        source: "rule",
        questionType: contextualQuestionTypeFromLearnedIntent(learnedIntent.contextualIntent),
        nextAction: `learned intent: ${learnedIntent.event.displayName || learnedIntent.event.suggestedIntent}`,
        reason: `matched promoted intent #${learnedIntent.event.id}`
      };
    }
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
        learnedIntent: learnedIntent ? {
          id: learnedIntent.event.id,
          suggestedIntent: learnedIntent.event.suggestedIntent,
          displayName: learnedIntent.event.displayName,
          score: learnedIntent.score
        } : null,
        strictFlowEnabled,
        strictFlowStepBefore: effectiveStrictFlowStep || conversation.flowStep || "",
        originalContent: inboundTranslation.originalText,
        translatedContent: inboundTranslation.translatedText,
        targetLanguage: inboundTranslation.targetLanguage,
        translationStatus: inboundTranslation.status,
        translationError: inboundTranslation.error || "",
        mediaUrl,
        fileName: data.fileName || "",
        imageAnalysis: msgType === "image" ? imageAnalysis : null,
        simulation
      }
    });
    if (!inserted.inserted) return { status: "duplicate", conversationId: conversation.id };
    const intentLearningCandidate = buildIntentLearningCandidate({
      customerText: customerTextForAi,
      analysis,
      inferredIntent,
      contextualIntent,
      flowStep: effectiveStrictFlowStep || conversation.flowStep || "",
      strictFlowEnabled
    });
    if (intentLearningCandidate) {
      this.repos.recordIntentLearningEvent({
        merchantId: merchant.id,
        countryId: country.id,
        conversationId: conversation.id,
        messageId: inserted.id,
        customerText: customerTextForAi,
        language: analysis.language,
        detectedIntent: analysis.intent,
        inferredIntent,
        contextualIntent: contextualIntent.intent,
        flowStep: effectiveStrictFlowStep || conversation.flowStep || "",
        ...intentLearningCandidate
      });
    }

    conversation.language = analysis.language;
    conversation.stage = analysis.stage;
    conversation.extractedPhone = conversation.extractedPhone || analysis.phone;
    conversation.extractedTelegram = conversation.extractedTelegram || analysis.telegram;
    conversation.extractedWhatsApp = conversation.extractedWhatsApp || analysis.whatsapp;
    if (analysis.intent === "platform_register_done") {
      this.repos.markInviteCodeUsedForConversation(conversation.id, conversation.merchantId);
    }
    this.repos.upsertCustomerFromConversation(conversation);
    const inboundMemory = this.repos.updateCustomerMemoryFromMessage(conversation, { intent: analysis.intent, content: customerTextForAi, direction: "inbound" });

    if (conversation.status === "human_handoff") {
      this.repos.updateConversation(conversation);
      this.repos.upsertCustomerFromConversation(conversation);
      return { status: "already_handoff", conversationId: conversation.id };
    }

    if (isCountryGoalComplete(conversation, country)) {
      conversation.stage = "ready_for_handoff";
      conversation.status = "human_handoff";
      this.repos.markInviteCodeUsedForConversation(conversation.id, conversation.merchantId);
      if (merchantConfig.smartReplyEnabled || simulation) {
        await this.sendVerificationReply(conversation, data, analysis.language, a2c, simulation);
      }
      if (!simulation) {
        await this.notifyHandoffOnce(conversation, data.messageId, new Date((data.timestamp || Date.now()) * 1000).toISOString(), telegram);
      }
      this.repos.updateConversation(conversation);
      this.repos.upsertCustomerFromConversation(conversation);
      return { status: simulation ? "handoff_simulated" : "handoff", conversationId: conversation.id };
    }

    if (!merchantConfig.smartReplyEnabled && !simulation) {
      this.repos.updateConversation(conversation);
      this.repos.upsertCustomerFromConversation(conversation);
      return { status: "auto_reply_disabled", conversationId: conversation.id };
    }

    const useNaturalReply = shouldBypassStrictFlowForNaturalReply(customerTextForAi, conversation);
    if (!useNaturalReply) {
      const strictNeedsInviteCode = strictFlowNeedsInviteCode({
        merchant,
        country,
        conversation,
        analysis,
        customerText: customerTextForAi,
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
        customerText: customerTextForAi,
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
        customerText: customerTextForAi,
        draftReply: strictReply.reply,
        language: strictReply.language,
        flowStep: strictReply.nextFlowStep,
        questionType: strictReply.controlledQuestionType || "none",
        history: historyForIntent,
        allowLinkOrInvite: strictReply.needsInviteCode
      });
      strictReply.reply = naturalized.reply;
      const languageGuard = await ensureReplyCustomerLanguage(runtimeConfig, {
        reply: strictReply.reply,
        targetLanguage: strictReply.language,
        flowStep: strictReply.nextFlowStep,
        allowLinkOrInvite: strictReply.needsInviteCode
      });
      strictReply.reply = languageGuard.reply;

      let externalId = "";
      let a2cSendStatus: "sent" | "failed" | "simulated" = simulation ? "simulated" : "sent";
      let a2cSendError = "";
      if (simulation) {
        externalId = `simulated_strict:${data.messageId || payload.id}:${Date.now()}`;
      } else {
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
          learnedIntent: learnedIntent ? {
            id: learnedIntent.event.id,
            suggestedIntent: learnedIntent.event.suggestedIntent,
            displayName: learnedIntent.event.displayName,
            score: learnedIntent.score
          } : null,
          intentSource: strictReply.contextualIntent?.source || "none",
          answeredPreviousQuestion: Boolean(strictReply.contextualIntent?.answeredPreviousQuestion),
          questionType: strictReply.contextualIntent?.questionType || strictReply.controlledQuestionType || "none",
          nextAction: strictReply.contextualIntent?.nextAction || "",
          usedGeminiNaturalizer: naturalized.used,
          naturalizerError: naturalized.error || "",
          languageGuardTarget: languageGuard.targetLanguage,
          languageGuardStatus: languageGuard.status,
          languageGuardAttempts: languageGuard.attempts,
          languageGuardFallbackUsed: languageGuard.fallbackUsed,
          languageGuardError: languageGuard.error || "",
          knowledgeHit: false,
          aiFallback: Boolean(strictReply.fallback),
          originalContent: outboundTranslation.originalText,
          operatorTranslatedContent: outboundTranslation.translatedText,
          operatorTranslationTargetLanguage: outboundTranslation.targetLanguage,
          operatorTranslationStatus: outboundTranslation.status,
          operatorTranslationError: outboundTranslation.error || "",
          a2cSendStatus,
          a2cSendError,
          simulation,
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
      if (strictReply.tutorialImageRequested) {
        await this.sendRegistrationTutorialImage(conversation, data, strictReply.language, runtimeConfig.REGISTRATION_TUTORIAL_IMAGE_URL, a2c, simulation);
      }
      this.repos.updateConversation(conversation);
      this.repos.upsertCustomerFromConversation(conversation);
      this.repos.updateCustomerMemoryFromMessage(conversation, { intent: "unknown", content: strictReply.reply, direction: "outbound" });
      if (a2cSendStatus === "simulated") return { status: outbound.inserted ? "strict_flow_simulated" : "strict_flow_simulation_not_recorded", conversationId: conversation.id };
      return { status: a2cSendStatus === "sent" && outbound.inserted ? "strict_flow_replied" : "strict_flow_send_failed", conversationId: conversation.id };
      }
    }

    const enabledSamples = this.repos.listTrainingSamples({ merchantId: merchant.id, countryId: country.id, enabled: true });
    const knowledge = this.repos.listKnowledgeItems({ merchantId: merchant.id, countryId: country.id, enabled: true });
    const trainingMaterials = this.repos.listTrainingMaterialSnippets(merchant.id, 20, country.id);
    const shouldIncludeRegistrationDetails = shouldUseInviteForReply(country, conversation, analysis.intent, customerTextForAi);
    const inviteCode = shouldIncludeRegistrationDetails
      ? this.repos.reserveInviteCodeForConversation(conversation)
      : undefined;
    const samples = rankSamples(enabledSamples, {
      text: customerTextForAi,
      language: analysis.language,
      intent: analysis.intent,
      stage: analysis.stage
    });
    const history = this.repos.listConversationMessages(conversation.id, 20);
    const aiReply = await ai.generateReply({ customerText: customerTextForAi, conversation, history, samples, knowledge, trainingMaterials, memory: inboundMemory, country, inviteCode });
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
      await this.sendVerificationReply(conversation, data, aiReply.language || analysis.language, a2c, simulation);
      if (!simulation) {
        await this.notifyHandoffOnce(conversation, data.messageId, new Date((data.timestamp || Date.now()) * 1000).toISOString(), telegram);
      }
      this.repos.updateConversation(conversation);
      this.repos.upsertCustomerFromConversation(conversation);
      return { status: simulation ? "handoff_simulated" : "handoff", conversationId: conversation.id };
    }

    let externalId = "";
    let a2cSendStatus: "sent" | "failed" | "simulated" = simulation ? "simulated" : "sent";
    let a2cSendError = "";
    if (simulation) {
      externalId = `simulated_reply:${data.messageId || payload.id}:${Date.now()}`;
    } else {
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
        learnedIntent: learnedIntent ? {
          id: learnedIntent.event.id,
          suggestedIntent: learnedIntent.event.suggestedIntent,
          displayName: learnedIntent.event.displayName,
          score: learnedIntent.score
        } : null,
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
        simulation,
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

    if (a2cSendStatus === "simulated") return { status: outbound.inserted ? "reply_simulated" : "reply_simulation_not_recorded", conversationId: conversation.id };
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
    a2c: A2CClient,
    simulation = false
  ): Promise<void> {
    const content = verificationReply(language);
    let externalId = "";
    let a2cSendStatus: "sent" | "failed" | "simulated" = simulation ? "simulated" : "sent";
    let a2cSendError = "";
    if (simulation) {
      externalId = `simulated_verify:${data.messageId}:${Date.now()}`;
    } else {
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
        a2cSendError,
        simulation
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

  private async sendRegistrationTutorialImage(
    conversation: Parameters<Repositories["updateConversation"]>[0],
    data: A2CWebhookPayload["data"],
    language: string,
    tutorialImageUrl: string,
    a2c: A2CClient,
    simulation = false
  ): Promise<void> {
    if (!tutorialImageUrl) return;
    const caption = registrationTutorialCaption(language);
    let externalId = "";
    let a2cSendStatus: "sent" | "failed" | "simulated" = simulation ? "simulated" : "sent";
    let a2cSendError = "";
    if (simulation) {
      externalId = `simulated_tutorial:${data.messageId || Date.now()}:${Date.now()}`;
    } else {
      try {
        externalId = await a2c.sendMessage({
          to: data.from,
          senderPhoneNumber: data.to,
          type: "image",
          url: tutorialImageUrl,
          caption,
          fileName: "registration-tutorial.jpg"
        });
        if (!externalId) externalId = `tutorial_image:${data.messageId || Date.now()}`;
      } catch (error) {
        a2cSendStatus = "failed";
        a2cSendError = error instanceof Error ? error.message : "unknown";
        externalId = `tutorial_image_failed:${data.messageId || Date.now()}:${a2cSendError.slice(0, 120)}`;
      }
    }
    this.repos.insertMessage({
      conversationId: conversation.id,
      direction: "outbound",
      externalId,
      content: caption,
      msgType: "image",
      language,
      intent: "unknown",
      rawPayload: {
        replyMode: "strict_flow",
        strictFlow: true,
        strictFlowStep: conversation.flowStep || "wait_registration",
        registrationTutorialImage: true,
        mediaUrl: tutorialImageUrl,
        caption,
        a2cSendStatus,
        a2cSendError,
        simulation
      }
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

interface LearnedIntentMatch {
  event: IntentLearningEventRecord;
  score: number;
  internalIntent?: InternalIntentLabel;
  contextualIntent?: ContextualIntentLabel;
}

function findLearnedIntentMatch(input: { events: IntentLearningEventRecord[]; customerText: string; flowStep: string }): LearnedIntentMatch | undefined {
  const text = input.customerText.trim();
  if (!text || text.length < 2) return undefined;
  const signature = signatureForIntent(text);
  let best: LearnedIntentMatch | undefined;
  for (const event of input.events) {
    if (!isLearnedIntentApplicableToStep(event, input.flowStep)) continue;
    const texts = [event.customerText, ...event.examples.map((example) => String(example.text || example.customerText || ""))].filter(Boolean);
    const score = Math.max(...texts.map((candidate) => learnedTextSimilarity(text, candidate, signature)));
    if (score < 0.74) continue;
    const match = {
      event,
      score,
      internalIntent: isInternalIntentLabel(event.suggestedIntent) ? event.suggestedIntent : undefined,
      contextualIntent: isContextualIntentLabel(event.suggestedIntent) ? event.suggestedIntent : undefined
    };
    if (!best || match.score > best.score || match.score === best.score && event.occurrenceCount > best.event.occurrenceCount) best = match;
  }
  return best;
}

function isLearnedIntentApplicableToStep(event: IntentLearningEventRecord, currentStep: string): boolean {
  if (!event.flowStep || !currentStep) return true;
  if (event.flowStep === currentStep) return true;
  if (event.suggestedIntent.startsWith("custom_unknown")) return true;
  return false;
}

function learnedTextSimilarity(text: string, candidate: string, signature: string): number {
  const candidateSignature = signatureForIntent(candidate);
  if (signature && signature === candidateSignature) return 1;
  const a = tokenSetForLearning(text);
  const b = tokenSetForLearning(candidate);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = new Set([...a, ...b]).size;
  const jaccard = union ? intersection / union : 0;
  const normalizedA = normalizeLearningText(text);
  const normalizedB = normalizeLearningText(candidate);
  const containment = normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA) ? Math.min(normalizedA.length, normalizedB.length) / Math.max(normalizedA.length, normalizedB.length) : 0;
  return Math.max(jaccard, containment);
}

function tokenSetForLearning(text: string): Set<string> {
  const normalized = normalizeLearningText(text);
  const tokens = normalized.match(/[a-z0-9]+|[\u4E00-\u9FFF]/gi) || [];
  const grams = new Set<string>(tokens);
  for (let i = 0; i < normalized.length - 1; i += 1) {
    grams.add(normalized.slice(i, i + 2));
  }
  return grams;
}

function normalizeLearningText(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "url")
    .replace(/@\w+/g, "@user")
    .replace(/\d{4,}/g, "number")
    .replace(/[^\p{L}\p{N}\u4E00-\u9FFF]+/gu, "")
    .trim();
}

function contextualQuestionTypeFromLearnedIntent(intent: ContextualIntentLabel): StrictContextualIntent["questionType"] {
  const map: Partial<Record<ContextualIntentLabel, StrictContextualIntent["questionType"]>> = {
    payment_concern: "payment",
    investment_concern: "investment",
    trust_concern: "trust",
    earning_concern: "earning",
    registration_field_question: "registration_field",
    workflow_question: "help",
    job_question: "job",
    ask_tg_register: "telegram",
    telegram_username_help: "telegram",
    complaint: "complaint",
    chat: "chat",
    sensitive_request: "sensitive",
    unknown_question: "unknown"
  };
  return map[intent] || "none";
}

function buildIntentLearningCandidate(input: {
  customerText: string;
  analysis: MessageAnalysis;
  inferredIntent: InternalIntentLabel;
  contextualIntent: StrictContextualIntent;
  flowStep: string;
  strictFlowEnabled: boolean;
}): { candidateKey: string; suggestedIntent: string; displayName: string; description: string } | undefined {
  const text = input.customerText.trim();
  if (!text || text.length < 2 || input.analysis.phone || input.analysis.telegram) return undefined;
  const contextual = input.contextualIntent.intent || "unknown";
  const pureGreeting = /^(你好|您好|早上好|下午好|晚上好|hi|hello|hey|ola|olá)$/i.test(text);
  const looksMisclassifiedGreeting = input.analysis.intent === "greeting" && !pureGreeting;
  const needsLearning =
    input.analysis.intent === "unknown" ||
    input.analysis.intent === "irrelevant_or_spam" ||
    contextual === "unknown" ||
    contextual === "unknown_question" ||
    input.contextualIntent.source === "gemini" ||
    input.inferredIntent !== "unknown" ||
    looksMisclassifiedGreeting;
  if (!needsLearning) return undefined;

  const suggestedIntent = normalizeSuggestedIntent(input);
  const displayName = intentDisplayName(suggestedIntent);
  const description = intentDescription(suggestedIntent, {
    detectedIntent: input.analysis.intent,
    inferredIntent: input.inferredIntent,
    contextualIntent: contextual,
    flowStep: input.flowStep
  });
  return {
    candidateKey: candidateKeyForIntent(suggestedIntent, input.flowStep, text),
    suggestedIntent,
    displayName,
    description
  };
}

function candidateKeyForIntent(suggestedIntent: string, flowStep: string, text: string): string {
  const signature = signatureForIntent(text);
  if (suggestedIntent.startsWith("custom_unknown") || suggestedIntent === "custom_unclassified_or_noise") {
    return [suggestedIntent, signature].join(":");
  }
  return [flowStep || "no_step", suggestedIntent, signature].join(":");
}

function normalizeSuggestedIntent(input: {
  customerText: string;
  analysis: MessageAnalysis;
  inferredIntent: InternalIntentLabel;
  contextualIntent: StrictContextualIntent;
}): string {
  if (input.contextualIntent.intent && input.contextualIntent.intent !== "unknown" && input.contextualIntent.intent !== "unknown_question") {
    return input.contextualIntent.intent;
  }
  if (input.inferredIntent !== "unknown") return input.inferredIntent;
  const text = input.customerText.toLowerCase();
  if (/[?？]/.test(input.customerText) || /(为什么|為什麼|怎么|怎麼|如何|什么|什麼|where|how|why|what)/i.test(input.customerText)) return "custom_unknown_question";
  if (/^(好的|好|ok|嗯|明白|知道了|yes|sim|claro)$/i.test(text.trim())) return "contextual_acknowledgement";
  if (input.analysis.intent === "irrelevant_or_spam") return "custom_unclassified_or_noise";
  return "custom_unclassified";
}

function intentDisplayName(intent: string): string {
  const names: Record<string, string> = {
    positive_confirmation: "上下文肯定回复",
    acknowledgement: "已理解/等待操作",
    negative_refusal: "拒绝或暂停",
    not_available: "当前没空",
    not_registered: "尚未注册完成",
    no_telegram: "没有 Telegram",
    telegram_installed: "Telegram 已安装",
    telegram_username_help: "Telegram 用户名帮助",
    payment_concern: "费用疑问",
    investment_concern: "投资/本金疑问",
    trust_concern: "安全/诈骗疑虑",
    earning_concern: "收益疑问",
    workflow_question: "流程操作问题",
    job_question: "工作内容问题",
    complaint: "抱怨重复/机械",
    chat: "闲聊/身份问题",
    sensitive_request: "敏感资料请求",
    custom_unknown_question: "待识别客户问题",
    contextual_acknowledgement: "短句确认/已知晓",
    custom_unclassified_or_noise: "待判断无关内容",
    custom_unclassified: "待识别新意图"
  };
  return names[intent] || intent;
}

function intentDescription(intent: string, input: { detectedIntent: string; inferredIntent: string; contextualIntent: string; flowStep: string }): string {
  return `客户表达可能需要沉淀为“${intentDisplayName(intent)}”。原始识别=${input.detectedIntent}，Gemini意图=${input.inferredIntent}，上下文意图=${input.contextualIntent}，流程=${input.flowStep || "未进入流程"}。`;
}

function signatureForIntent(text: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "url")
    .replace(/@\w+/g, "@user")
    .replace(/\d{4,}/g, "number")
    .replace(/[^\p{L}\p{N}\u4E00-\u9FFF]+/gu, "")
    .slice(0, 24);
  return normalized || "empty";
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

interface LanguageGuardResult {
  reply: string;
  targetLanguage: string;
  status: "matched" | "translated" | "fallback" | "skipped";
  attempts: number;
  fallbackUsed: boolean;
  error?: string;
}

async function ensureReplyCustomerLanguage(
  config: AppConfig,
  input: {
    reply: string;
    targetLanguage: string;
    flowStep: string;
    allowLinkOrInvite: boolean;
  }
): Promise<LanguageGuardResult> {
  const targetLanguage = normalizeCustomerLanguage(input.targetLanguage);
  const originalReply = input.reply.trim();
  if (!originalReply || targetLanguage === "unknown") {
    return { reply: originalReply, targetLanguage, status: "skipped", attempts: 0, fallbackUsed: false };
  }
  if (replyLooksLikeCustomerLanguage(originalReply, targetLanguage)) {
    return { reply: originalReply, targetLanguage, status: "matched", attempts: 0, fallbackUsed: false };
  }

  let lastError = "回复语言与客户语言不一致";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const translated = await translateForCustomer(config, originalReply, targetLanguage);
    if (translated.status === "translated" && replyLooksLikeCustomerLanguage(translated.translatedText, targetLanguage)) {
      return { reply: translated.translatedText, targetLanguage, status: "translated", attempts: attempt, fallbackUsed: false };
    }
    lastError = translated.error || lastError;
  }

  const fallback = strictLanguageFallback(input.flowStep, targetLanguage, originalReply, input.allowLinkOrInvite);
  return {
    reply: fallback,
    targetLanguage,
    status: "fallback",
    attempts: 2,
    fallbackUsed: true,
    error: lastError
  };
}

function normalizeCustomerLanguage(language: string): string {
  const normalized = (language || "").trim().toLowerCase();
  if (!normalized || normalized === "unknown") return "unknown";
  if (normalized === "cn" || normalized === "zh" || normalized.startsWith("zh-")) return "zh";
  if (normalized === "pt" || normalized.startsWith("pt-")) return "pt-BR";
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  return normalized;
}

function replyLooksLikeCustomerLanguage(reply: string, targetLanguage: string): boolean {
  const naturalText = stripNonLanguagePayload(reply);
  if (!naturalText) return true;
  const cjkCount = countMatches(naturalText, /[\u3400-\u9fff]/g);
  const latinCount = countMatches(naturalText, /[a-zA-ZÀ-ÿ]/g);
  if (targetLanguage === "zh") return cjkCount >= 2 || cjkCount >= latinCount;
  if (targetLanguage === "en" || targetLanguage === "pt-BR") return cjkCount === 0 && latinCount > 0;
  return cjkCount === 0 || latinCount === 0;
}

function stripNonLanguagePayload(reply: string): string {
  return reply
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/@\w+/g, " ")
    .replace(/\b\d[\d\s-]{3,}\b/g, " ")
    .replace(/邀请码[:：]?\s*\S*/g, " ")
    .replace(/invitation code[:：]?\s*\S*/gi, " ")
    .replace(/c[oó]digo de convite[:：]?\s*\S*/gi, " ")
    .trim();
}

function countMatches(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length ?? 0;
}

function strictLanguageFallback(flowStep: string, language: string, originalReply: string, allowLinkOrInvite: boolean): string {
  if (allowLinkOrInvite) return registrationFallback(language, originalReply);
  if (language === "en") return englishStrictFallback(flowStep);
  if (language === "pt-BR") return portugueseStrictFallback(flowStep);
  return chineseStrictFallback(flowStep);
}

function registrationFallback(language: string, originalReply: string): string {
  const url = originalReply.match(/https?:\/\/\S+/i)?.[0]?.replace(/[，。,.]+$/, "") || "";
  const code = extractInviteCode(originalReply);
  if (language === "en") {
    return [
      "Okay, I will send you the registration link and invitation code now.",
      url ? `Registration link: ${url}` : "",
      code ? `Invitation code: ${code}` : "",
      "Registration steps:",
      "1. Open the link in your browser.",
      "2. Fill in your phone number.",
      "3. Set your username and password.",
      "4. Enter the invitation code.",
      "5. Submit the registration.",
      "After registration is completed, please tell me."
    ].filter(Boolean).join("\n");
  }
  if (language === "pt-BR") {
    return [
      "Certo, vou enviar agora o link de cadastro e o código de convite.",
      url ? `Link de cadastro: ${url}` : "",
      code ? `Código de convite: ${code}` : "",
      "Passos do cadastro:",
      "1. Abra o link no navegador.",
      "2. Preencha seu número de telefone.",
      "3. Defina seu nome de usuário e sua senha.",
      "4. Insira o código de convite.",
      "5. Envie o cadastro.",
      "Depois de concluir o cadastro, me avise."
    ].filter(Boolean).join("\n");
  }
  return chineseStrictFallback("wait_registration");
}

function extractInviteCode(value: string): string {
  return value.match(/(?:邀请码|invitation code|c[oó]digo de convite)[:：]?\s*([A-Za-z0-9_-]+)/i)?.[1] || "";
}

function englishStrictFallback(flowStep: string): string {
  const map: Record<string, string> = {
    interest_screening: "Hello, would you like to learn about an online part-time job?",
    registration_intent: "Okay, let me briefly explain: this online part-time job helps merchants improve product sales and rankings, and commission is calculated by tasks. Earnings are subject to platform rules. Do you have time to continue registration now?",
    wait_registration: "Okay, please follow the page steps first. After registration, send me the phone number you used. If you get stuck, tell me where.",
    telegram_confirm: "Congratulations, your registration is done. Please save your username and password. You need Telegram for the next step. Do you have the Telegram app?",
    telegram_download: "No problem. Search for Telegram in the Play Store or App Store, install it, then create an account. After that, send me your username starting with @.",
    collect_telegram: "Please send me your Telegram username. It should start with @.",
    human_handoff: "We are verifying your information. Please wait a moment."
  };
  return map[flowStep] ?? map.registration_intent;
}

function portugueseStrictFallback(flowStep: string): string {
  const map: Record<string, string> = {
    interest_screening: "Olá, você gostaria de conhecer um trabalho online de meio período?",
    registration_intent: "Certo, vou explicar rapidamente: este trabalho online ajuda comerciantes a melhorar vendas e ranqueamento de produtos, e a comissão depende das tarefas. Os ganhos seguem as regras da plataforma. Você tem tempo para continuar o cadastro agora?",
    wait_registration: "Certo, siga primeiro as etapas da página. Depois do cadastro, envie o telefone usado. Se travar em alguma parte, me diga onde.",
    telegram_confirm: "Parabéns, seu cadastro foi concluído. Guarde seu nome de usuário e senha. Você precisa do Telegram para a próxima etapa. Você tem o app Telegram?",
    telegram_download: "Sem problema. Procure Telegram na Play Store ou App Store, instale e crie uma conta. Depois envie seu nome de usuário começando com @.",
    collect_telegram: "Por favor, envie seu nome de usuário do Telegram. Ele deve começar com @.",
    human_handoff: "Estamos verificando suas informações. Aguarde um momento."
  };
  return map[flowStep] ?? map.registration_intent;
}

function chineseStrictFallback(flowStep: string): string {
  const map: Record<string, string> = {
    interest_screening: "您好，您是想了解一份兼职在线工作吗？",
    registration_intent: "好的，我简单介绍一下：这份兼职主要是帮商家提升产品销量和排名，佣金按任务和平台规则核算。您现在方便继续开户注册吗？",
    wait_registration: "好的，您先按页面操作，注册好后把手机号发我；卡在哪一步也可以直接告诉我。",
    telegram_confirm: "恭喜，注册已完成。请保存好用户名和密码。下一步需要 Telegram，您有 Telegram 应用吗？",
    telegram_download: "没关系，您可以在 Play Store 或 App Store 搜索 Telegram 下载并注册。完成后把 @ 开头的用户名发给我。",
    collect_telegram: "请把您的 Telegram 用户名发送给我，需要是 @ 开头的用户名。",
    human_handoff: "我们正在核实，请稍后。"
  };
  return map[flowStep] ?? map.registration_intent;
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
    TG_REGISTER_GUIDE_URL: country?.tgRegisterGuideUrl || merchantConfig.tgRegisterGuideUrl || config.TG_REGISTER_GUIDE_URL,
    REGISTRATION_TUTORIAL_IMAGE_URL: merchantConfig.registrationTutorialImageUrl || config.REGISTRATION_TUTORIAL_IMAGE_URL
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

function registrationTutorialCaption(language: string): string {
  if (language === "en") return "Here is the registration tutorial image. Follow it step by step, and send me the registered phone number after you finish.";
  if (language === "pt-BR") return "Esta é a imagem do tutorial de cadastro. Siga passo a passo e, quando terminar, envie o telefone usado no cadastro.";
  return "这是注册教程图片。您按图片步骤操作，完成后把注册手机号发给我就可以。";
}
