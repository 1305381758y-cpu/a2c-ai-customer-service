import { A2CClient } from "../clients/a2c.js";
import type { AppConfig } from "../config.js";
import type { Conversation, Repositories } from "../repositories.js";
import { sendOutboundMessage, type OutboundSendResult } from "./outboundMessageSender.js";

export interface FollowUpSendInput {
  runtimeConfig: AppConfig;
  conversation: Pick<Conversation, "id" | "merchantId" | "customerPhone" | "a2cAccountPhone">;
  content: string;
}

export interface FollowUpSender {
  send(input: FollowUpSendInput): Promise<OutboundSendResult>;
}

export function createA2CFollowUpSender(repos: Pick<Repositories, "a2cTokenStore">): FollowUpSender {
  return {
    send: async (input) => {
      const a2c = new A2CClient(input.runtimeConfig, repos.a2cTokenStore(input.conversation.merchantId));
      return sendOutboundMessage({
        a2c,
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
        }
      });
    }
  };
}
