import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";
import { recordOutboundConversationMessage } from "../src/services/outboundConversationRecorder.js";

describe("recordOutboundConversationMessage", () => {
  it("keeps simulation sends off A2C while recording diagnostics and memory", async () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("出站记录商户");
    const conversation = repos.getOrCreateConversation("customer-1", "agent-1", "", merchant.id);
    conversation.language = "zh";
    repos.updateConversation(conversation);
    const a2c = { sendMessage: vi.fn(async () => "should-not-send") };

    const result = await recordOutboundConversationMessage({
      repos,
      runtimeConfig: loadConfig({ DATABASE_URL: ":memory:" }),
      a2c,
      conversation,
      simulation: true,
      payload: {
        to: "customer-1",
        senderPhoneNumber: "agent-1",
        type: "text",
        content: "您好"
      },
      idPolicy: {
        simulatedPrefix: "simulated_test",
        sentFallbackPrefix: "sent_test",
        failedPrefix: "failed_test",
        contextId: "msg-1"
      },
      message: {
        content: "您好",
        msgType: "text",
        language: "zh",
        intent: "unknown",
        rawPayload: { replyMode: "strict_flow" }
      },
      memory: {
        intent: "unknown",
        content: "您好",
        direction: "outbound"
      }
    });

    expect(a2c.sendMessage).not.toHaveBeenCalled();
    expect(result.inserted).toBe(true);
    expect(result.sendResult.a2cSendStatus).toBe("simulated");
    const outbound = repos.listConversationMessages(conversation.id, 5).find((message) => message.direction === "outbound");
    expect(outbound?.rawPayload).toMatchObject({
      replyMode: "strict_flow",
      originalContent: "您好",
      operatorTranslatedContent: "您好",
      operatorTranslationStatus: "skipped",
      a2cSendStatus: "simulated",
      a2cSendError: "",
      simulation: true
    });
    const memory = repos.getCustomerMemoryByConversation(conversation.id);
    expect(memory?.facts.recentSignals).toEqual(expect.arrayContaining([
      expect.objectContaining({ direction: "outbound", content: "您好" })
    ]));
  });
});
