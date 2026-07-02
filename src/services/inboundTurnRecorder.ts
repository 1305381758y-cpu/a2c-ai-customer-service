import type { A2CWebhookPayload } from "./inboundMessage.js";
import type { MessageAnalysis } from "../domain/analyzer.js";
import type {
  Conversation,
  CustomerMemoryRecord,
  IntentLearningInput,
  MessageInput,
  Repositories
} from "../repositories.js";
import type { LearnedIntentDebugInfo } from "./aiConversationReply.js";
import type { InboundTurnAnalysisResult } from "./inboundTurnAnalysis.js";

export interface InboundTurnRecordResult {
  inserted: boolean;
  messageId?: number;
  inboundMemory?: CustomerMemoryRecord;
}

type InboundTranslation = {
  originalText: string;
  translatedText: string;
  targetLanguage: string;
  status: string;
  error?: string;
};

type IntentLearningCandidate = Pick<
  IntentLearningInput,
  "candidateKey" | "suggestedIntent" | "displayName" | "description"
>;

export function recordInboundTurn(input: {
  repos: Repositories;
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
  customerTextForAi: string;
  inboundTranslation: InboundTranslation;
  inferredIntent: InboundTurnAnalysisResult["inferredIntent"];
  contextualIntent: InboundTurnAnalysisResult["contextualIntent"];
  learnedIntentDebug: LearnedIntentDebugInfo | null;
  strictFlowEnabled: boolean;
  strictFlowStepBefore: string;
  intentLearningCandidate?: IntentLearningCandidate | null;
}): InboundTurnRecordResult {
  const inserted = input.repos.insertMessage({
    conversationId: input.conversation.id,
    direction: "inbound",
    externalId: input.data.messageId || input.payload.id,
    content: input.content,
    msgType: input.msgType,
    language: input.analysis.language,
    intent: input.analysis.intent,
    phoneDetected: input.analysis.phone,
    telegramDetected: input.analysis.telegram,
    whatsappDetected: input.analysis.whatsapp,
    rawPayload: inboundRawPayload(input)
  });
  if (!inserted.inserted) return { inserted: false };

  if (input.intentLearningCandidate) {
    input.repos.recordIntentLearningEvent({
      merchantId: input.conversation.merchantId,
      countryId: input.conversation.countryId,
      conversationId: input.conversation.id,
      messageId: inserted.id,
      customerText: input.customerTextForAi,
      language: input.analysis.language,
      detectedIntent: input.analysis.intent,
      inferredIntent: input.inferredIntent,
      contextualIntent: input.contextualIntent.intent,
      flowStep: input.strictFlowStepBefore,
      ...input.intentLearningCandidate
    });
  }

  input.conversation.language = input.analysis.language;
  input.conversation.stage = input.analysis.stage;
  input.conversation.extractedPhone = input.conversation.extractedPhone || input.analysis.phone;
  input.conversation.extractedTelegram = input.conversation.extractedTelegram || input.analysis.telegram;
  input.conversation.extractedWhatsApp = input.conversation.extractedWhatsApp || input.analysis.whatsapp;
  if (input.analysis.intent === "platform_register_done") {
    input.repos.markInviteCodeUsedForConversation(input.conversation.id, input.conversation.merchantId);
  }
  input.repos.upsertCustomerFromConversation(input.conversation);
  const inboundMemory = input.repos.updateCustomerMemoryFromMessage(input.conversation, {
    intent: input.analysis.intent as MessageInput["intent"],
    content: input.customerTextForAi,
    direction: "inbound"
  });

  return {
    inserted: true,
    messageId: inserted.id,
    inboundMemory
  };
}

function inboundRawPayload(input: {
  payload: A2CWebhookPayload;
  inferredIntent: InboundTurnAnalysisResult["inferredIntent"];
  contextualIntent: InboundTurnAnalysisResult["contextualIntent"];
  learnedIntentDebug: LearnedIntentDebugInfo | null;
  strictFlowEnabled: boolean;
  strictFlowStepBefore: string;
  inboundTranslation: InboundTranslation;
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
