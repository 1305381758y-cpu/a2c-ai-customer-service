import type { OutboundSendResult } from "./outboundMessageSender.js";

export interface OperatorTranslationPayload {
  originalText: string;
  translatedText: string;
  targetLanguage: string;
  status: string;
  error?: string;
}

export interface CustomerTranslationPayload {
  originalText: string;
  translatedText: string;
  targetLanguage: string;
  status: string;
  error?: string;
}

export function buildOutboundConversationRawPayload(input: {
  basePayload: Record<string, unknown>;
  customerTranslation?: CustomerTranslationPayload;
  operatorTranslation?: OperatorTranslationPayload;
  sendResult: OutboundSendResult;
  simulation?: boolean;
}): Record<string, unknown> {
  const customerTranslationPayload = input.customerTranslation ? {
    originalContent: input.customerTranslation.originalText,
    translatedContent: input.customerTranslation.translatedText,
    targetLanguage: input.customerTranslation.targetLanguage,
    translationStatus: input.customerTranslation.status,
    translationError: input.customerTranslation.error || ""
  } : {};
  const translationPayload = input.operatorTranslation ? {
    ...(input.customerTranslation ? {} : { originalContent: input.operatorTranslation.originalText }),
    operatorTranslatedContent: input.operatorTranslation.translatedText,
    operatorTranslationTargetLanguage: input.operatorTranslation.targetLanguage,
    operatorTranslationStatus: input.operatorTranslation.status,
    operatorTranslationError: input.operatorTranslation.error || ""
  } : {};
  return {
    ...input.basePayload,
    ...customerTranslationPayload,
    ...translationPayload,
    a2cSendStatus: input.sendResult.a2cSendStatus,
    a2cSendError: input.sendResult.a2cSendError,
    simulation: Boolean(input.simulation)
  };
}
