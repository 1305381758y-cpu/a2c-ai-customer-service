import type { LearnedIntentDebugInfo } from "./aiConversationReply.js";
import type { A2CWebhookPayload } from "./inboundMessage.js";
import type { InboundTurnAnalysisResult } from "./inboundTurnAnalysis.js";

export interface InboundTranslationPayload {
  originalText: string;
  translatedText: string;
  targetLanguage: string;
  status: string;
  error?: string;
}

export function buildInboundTurnRawPayload(input: {
  payload: A2CWebhookPayload;
  inferredIntent: InboundTurnAnalysisResult["inferredIntent"];
  contextualIntent: InboundTurnAnalysisResult["contextualIntent"];
  learnedIntentDebug: LearnedIntentDebugInfo | null;
  strictFlowEnabled: boolean;
  strictFlowStepBefore: string;
  inboundTranslation: InboundTranslationPayload;
  mediaUrl: string;
  fileName: string;
  imageAnalysis: unknown;
  msgType: string;
  simulation: boolean;
}): Record<string, unknown> {
  return {
    ...input.payload,
    inferredIntent: input.inferredIntent,
    contextualIntent: input.contextualIntent,
    learnedIntent: input.learnedIntentDebug,
    strictFlowEnabled: input.strictFlowEnabled,
    strictFlowStepBefore: input.strictFlowStepBefore,
    originalContent: input.inboundTranslation.originalText,
    translatedContent: input.inboundTranslation.translatedText,
    targetLanguage: input.inboundTranslation.targetLanguage,
    translationStatus: input.inboundTranslation.status,
    translationError: input.inboundTranslation.error || "",
    mediaUrl: input.mediaUrl,
    fileName: input.fileName || "",
    imageAnalysis: input.msgType === "image" ? input.imageAnalysis : null,
    simulation: input.simulation
  };
}
