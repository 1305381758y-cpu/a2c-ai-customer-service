import { describe, expect, it, vi } from "vitest";
import type { A2CClient } from "../src/clients/a2c.js";
import { loadConfig } from "../src/config.js";
import type { StrictFlowReply } from "../src/domain/strictFlow.js";
import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";
import { sendStrictFlowTextOutbound } from "../src/services/strictFlowTextOutbound.js";

describe("strict flow multipart language fallback", () => {
  it("keeps only one registration-intent prompt when translation is unavailable", async () => {
    const config = loadConfig({
      DATABASE_URL: ":memory:",
      A2C_BASE_URL: "https://a2c.test",
      A2C_APP_ID: "app",
      A2C_APP_SECRET: "secret"
    });
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("多段降级测试商户");
    const country = repos.createMerchantCountry(merchant.id, {
      name: "巴西",
      defaultLanguage: "pt-BR",
      requirePlatformAccount: true,
      requirePhone: true,
      requireTelegram: true
    });
    repos.syncMerchantA2CAccounts(merchant.id, [{ apiPhone: "agent-fallback", verifiedName: "客服号" }]);
    const conversation = repos.getOrCreateConversation("customer-fallback", "agent-fallback", "客户", merchant.id, country.id);
    const replyParts = [
      "首先，请允许我自我介绍一下。",
      "这份工作很简单，完成商家安排的任务后可获得佣金。",
      "Você tem tempo para continuar o cadastro agora?"
    ];
    const strictReply: StrictFlowReply = {
      enabled: true,
      reply: replyParts.join("\n\n"),
      replyParts,
      replyFlowStep: "project_intro",
      language: "pt-BR",
      nextFlowStep: "registration_intent",
      stage: "need_platform_register",
      needsInviteCode: false
    };

    const result = await sendStrictFlowTextOutbound({
      repos,
      ai: {} as never,
      runtimeConfig: config,
      a2c: { sendMessage: vi.fn() } as unknown as A2CClient,
      conversation,
      strictReply,
      customerText: "Simm",
      history: [],
      agentProfile: repos.getMerchantAgentProfile(merchant.id),
      data: {
        messageId: "multipart-fallback-inbound",
        content: "Simm",
        from: "customer-fallback",
        to: "agent-fallback",
        msgType: "text",
        timestamp: 1783010000
      },
      payloadId: "multipart-fallback-payload",
      simulation: true,
      strictFlowEnabled: true,
      learnedIntent: null,
      country
    });

    const outboundMessages = repos.listConversationMessages(conversation.id, 20)
      .filter((item) => item.direction === "outbound");
    const prompts = outboundMessages.filter((item) =>
      /tempo (?:livre )?(?:para )?continuar|continuar o cadastro agora/i.test(item.content)
    );
    expect(prompts).toHaveLength(1);
    expect(result.outbounds).toHaveLength(outboundMessages.length);
  });
});
