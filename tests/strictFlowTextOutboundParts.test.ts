import { describe, expect, it, vi } from "vitest";
import type { A2CClient } from "../src/clients/a2c.js";
import { loadConfig } from "../src/config.js";
import type { StrictFlowReply } from "../src/domain/strictFlow.js";
import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";

const refinementProbe = vi.hoisted(() => ({
  active: 0,
  calls: 0,
  maxActive: 0,
  removeMarkers: false
}));

vi.mock("../src/services/strictFlowReplyTextRefinement.js", () => ({
  refineStrictFlowReplyText: vi.fn(async (input: { strictReply: StrictFlowReply }) => {
    refinementProbe.calls += 1;
    refinementProbe.active += 1;
    refinementProbe.maxActive = Math.max(refinementProbe.maxActive, refinementProbe.active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    refinementProbe.active -= 1;
    const reply = refinementProbe.removeMarkers
      ? input.strictReply.reply.replace(/\[\[A2C_SCRIPT_PART_\d+\]\]\s*/g, "")
      : input.strictReply.reply;
    return {
      reply,
      naturalized: { reply, used: false },
      languageGuard: {
        reply,
        targetLanguage: input.strictReply.language,
        status: "matched",
        attempts: 0,
        fallbackUsed: false
      },
      duplicateAvoided: false,
      variantApplied: false
    };
  })
}));

import { sendStrictFlowTextOutbound } from "../src/services/strictFlowTextOutbound.js";

describe("strict flow multipart outbound", () => {
  it("refines configured reply parts exactly once and in sequence", async () => {
    refinementProbe.active = 0;
    refinementProbe.calls = 0;
    refinementProbe.maxActive = 0;
    refinementProbe.removeMarkers = false;

    const config = loadConfig({
      DATABASE_URL: ":memory:",
      A2C_BASE_URL: "https://a2c.test",
      A2C_APP_ID: "app",
      A2C_APP_SECRET: "secret"
    });
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("分段话术商户");
    const country = repos.createMerchantCountry(merchant.id, {
      name: "巴西",
      defaultLanguage: "pt-BR",
      requirePlatformAccount: true,
      requirePhone: true,
      requireTelegram: true
    });
    repos.syncMerchantA2CAccounts(merchant.id, [{ apiPhone: "agent-parts", verifiedName: "客服号" }]);
    const conversation = repos.getOrCreateConversation("customer-parts", "agent-parts", "客户", merchant.id, country.id);
    const replyParts = ["介绍一", "介绍二", "介绍三"];
    const strictReply: StrictFlowReply = {
      enabled: true,
      reply: replyParts.join("\n\n"),
      replyParts,
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
      customerText: "yes",
      history: [],
      agentProfile: repos.getMerchantAgentProfile(merchant.id),
      data: {
        messageId: "multipart-inbound",
        content: "yes",
        from: "customer-parts",
        to: "agent-parts",
        msgType: "text",
        timestamp: 1783010000
      },
      payloadId: "multipart-payload",
      simulation: true,
      strictFlowEnabled: true,
      learnedIntent: null,
      country
    });

    expect(result.outbounds).toHaveLength(3);
    const outboundMessages = repos
      .listConversationMessages(conversation.id, 20)
      .filter((item) => item.direction === "outbound");
    expect(outboundMessages.map((item) => item.content)).toEqual(replyParts);
    expect(refinementProbe.calls).toBe(1);
    expect(refinementProbe.maxActive).toBe(1);
  });
});
