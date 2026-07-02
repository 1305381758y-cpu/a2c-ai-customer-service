import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { openDb } from "../src/db.js";
import { analyzeMessage } from "../src/domain/analyzer.js";
import { buildRuleContextualIntent } from "../src/domain/strictFlow.js";
import { Repositories } from "../src/repositories.js";
import { buildStrictFlowTurn } from "../src/services/strictFlowTurnBuilder.js";

function runtimeConfig() {
  return loadConfig({
    DATABASE_URL: ":memory:",
    PLATFORM_REGISTER_URL: "https://fallback.example"
  });
}

function setupConversation(flowStep = "registration_intent") {
  const repos = new Repositories(openDb(":memory:"));
  const merchant = repos.createMerchant("严格流程 Turn 商户");
  const country = repos.createMerchantCountry(merchant.id, {
    name: "巴西",
    defaultLanguage: "zh",
    platformRegisterUrl: "https://register.example",
    requirePlatformAccount: true,
    requirePhone: true,
    requireTelegram: true
  });
  const account = repos.syncMerchantA2CAccounts(merchant.id, [{
    apiPhone: "agent-turn",
    verifiedName: "客服号"
  }])[0];
  repos.createInviteCodeForA2CAccount(account.id, {
    code: "INV-TURN",
    registerUrl: "https://register.example/?code={code}",
    status: "available"
  }, merchant.id);
  const conversation = repos.getOrCreateConversation("customer-turn", "agent-turn", "客户", merchant.id, country.id);
  conversation.language = "zh";
  conversation.stage = "need_platform_register";
  conversation.flowStep = flowStep;
  repos.updateConversation(conversation);
  return { repos, merchant, country, conversation };
}

describe("strict flow turn builder", () => {
  it("reserves an invite code and builds the registration turn when the flow reaches registration", () => {
    const context = setupConversation("registration_intent");
    const analysis = analyzeMessage("是的", "zh");
    const contextualIntent = buildRuleContextualIntent({
      conversation: context.conversation,
      analysis,
      customerText: "是的",
      inferredIntent: "positive_confirmation"
    });

    const result = buildStrictFlowTurn({
      ...context,
      runtimeConfig: runtimeConfig(),
      analysis,
      customerText: "是的",
      strictFlowEnabled: true,
      inferredIntent: "positive_confirmation",
      contextualIntent
    });

    expect(result.needsInviteCode).toBe(true);
    expect(result.inviteCode).toMatchObject({ code: "INV-TURN", status: "reserved" });
    expect(result.strictReply).toMatchObject({
      enabled: true,
      nextFlowStep: "wait_registration",
      needsInviteCode: true
    });
    expect(result.strictReply.reply).toContain("邀请码：INV-TURN");
  });

  it("does not reserve invite codes before the registration step needs them", () => {
    const context = setupConversation("interest_screening");
    const analysis = analyzeMessage("你好", "zh");
    const contextualIntent = buildRuleContextualIntent({
      conversation: context.conversation,
      analysis,
      customerText: "你好",
      inferredIntent: "unknown"
    });

    const result = buildStrictFlowTurn({
      ...context,
      runtimeConfig: runtimeConfig(),
      analysis,
      customerText: "你好",
      strictFlowEnabled: true,
      inferredIntent: "unknown",
      contextualIntent
    });

    expect(result.needsInviteCode).toBe(false);
    expect(result.inviteCode).toBeUndefined();
    expect(result.strictReply.needsInviteCode).toBe(false);
  });
});
