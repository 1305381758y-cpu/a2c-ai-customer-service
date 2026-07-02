import type { AiReply } from "../clients/aiReplyTypes.js";
import type { Conversation, MerchantCountryRecord } from "../repositories.js";
import { isConversationGoalComplete } from "./conversationGoalCompletion.js";

export interface AiConversationReplyStateResult {
  readyForHandoff: boolean;
  handoffLanguage: string;
}

export function applyAiReplyConversationState(input: {
  conversation: Conversation;
  country: MerchantCountryRecord;
  aiReply: AiReply;
  fallbackLanguage: string;
}): AiConversationReplyStateResult {
  const { conversation, country, aiReply } = input;
  if (aiReply.extractedPhone && !conversation.extractedPhone) conversation.extractedPhone = aiReply.extractedPhone;
  if (aiReply.extractedTelegram && !conversation.extractedTelegram) conversation.extractedTelegram = aiReply.extractedTelegram;
  if (aiReply.extractedWhatsApp && !conversation.extractedWhatsApp) conversation.extractedWhatsApp = aiReply.extractedWhatsApp;
  if (aiReply.language) conversation.language = aiReply.language;
  return {
    readyForHandoff: aiReply.stage === "ready_for_handoff" || isConversationGoalComplete(conversation, country),
    handoffLanguage: aiReply.language || input.fallbackLanguage
  };
}
