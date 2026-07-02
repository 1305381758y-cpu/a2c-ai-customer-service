import { describe, expect, it, vi } from "vitest";
import { ConversationApplication } from "../src/services/conversationApplication.js";
import type { InboundConversationMessage } from "../src/services/inboundMessage.js";

function inboundMessage(): InboundConversationMessage {
  return {
    merchantId: "merchant-1",
    simulation: true,
    payload: {
      id: "payload-1",
      timestamp: 1,
      type: "CUSTOMER_MESSAGE",
      data: {
        messageId: "message-1",
        content: "hello",
        from: "customer",
        to: "agent",
        msgType: "text",
        timestamp: 1
      }
    }
  };
}

describe("ConversationApplication", () => {
  it("delegates inbound handling through a single conversation processor interface", async () => {
    const inbound = {
      handleInboundMessage: vi.fn(async () => ({ status: "replied", conversationId: "conversation-1" }))
    };
    const followUps = {
      processDueFollowUps: vi.fn()
    };
    const app = new ConversationApplication(inbound, followUps);
    const input = inboundMessage();

    await expect(app.handleInboundMessage(input)).resolves.toEqual({
      status: "replied",
      conversationId: "conversation-1"
    });

    expect(inbound.handleInboundMessage).toHaveBeenCalledWith(input);
    expect(followUps.processDueFollowUps).not.toHaveBeenCalled();
  });

  it("delegates due follow-up processing without exposing follow-up implementation to the engine", async () => {
    const inbound = {
      handleInboundMessage: vi.fn()
    };
    const followUps = {
      processDueFollowUps: vi.fn(async () => ({ scanned: 3, sent: 2, skipped: 1, failed: 0 }))
    };
    const app = new ConversationApplication(inbound, followUps);

    await expect(app.processDueFollowUps(25)).resolves.toEqual({ scanned: 3, sent: 2, skipped: 1, failed: 0 });

    expect(followUps.processDueFollowUps).toHaveBeenCalledWith(25);
    expect(inbound.handleInboundMessage).not.toHaveBeenCalled();
  });
});
