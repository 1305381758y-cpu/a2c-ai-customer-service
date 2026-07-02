import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";
import { completeConversationGoal } from "../src/services/conversationGoalCompletion.js";

function config() {
  return loadConfig({
    DATABASE_URL: ":memory:",
    A2C_BASE_URL: "https://a2c.test",
    A2C_APP_ID: "app",
    A2C_APP_SECRET: "secret"
  });
}

describe("conversation goal completion", () => {
  it("sends verification, notifies Telegram once, updates conversation and runs review", async () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("接管商户");
    const conversation = repos.getOrCreateConversation("customer-phone", "agent-phone", "客户昵称", merchant.id);
    conversation.language = "zh";
    conversation.extractedPhone = "13800138000";
    conversation.extractedTelegram = "@customer";
    repos.updateConversation(conversation);
    const a2c = { sendMessage: vi.fn(async () => "verify-message-id") };
    const telegram = { sendHandoffMessage: vi.fn<(text: string) => Promise<void>>(async () => undefined) };
    const generateReview = vi.fn(async () => undefined);

    const result = await completeConversationGoal({
      repos,
      runtimeConfig: config(),
      conversation,
      data: {
        messageId: "last-message-id",
        content: "@customer",
        from: "customer-phone",
        to: "agent-phone",
        msgType: "text",
        timestamp: 1783010000
      },
      language: "zh",
      a2c,
      telegram,
      generateReview
    });

    expect(result).toEqual({ status: "handoff", conversationId: conversation.id });
    expect(a2c.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      to: "customer-phone",
      senderPhoneNumber: "agent-phone",
      type: "text",
      content: "我们正在核实，请稍后。"
    }));
    expect(telegram.sendHandoffMessage).toHaveBeenCalledOnce();
    expect(String(telegram.sendHandoffMessage.mock.calls[0][0])).toContain("客户已完成自动引导流程，请人工跟进。");
    expect(generateReview).toHaveBeenCalledWith(conversation.id, expect.objectContaining({ A2C_APP_ID: "app" }));
    const stored = repos.getConversation(conversation.id);
    expect(stored?.status).toBe("human_handoff");
    expect(stored?.stage).toBe("ready_for_handoff");
    expect(stored?.handoffNotified).toBe(1);
    const outbound = repos.listConversationMessages(conversation.id, 10).find((message) => message.direction === "outbound");
    expect(outbound?.rawPayload?.systemFinalReply).toBe(true);
    expect(outbound?.rawPayload?.a2cSendStatus).toBe("sent");
  });

  it("does not notify Telegram for simulation completions", async () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("模拟接管商户");
    const conversation = repos.getOrCreateConversation("sim-customer", "sim-agent", "", merchant.id);
    conversation.language = "en";
    conversation.extractedPhone = "13800138000";
    conversation.extractedTelegram = "@customer";
    repos.updateConversation(conversation);
    const a2c = { sendMessage: vi.fn(async () => "should-not-send") };
    const telegram = { sendHandoffMessage: vi.fn(async () => undefined) };

    const result = await completeConversationGoal({
      repos,
      runtimeConfig: config(),
      conversation,
      data: {
        messageId: "sim-last-message-id",
        content: "@customer",
        from: "sim-customer",
        to: "sim-agent",
        msgType: "text",
        timestamp: 1783010000
      },
      language: "en",
      a2c,
      telegram,
      simulation: true
    });

    expect(result.status).toBe("handoff_simulated");
    expect(a2c.sendMessage).not.toHaveBeenCalled();
    expect(telegram.sendHandoffMessage).not.toHaveBeenCalled();
    const outbound = repos.listConversationMessages(conversation.id, 10).find((message) => message.direction === "outbound");
    expect(outbound?.content).toBe("We are verifying your information. Please wait a moment.");
    expect(outbound?.rawPayload?.a2cSendStatus).toBe("simulated");
  });
});
