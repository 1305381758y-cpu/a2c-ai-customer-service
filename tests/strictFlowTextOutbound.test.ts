import { describe, expect, it, vi } from "vitest";
import type { A2CClient } from "../src/clients/a2c.js";
import { loadConfig } from "../src/config.js";
import type { StrictFlowReply } from "../src/domain/strictFlow.js";
import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";
import { sendStrictFlowTextOutbound } from "../src/services/strictFlowTextOutbound.js";

function runtimeConfig() {
  return loadConfig({
    DATABASE_URL: ":memory:",
    A2C_BASE_URL: "https://a2c.test",
    A2C_APP_ID: "app",
    A2C_APP_SECRET: "secret"
  });
}

function aiStub() {
  return {
    naturalizeStrictFlowText: vi.fn(async (_config, input) => ({
      text: `${input.draftReply}（自然表达）`,
      used: true,
      error: ""
    }))
  };
}

function setupConversation() {
  const repos = new Repositories(openDb(":memory:"));
  const merchant = repos.createMerchant("严格流程文本出站商户");
  const country = repos.createMerchantCountry(merchant.id, {
    name: "巴西",
    defaultLanguage: "zh",
    platformRegisterUrl: "https://register.example",
    requirePlatformAccount: true,
    requirePhone: true,
    requireTelegram: true
  });
  const account = repos.syncMerchantA2CAccounts(merchant.id, [{
    apiPhone: "agent-text",
    verifiedName: "客服号"
  }])[0];
  const inviteCode = repos.createInviteCodeForA2CAccount(account.id, {
    code: "INV-TEXT",
    registerUrl: "https://register.example/?code={code}",
    status: "reserved"
  }, merchant.id);
  const conversation = repos.getOrCreateConversation("customer-text", "agent-text", "客户", merchant.id, country.id);
  conversation.language = "zh";
  conversation.stage = "need_platform_register";
  conversation.flowStep = "wait_registration";
  repos.updateConversation(conversation);
  return {
    repos,
    merchant,
    country,
    inviteCode,
    conversation,
    agentProfile: repos.getMerchantAgentProfile(merchant.id)
  };
}

describe("strict flow text outbound module", () => {
  it("naturalizes, records, and annotates strict-flow text replies in simulation", async () => {
    const context = setupConversation();
    const a2c = { sendMessage: vi.fn(async () => "real-message-id") } as unknown as A2CClient;
    const strictReply: StrictFlowReply = {
      enabled: true,
      reply: "好的，现在我会把链接和邀请码发给您。",
      language: "zh",
      nextFlowStep: "wait_registration",
      stage: "need_platform_register",
      needsInviteCode: true
    };

    const result = await sendStrictFlowTextOutbound({
      ...context,
      ai: aiStub() as never,
      runtimeConfig: runtimeConfig(),
      a2c,
      strictReply,
      customerText: "我准备好了",
      history: [],
      data: {
        messageId: "inbound-text",
        content: "我准备好了",
        from: "customer-text",
        to: "agent-text",
        msgType: "text",
        timestamp: 1783010000
      },
      payloadId: "payload-text",
      simulation: true,
      strictFlowEnabled: true,
      learnedIntent: null
    });

    expect(a2c.sendMessage).not.toHaveBeenCalled();
    expect(result.outbound.sendResult.a2cSendStatus).toBe("simulated");
    expect(result.refinedReply.naturalized.used).toBe(true);
    expect(strictReply.reply).toContain("自然表达");

    const message = context.repos.listConversationMessages(context.conversation.id, 10)
      .find((row) => row.direction === "outbound");
    expect(message?.content).toContain("自然表达");
    expect(message?.rawPayload).toMatchObject({
      replyMode: "strict_flow",
      strictFlow: true,
      strictFlowStep: "wait_registration",
      usedAiNaturalizer: true,
      a2cSendStatus: "simulated",
      assignedInviteCode: expect.objectContaining({ code: "INV-TEXT" })
    });

    const memory = context.repos.getCustomerMemoryByConversation(context.conversation.id);
    const recentSignals = memory?.facts.recentSignals as Array<{ content: string }> | undefined;
    expect(recentSignals?.map((signal) => signal.content).join("\n")).toContain("自然表达");
  });
});
