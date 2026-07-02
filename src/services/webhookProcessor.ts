import type { AppConfig } from "../config.js";
import type { Repositories } from "../repositories.js";
import { generateAndRecordAiConversationReply } from "./aiConversationReply.js";
import { AiTasks } from "./aiTasks.js";
import { generateConversationReview } from "./conversationReview.js";
import { completeConversationGoal, isConversationGoalComplete } from "./conversationGoalCompletion.js";
import { analyzeInboundTurn } from "./inboundTurnAnalysis.js";
import { prepareInboundConversationContext } from "./inboundConversationContext.js";
import type { A2CWebhookPayload } from "./inboundMessage.js";
import { recordInboundTurn } from "./inboundTurnRecorder.js";
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
    const historyForIntent = this.repos.listConversationMessages(conversation.id, 8);
    const {
      analysis,
      scriptFlow,
      strictFlowEnabled,
      effectiveStrictFlowStep,
      inferredIntent,
      contextualIntent,
      learnedIntent,
      learnedIntentDebug,
      intentLearningCandidate
    } = await analyzeInboundTurn({
      repos: this.repos,
      ai: this.ai,
      runtimeConfig,
      merchant,
      merchantConfig,
      country,
      conversation,
      msgType,
      analysisText,
      imageAnalysisText: imageAnalysis.text,
      customerTextForAi,
      history: historyForIntent
    });
    const inboundTranslation = analysisText
      ? await translateForOperator(runtimeConfig, analysisText, analysis.language)
      : { originalText: content, translatedText: "", targetLanguage: "zh-CN", status: "skipped" as const, error: "" };

    const inboundTurn = recordInboundTurn({
      repos: this.repos,
      conversation,
      payload,
      data,
      content,
      msgType,
      mediaUrl,
      fileName: data.fileName || "",
      imageAnalysis,
      simulation,
      analysis,
      customerTextForAi,
      inboundTranslation,
      inferredIntent,
      contextualIntent,
      learnedIntentDebug,
      strictFlowEnabled,
      strictFlowStepBefore: effectiveStrictFlowStep || conversation.flowStep || "",
      intentLearningCandidate
    });
    if (!inboundTurn.inserted) return { status: "duplicate", conversationId: conversation.id };
    const inboundMemory = inboundTurn.inboundMemory!;

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

}

export function shouldBypassStrictFlowForNaturalReply(
  customerText: string,
  conversation: { flowStep?: string; stage?: string }
): boolean {
  void customerText;
  void conversation;
  return false;
}
