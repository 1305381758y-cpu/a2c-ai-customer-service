import type { A2CClient } from "../clients/a2c.js";
import type { AiReply } from "../clients/aiReplyTypes.js";
import type { AppConfig } from "../config.js";
import type {
  Conversation,
  MerchantAgentProfileRecord,
  MerchantCountryRecord,
  Repositories
} from "../repositories.js";
import type { LearnedIntentDebugInfo } from "./aiConversationReply.js";
import type { AiConversationReplyContext } from "./aiConversationReplyContext.js";
import { buildAiConversationOutboundRawPayload } from "./aiConversationOutboundPayload.js";
import type { A2CWebhookPayload } from "./inboundMessage.js";
import { recordOutboundConversationMessage, type OutboundConversationRecordResult } from "./outboundConversationRecorder.js";

export async function sendAiConversationTextOutbound(input: {
  repos: Repositories;
  runtimeConfig: AppConfig;
  a2c: Pick<A2CClient, "sendMessage">;
  conversation: Conversation;
  country: MerchantCountryRecord;
  aiReply: AiReply;
  replyContext: AiConversationReplyContext;
  agentProfile: MerchantAgentProfileRecord;
  data: A2CWebhookPayload["data"];
  payloadId: string;
  simulation: boolean;
  strictFlowEnabled: boolean;
  learnedIntent: LearnedIntentDebugInfo | null;
}): Promise<OutboundConversationRecordResult> {
  return recordOutboundConversationMessage({
    repos: input.repos,
    runtimeConfig: input.runtimeConfig,
    a2c: input.a2c,
    conversation: input.conversation,
    simulation: input.simulation,
    payload: {
      to: input.data.from,
      senderPhoneNumber: input.data.to,
      type: "text",
      content: input.aiReply.reply
    },
    idPolicy: {
      simulatedPrefix: "simulated_reply",
      sentFallbackPrefix: "a2c_sent",
      failedPrefix: "send_failed",
      contextId: input.data.messageId || input.payloadId
    },
    message: {
      content: input.aiReply.reply,
      msgType: "text",
      language: input.aiReply.language || input.conversation.language,
      intent: "unknown",
      rawPayload: buildAiConversationOutboundRawPayload({
        aiReply: input.aiReply,
        strictFlowEnabled: input.strictFlowEnabled,
        agentProfile: input.agentProfile,
        learnedIntent: input.learnedIntent,
        samples: input.replyContext.samples,
        trainingMaterials: input.replyContext.trainingMaterials,
        country: input.country,
        inviteCode: input.replyContext.inviteCode
      })
    },
    memory: {
      intent: "unknown",
      content: input.aiReply.reply,
      direction: "outbound"
    }
  });
}
