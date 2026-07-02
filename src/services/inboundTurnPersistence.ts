import type { AppConfig } from "../config.js";
import type { MessageAnalysis } from "../domain/analyzer.js";
import type { Conversation, Repositories } from "../repositories.js";
import type { LearnedIntentDebugInfo } from "./aiConversationReply.js";
import type { A2CWebhookPayload } from "./inboundMessage.js";
import type { InboundTurnAnalysisResult } from "./inboundTurnAnalysis.js";
import { recordInboundTurn, type InboundTurnRecordResult } from "./inboundTurnRecorder.js";
import { translateForOperator } from "./translation.js";

export async function persistAnalyzedInboundTurn(input: {
  repos: Repositories;
  runtimeConfig: AppConfig;
  conversation: Conversation;
  payload: A2CWebhookPayload;
  data: A2CWebhookPayload["data"];
  content: string;
  msgType: string;
  mediaUrl: string;
  fileName: string;
  imageAnalysis: unknown;
  simulation: boolean;
  analysis: MessageAnalysis;
  analysisText: string;
  customerTextForAi: string;
  inferredIntent: InboundTurnAnalysisResult["inferredIntent"];
  contextualIntent: InboundTurnAnalysisResult["contextualIntent"];
  learnedIntentDebug: LearnedIntentDebugInfo | null;
  strictFlowEnabled: boolean;
  strictFlowStepBefore: string;
  intentLearningCandidate?: InboundTurnAnalysisResult["intentLearningCandidate"];
}): Promise<InboundTurnRecordResult> {
  const inboundTranslation = input.analysisText
    ? await translateForOperator(input.runtimeConfig, input.analysisText, input.analysis.language)
    : {
      originalText: input.content,
      translatedText: "",
      targetLanguage: "zh-CN",
      status: "skipped" as const,
      error: ""
    };

  return recordInboundTurn({
    repos: input.repos,
    conversation: input.conversation,
    payload: input.payload,
    data: input.data,
    content: input.content,
    msgType: input.msgType,
    mediaUrl: input.mediaUrl,
    fileName: input.fileName,
    imageAnalysis: input.imageAnalysis,
    simulation: input.simulation,
    analysis: input.analysis,
    customerTextForAi: input.customerTextForAi,
    inboundTranslation,
    inferredIntent: input.inferredIntent,
    contextualIntent: input.contextualIntent,
    learnedIntentDebug: input.learnedIntentDebug,
    strictFlowEnabled: input.strictFlowEnabled,
    strictFlowStepBefore: input.strictFlowStepBefore,
    intentLearningCandidate: input.intentLearningCandidate
  });
}
