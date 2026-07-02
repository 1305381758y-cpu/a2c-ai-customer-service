import type { A2CClient } from "../clients/a2c.js";

export type OutboundSendStatus = "sent" | "failed" | "simulated";

export type OutboundPayload = {
  to: string;
  senderPhoneNumber: string;
  type: "text" | "image" | "video" | "audio" | "document";
  content?: string;
  url?: string;
  caption?: string;
  fileName?: string;
};

export type OutboundIdPolicy = {
  simulatedPrefix: string;
  sentFallbackPrefix: string;
  failedPrefix: string;
  contextId: string;
};

export type OutboundSendResult = {
  externalId: string;
  a2cSendStatus: OutboundSendStatus;
  a2cSendError: string;
};

export async function sendOutboundMessage(input: {
  a2c: Pick<A2CClient, "sendMessage">;
  payload: OutboundPayload;
  idPolicy: OutboundIdPolicy;
  simulation?: boolean;
}): Promise<OutboundSendResult> {
  const contextId = input.idPolicy.contextId || `${Date.now()}`;
  if (input.simulation) {
    return {
      externalId: `${input.idPolicy.simulatedPrefix}:${contextId}:${Date.now()}`,
      a2cSendStatus: "simulated",
      a2cSendError: ""
    };
  }

  try {
    const externalId = await input.a2c.sendMessage(input.payload);
    return {
      externalId: externalId || `${input.idPolicy.sentFallbackPrefix}:${contextId}:${Date.now()}`,
      a2cSendStatus: "sent",
      a2cSendError: ""
    };
  } catch (error) {
    const a2cSendError = error instanceof Error ? error.message : "unknown";
    return {
      externalId: `${input.idPolicy.failedPrefix}:${contextId}:${Date.now()}:${a2cSendError.slice(0, 120)}`,
      a2cSendStatus: "failed",
      a2cSendError
    };
  }
}
