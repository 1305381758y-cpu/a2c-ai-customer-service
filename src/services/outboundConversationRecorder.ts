import type { A2CClient } from "../clients/a2c.js";
import type { AppConfig } from "../config.js";
import type { Conversation, MessageInput, Repositories } from "../repositories.js";
import { sendOutboundMessage, type OutboundIdPolicy, type OutboundPayload, type OutboundSendResult } from "./outboundMessageSender.js";
import { buildOutboundConversationRawPayload } from "./outboundConversationPayload.js";
import { translateForOperator } from "./translation.js";

export interface OutboundConversationRecordResult {
  sendResult: OutboundSendResult;
  inserted: boolean;
  messageId?: number;
}

export async function recordOutboundConversationMessage(input: {
  repos: Repositories;
  runtimeConfig: AppConfig;
  a2c: Pick<A2CClient, "sendMessage">;
  conversation: Conversation;
  simulation?: boolean;
  payload: OutboundPayload;
  idPolicy: OutboundIdPolicy;
  message: {
    content: string;
    msgType: string;
    language: string;
    intent: MessageInput["intent"];
    rawPayload: Record<string, unknown>;
  };
  operatorTranslation?: boolean;
  memory?: {
    intent: MessageInput["intent"];
    content: string;
    direction: "outbound";
  };
}): Promise<OutboundConversationRecordResult> {
  const sendResult = await sendOutboundMessage({
    a2c: input.a2c,
    simulation: input.simulation,
    payload: input.payload,
    idPolicy: input.idPolicy
  });
  const operatorTranslation = input.operatorTranslation === false
    ? undefined
    : await translateForOperator(input.runtimeConfig, input.message.content, input.message.language);
  const inserted = input.repos.insertMessage({
    conversationId: input.conversation.id,
    direction: "outbound",
    externalId: sendResult.externalId,
    content: input.message.content,
    msgType: input.message.msgType,
    language: input.message.language,
    intent: input.message.intent,
    rawPayload: buildOutboundConversationRawPayload({
      basePayload: input.message.rawPayload,
      operatorTranslation,
      sendResult,
      simulation: input.simulation
    })
  });
  if (input.memory) {
    input.repos.updateCustomerMemoryFromMessage(input.conversation, input.memory);
  }
  return {
    sendResult,
    inserted: inserted.inserted,
    messageId: inserted.id
  };
}
