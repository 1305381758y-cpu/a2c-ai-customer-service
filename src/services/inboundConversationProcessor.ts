import type { AppConfig } from "../config.js";
import type { Repositories } from "../repositories.js";
import { AiTasks } from "./aiTasks.js";
import { analyzeInboundTurn } from "./inboundTurnAnalysis.js";
import { prepareInboundConversationContext } from "./inboundConversationContext.js";
import type { A2CWebhookPayload } from "./inboundMessage.js";
import { recordInboundTurn } from "./inboundTurnRecorder.js";
import { respondToInboundTurn } from "./inboundTurnResponder.js";
import { translateForOperator } from "./translation.js";

export class InboundConversationProcessor {
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

    return respondToInboundTurn({
      repos: this.repos,
      ai: this.ai,
      runtimeConfig,
      merchant,
      merchantConfig,
      conversation,
      country,
      analysis,
      customerTextForAi,
      inboundMemory,
      agentProfile,
      a2c,
      telegram,
      data,
      payloadId: payload.id,
      simulation,
      strictFlowEnabled,
      scriptFlow,
      inferredIntent,
      contextualIntent,
      learnedIntentDebug,
      historyForIntent
    });
  }
}
