import type { A2CClient } from "../clients/a2c.js";
import type { TelegramClient } from "../clients/telegram.js";
import type { AppConfig } from "../config.js";
import { suppressRegistrationDetailsForNonLinkStep } from "../domain/registrationPolicy.js";
import type { MessageAnalysis } from "../domain/analyzer.js";
import type { Conversation, CustomerMemoryRecord, MerchantAgentProfileRecord, MerchantCountryRecord, Repositories } from "../repositories.js";
import type { AiTasks } from "./aiTasks.js";
import { completeConversationGoal } from "./conversationGoalCompletion.js";
import type { A2CWebhookPayload } from "./inboundMessage.js";
import { recordOutboundConversationMessage } from "./outboundConversationRecorder.js";
import { buildAiConversationOutboundRawPayload } from "./aiConversationOutboundPayload.js";
import { buildAiConversationReplyContext } from "./aiConversationReplyContext.js";
import { applyAiReplyConversationState } from "./aiConversationReplyState.js";

export interface LearnedIntentDebugInfo {
  id: number;
  suggestedIntent: string;
  displayName: string;
  score: number;
}

export interface AiConversationReplyResult {
  status: "reply_simulated" | "reply_simulation_not_recorded" | "replied" | "reply_send_failed" | "handoff" | "handoff_simulated";
  conversationId: string;
}

export async function generateAndRecordAiConversationReply(input: {
  repos: Repositories;
  ai: Pick<AiTasks, "generateReply">;
  runtimeConfig: AppConfig;
  conversation: Conversation;
  country: MerchantCountryRecord;
  analysis: MessageAnalysis;
  customerText: string;
  inboundMemory: CustomerMemoryRecord;
  agentProfile: MerchantAgentProfileRecord;
  a2c: Pick<A2CClient, "sendMessage">;
  telegram: Pick<TelegramClient, "sendHandoffMessage">;
  data: A2CWebhookPayload["data"];
  payloadId: string;
  simulation: boolean;
  strictFlowEnabled: boolean;
  learnedIntent: LearnedIntentDebugInfo | null;
  generateReview?: (conversationId: string, runtimeConfig: AppConfig) => Promise<unknown>;
}): Promise<AiConversationReplyResult> {
  const replyContext = buildAiConversationReplyContext({
    repos: input.repos,
    conversation: input.conversation,
    country: input.country,
    analysis: input.analysis,
    customerText: input.customerText,
    inboundMemory: input.inboundMemory,
    agentProfile: input.agentProfile
  });
  const aiReply = await input.ai.generateReply(input.runtimeConfig, replyContext.replyInput);
  if (!replyContext.shouldIncludeRegistrationDetails) {
    aiReply.reply = suppressRegistrationDetailsForNonLinkStep(aiReply.reply, input.runtimeConfig, input.country, input.conversation, aiReply.language || input.conversation.language);
  }

  const replyState = applyAiReplyConversationState({
    conversation: input.conversation,
    country: input.country,
    aiReply,
    fallbackLanguage: input.analysis.language
  });
  if (replyState.readyForHandoff) {
    return completeConversationGoal({
      repos: input.repos,
      runtimeConfig: input.runtimeConfig,
      conversation: input.conversation,
      data: input.data,
      language: replyState.handoffLanguage,
      a2c: input.a2c,
      telegram: input.telegram,
      simulation: input.simulation,
      sendVerificationReply: true,
      generateReview: input.generateReview
    });
  }

  const outbound = await recordOutboundConversationMessage({
    repos: input.repos,
    runtimeConfig: input.runtimeConfig,
    a2c: input.a2c,
    conversation: input.conversation,
    simulation: input.simulation,
    payload: {
      to: input.data.from,
      senderPhoneNumber: input.data.to,
      type: "text",
      content: aiReply.reply
    },
    idPolicy: {
      simulatedPrefix: "simulated_reply",
      sentFallbackPrefix: "a2c_sent",
      failedPrefix: "send_failed",
      contextId: input.data.messageId || input.payloadId
    },
    message: {
      content: aiReply.reply,
      msgType: "text",
      language: aiReply.language || input.conversation.language,
      intent: "unknown",
      rawPayload: buildAiConversationOutboundRawPayload({
        aiReply,
        strictFlowEnabled: input.strictFlowEnabled,
        agentProfile: input.agentProfile,
        learnedIntent: input.learnedIntent,
        samples: replyContext.samples,
        trainingMaterials: replyContext.trainingMaterials,
        country: input.country,
        inviteCode: replyContext.inviteCode
      })
    },
    memory: {
      intent: "unknown",
      content: aiReply.reply,
      direction: "outbound"
    }
  });
  input.repos.updateConversation(input.conversation);
  input.repos.upsertCustomerFromConversation(input.conversation);

  if (outbound.sendResult.a2cSendStatus === "simulated") {
    return { status: outbound.inserted ? "reply_simulated" : "reply_simulation_not_recorded", conversationId: input.conversation.id };
  }
  return { status: outbound.sendResult.a2cSendStatus === "sent" && outbound.inserted ? "replied" : "reply_send_failed", conversationId: input.conversation.id };
}
