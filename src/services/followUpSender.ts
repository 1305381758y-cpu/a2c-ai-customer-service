import { A2CClient } from "../clients/a2c.js";
import { normalizeFollowUpLanguage } from "../domain/strictFlow.js";
import type { AppConfig } from "../config.js";
import type { Conversation, MerchantCountryRecord, Repositories } from "../repositories.js";
import { recordOutboundConversationMessage, type OutboundConversationRecordResult } from "./outboundConversationRecorder.js";

export interface FollowUpSendInput {
  runtimeConfig: AppConfig;
  conversation: Conversation;
  country?: MerchantCountryRecord;
  content: string;
  flowStep: string;
}

export interface FollowUpSender {
  send(input: FollowUpSendInput): Promise<OutboundConversationRecordResult>;
}

export function createA2CFollowUpSender(repos: Repositories): FollowUpSender {
  return {
    send: async (input) => {
      const a2c = new A2CClient(input.runtimeConfig, repos.a2cTokenStore(input.conversation.merchantId));
      return recordOutboundConversationMessage({
        repos,
        runtimeConfig: input.runtimeConfig,
        a2c,
        conversation: input.conversation,
        payload: {
          to: input.conversation.customerPhone,
          senderPhoneNumber: input.conversation.a2cAccountPhone,
          type: "text",
          content: input.content
        },
        idPolicy: {
          simulatedPrefix: "simulated_followup",
          sentFallbackPrefix: "followup",
          failedPrefix: "followup_failed",
          contextId: input.conversation.id
        },
        message: {
          content: input.content,
          msgType: "text",
          language: normalizeFollowUpLanguage(input.conversation.language, normalizeFollowUpLanguage(input.country?.defaultLanguage || "unknown", "unknown")),
          intent: "unknown",
          rawPayload: {
            replyMode: "strict_flow",
            followupSent: true,
            followupReason: "idle_2m",
            followupStep: input.flowStep,
            strictFlow: true,
            strictFlowStep: input.flowStep
          }
        },
        operatorTranslation: false,
        memory: {
          intent: "unknown",
          content: input.content,
          direction: "outbound"
        }
      });
    }
  };
}
