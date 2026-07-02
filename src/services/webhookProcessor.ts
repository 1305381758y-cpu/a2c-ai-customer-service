import { analyzeMessage, type InternalIntentLabel, type MessageAnalysis } from "../domain/analyzer.js";
import { buildRuleContextualIntent, isStrictFlowEnabled, resolveEffectiveStrictFlowStep, type StrictContextualIntent } from "../domain/strictFlow.js";
import type { AppConfig } from "../config.js";
import type { Repositories } from "../repositories.js";
import { generateAndRecordAiConversationReply, type LearnedIntentDebugInfo } from "./aiConversationReply.js";
import { AiTasks } from "./aiTasks.js";
import { generateConversationReview } from "./conversationReview.js";
import { completeConversationGoal, isConversationGoalComplete } from "./conversationGoalCompletion.js";
import { prepareInboundConversationContext } from "./inboundConversationContext.js";
import type { A2CWebhookPayload } from "./inboundMessage.js";
import { buildIntentLearningCandidate, contextualQuestionTypeFromLearnedIntent, findLearnedIntentMatch } from "./intentLearning.js";
import { refineMessageLanguage } from "./replyLanguage.js";
import { generateAndRecordStrictFlowReply } from "./strictFlowReply.js";
import { translateForOperator } from "./translation.js";

export class WebhookProcessor {
  constructor(
    private readonly repos: Repositories,
    private readonly ai: AiTasks,
    private readonly config: AppConfig
  ) {}

  async process(payload: A2CWebhookPayload, merchantId?: string, options: { simulation?: boolean } = {}): Promise<{ status: string; conversationId?: string }> {
    if (payload.type !== "CUSTOMER_MESSAGE") return { status: "ignored" };

    const {
      data,
      msgType,
      mediaUrl,
      analysisText,
      content,
      merchant,
      merchantConfig,
      agentProfile,
      simulation,
      country,
      runtimeConfig,
      a2c,
      telegram,
      conversation,
      imageAnalysis,
      customerTextForAi
    } = await prepareInboundConversationContext({
      repos: this.repos,
      ai: this.ai,
      config: this.config,
      payload,
      merchantId,
      simulation: options.simulation
    });
    let analysis = analyzeMessage(msgType === "text" || analysisText ? customerTextForAi : imageAnalysis.text, conversation.language);
    if (msgType === "image" && !analysisText && !imageAnalysis.text) {
      analysis = { ...analysis, language: conversation.language || analysis.language, intent: "need_help", stage: "need_platform_register" };
    }
    const historyForIntent = this.repos.listConversationMessages(conversation.id, 8);
    analysis = await refineMessageLanguage(this.ai, {
      runtimeConfig,
      country,
      conversation,
      analysis,
      customerText: customerTextForAi,
      history: historyForIntent
    });
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
    const learnedIntentDebug = learnedIntent ? {
      id: learnedIntent.event.id,
      suggestedIntent: learnedIntent.event.suggestedIntent,
      displayName: learnedIntent.event.displayName,
      score: learnedIntent.score
    } satisfies LearnedIntentDebugInfo : null;
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
    if (learnedIntent?.contextualIntent && (contextualIntent.intent === "unknown" || contextualIntent.intent === "unknown_question" || contextualIntent.source === "ai")) {
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
        learnedIntent: learnedIntentDebug,
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

    if (isConversationGoalComplete(conversation, country)) {
      return completeConversationGoal({
        repos: this.repos,
        runtimeConfig,
        conversation,
        data,
        language: analysis.language,
        a2c,
        telegram,
        simulation,
        sendVerificationReply: merchantConfig.smartReplyEnabled || simulation,
        generateReview: (conversationId, config) => generateConversationReview(this.repos, config, conversationId)
      });
    }

    if (!merchantConfig.smartReplyEnabled && !simulation) {
      this.repos.updateConversation(conversation);
      this.repos.upsertCustomerFromConversation(conversation);
      return { status: "auto_reply_disabled", conversationId: conversation.id };
    }

    const useNaturalReply = shouldBypassStrictFlowForNaturalReply(customerTextForAi, conversation);
    if (!useNaturalReply) {
      const strictReply = await generateAndRecordStrictFlowReply({
        repos: this.repos,
        ai: this.ai,
        runtimeConfig,
        merchant,
        country,
        conversation,
        analysis,
        customerText: customerTextForAi,
        agentProfile,
        a2c,
        data,
        payloadId: payload.id,
        simulation,
        strictFlowEnabled,
        scriptFlow,
        inferredIntent,
        contextualIntent,
        learnedIntent: learnedIntentDebug,
        history: historyForIntent
      });
      if (strictReply.handled) {
        return { status: strictReply.status, conversationId: strictReply.conversationId };
      }
    }

    return generateAndRecordAiConversationReply({
      repos: this.repos,
      ai: this.ai,
      runtimeConfig,
      conversation,
      country,
      analysis,
      customerText: customerTextForAi,
      inboundMemory,
      agentProfile,
      a2c,
      telegram,
      data,
      payloadId: payload.id,
      simulation,
      strictFlowEnabled,
      learnedIntent: learnedIntentDebug,
      generateReview: (conversationId, config) => generateConversationReview(this.repos, config, conversationId)
    });
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
    return this.ai.classifyIntent(input.runtimeConfig, {
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
    if (!input.strictFlowEnabled || !input.conversation.flowStep || !shouldAskAiForContext(rule, input.customerText, input.analysis.intent)) {
      return rule;
    }
    const aiIntent = await this.ai.classifyContextualIntent(input.runtimeConfig, {
      customerText: input.customerText,
      language: input.analysis.language || input.conversation.language,
      flowStep: input.conversation.flowStep,
      previousAssistantMessage: lastAssistantContent(input.history),
      recentHistory: input.history,
      knownPhone: input.conversation.extractedPhone,
      knownTelegram: input.conversation.extractedTelegram
    });
    if (aiIntent.intent === "unknown") return rule;
    return {
      intent: aiIntent.intent,
      source: "ai",
      answeredPreviousQuestion: aiIntent.answeredPreviousQuestion,
      isQuestion: aiIntent.isQuestion,
      isSubmission: aiIntent.intent === "phone_submission" || aiIntent.intent === "telegram_submission",
      shouldPause: aiIntent.shouldPause,
      questionType: normalizeContextualQuestionType(aiIntent.questionType),
      nextAction: aiIntent.nextAction,
      reason: aiIntent.reason
    };
  }
}

function shouldAskAiForContext(rule: StrictContextualIntent, text: string, intent: MessageAnalysis["intent"]): boolean {
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

function detectContextualRegistrationPhone(text: string, flowStep: string): string {
  if (flowStep !== "wait_registration" && flowStep !== "telegram_confirm") return "";
  const normalized = text.trim();
  if (!/^\+?\d[\d\s-]{5,18}$/.test(normalized)) return "";
  const digits = normalized.replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 6 ? digits : "";
}

export function shouldBypassStrictFlowForNaturalReply(
  customerText: string,
  conversation: { flowStep?: string; stage?: string }
): boolean {
  void customerText;
  void conversation;
  return false;
}
