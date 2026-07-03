import type { AppConfig } from "../config.js";
import type { Repositories } from "../repositories.js";
import type { AiTasks } from "./aiTasks.js";
import { RepositoryConversationHistoryReader, type ConversationHistoryReader } from "./conversationHistoryReader.js";
import { analyzeInboundTurn } from "./inboundTurnAnalysis.js";
import { prepareInboundConversationContext } from "./inboundConversationContext.js";
import type { A2CWebhookPayload } from "./inboundMessage.js";
import { persistAnalyzedInboundTurn } from "./inboundTurnPersistence.js";
import { respondToInboundTurn } from "./inboundTurnResponder.js";

type PrepareInboundContext = typeof prepareInboundConversationContext;
type AnalyzeInbound = typeof analyzeInboundTurn;
type PersistInbound = typeof persistAnalyzedInboundTurn;
type RespondInbound = typeof respondToInboundTurn;

export interface InboundTurnPipelineDeps {
  repos: Repositories;
  ai: AiTasks;
  config: AppConfig;
  prepareContext?: PrepareInboundContext;
  analyzeTurn?: AnalyzeInbound;
  persistTurn?: PersistInbound;
  respondTurn?: RespondInbound;
  historyReader?: ConversationHistoryReader;
}

export class InboundTurnPipeline {
  private readonly prepareContext: PrepareInboundContext;
  private readonly analyzeTurn: AnalyzeInbound;
  private readonly persistTurn: PersistInbound;
  private readonly respondTurn: RespondInbound;
  private readonly historyReader: ConversationHistoryReader;

  constructor(private readonly deps: InboundTurnPipelineDeps) {
    this.prepareContext = deps.prepareContext || prepareInboundConversationContext;
    this.analyzeTurn = deps.analyzeTurn || analyzeInboundTurn;
    this.persistTurn = deps.persistTurn || persistAnalyzedInboundTurn;
    this.respondTurn = deps.respondTurn || respondToInboundTurn;
    this.historyReader = deps.historyReader || new RepositoryConversationHistoryReader(deps.repos);
  }

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
    } = await this.prepareContext({
      repos: this.deps.repos,
      ai: this.deps.ai,
      config: this.deps.config,
      payload,
      merchantId,
      simulation: options.simulation
    });
    const historyForIntent = this.historyReader.recentMessages(conversation.id, 8);
    const {
      analysis,
      scriptFlow,
      strictFlowEnabled,
      effectiveStrictFlowStep,
      inferredIntent,
      contextualIntent,
      learnedIntentDebug,
      intentLearningCandidate
    } = await this.analyzeTurn({
      repos: this.deps.repos,
      ai: this.deps.ai,
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
    const inboundTurn = await this.persistTurn({
      repos: this.deps.repos,
      runtimeConfig,
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
      analysisText,
      customerTextForAi,
      inferredIntent,
      contextualIntent,
      learnedIntentDebug,
      strictFlowEnabled,
      strictFlowStepBefore: effectiveStrictFlowStep || conversation.flowStep || "",
      intentLearningCandidate
    });
    if (!inboundTurn.inserted) return { status: "duplicate", conversationId: conversation.id };
    const inboundMemory = inboundTurn.inboundMemory!;

    return this.respondTurn({
      repos: this.deps.repos,
      ai: this.deps.ai,
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
