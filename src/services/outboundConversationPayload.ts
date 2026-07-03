import type { OutboundSendResult } from "./outboundMessageSender.js";

export interface OperatorTranslationPayload {
  originalText: string;
  translatedText: string;
  targetLanguage: string;
  status: string;
  error?: string;
}

export function buildOutboundConversationRawPayload(input: {
  basePayload: Record<string, unknown>;
  operatorTranslation?: OperatorTranslationPayload;
  sendResult: OutboundSendResult;
  simulation?: boolean;
}): Record<string, unknown> {
  const translationPayload = input.operatorTranslation ? {
    originalContent: input.operatorTranslation.originalText,
    operatorTranslatedContent: input.operatorTranslation.translatedText,
    operatorTranslationTargetLanguage: input.operatorTranslation.targetLanguage,
    operatorTranslationStatus: input.operatorTranslation.status,
    operatorTranslationError: input.operatorTranslation.error || ""
  } : {};
  return {
    ...input.basePayload,
    ...translationPayload,
    a2cSendStatus: input.sendResult.a2cSendStatus,
    a2cSendError: input.sendResult.a2cSendError,
    simulation: Boolean(input.simulation)
  };
}
