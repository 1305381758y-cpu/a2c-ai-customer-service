import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { analyzeMessage } from "../src/domain/analyzer.js";
import { buildRuleContextualIntent } from "../src/domain/strictFlow.js";
import { defaultStrictFlowRuntime, nextStrictFlowTurn } from "../src/domain/strictFlowRuntime.js";
import type { A2CInviteCodeRecord, Conversation, MerchantCountryRecord, MerchantRecord } from "../src/repositories.js";

const merchant: MerchantRecord = { id: "merchant-1", name: "严格流程商户", status: "active" };
const country: MerchantCountryRecord = {
  id: "country-1",
  merchantId: "merchant-1",
  code: "BR",
  name: "巴西",
  defaultLanguage: "zh",
  platformRegisterUrl: "https://register.example",
  tgRegisterGuideUrl: "",
  requirePlatformAccount: true,
  requirePhone: true,
  requireTelegram: true,
  requireWhatsApp: false,
  status: "active"
};
const config = loadConfig({
  DATABASE_URL: ":memory:",
  A2C_BASE_URL: "https://a2c.test",
  A2C_APP_ID: "app",
  A2C_APP_SECRET: "secret",
  PLATFORM_REGISTER_URL: "https://fallback.example"
});
const inviteCode: A2CInviteCodeRecord = {
  id: 1,
  merchantId: "merchant-1",
  countryId: "country-1",
  countryCode: "BR",
  countryName: "巴西",
  a2cAccountId: 1,
  a2cAccountPhone: "agent-1",
  code: "INV-001",
  registerUrl: "https://register.example/?code={code}",
  status: "reserved",
  assignedCustomerKey: "customer-1",
  assignedConversationId: "conv-1",
  platformAccount: "",
  assignedAt: "",
  usedAt: "",
  createdAt: "",
  updatedAt: ""
};

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "conv-1",
    merchantId: "merchant-1",
    countryId: "country-1",
    countryCode: "BR",
    countryName: "巴西",
    customerPhone: "customer-1",
    a2cAccountPhone: "agent-1",
    nickname: "",
    language: "zh",
    stage: "need_platform_register",
    flowStep: "interest_screening",
    extractedPhone: "",
    extractedTelegram: "",
    extractedWhatsApp: "",
    status: "active",
    handoffStatus: "pending",
    handoffNotified: 0,
    unreadCount: 0,
    ...overrides
  };
}

function nextTurn(text: string, overrides: Partial<Conversation> = {}, withInvite = true) {
  const conv = conversation(overrides);
  const analysis = analyzeMessage(text, conv.language);
  return nextStrictFlowTurn({
    merchant,
    country,
    conversation: conv,
    analysis,
    customerText: text,
    inviteCode: withInvite ? inviteCode : undefined,
    config,
    strictFlowEnabled: true,
    inferredIntent: "unknown",
    contextualIntent: buildRuleContextualIntent({
      conversation: conv,
      analysis,
      customerText: text
    })
  });
}

describe("strict flow runtime", () => {
  it("advances an interested customer to the registration-intent step without sending a link", () => {
    const result = nextTurn("是的", { flowStep: "interest_screening" });

    expect(result.enabled).toBe(true);
    expect(result.nextFlowStep).toBe("registration_intent");
    expect(result.needsInviteCode).toBe(false);
    expect(result.reply).toContain("兼职");
    expect(result.reply).not.toContain("https://register.example");
    expect(result.reply).not.toContain("INV-001");
  });

  it("sends the preserved registration link and invite only after the customer is ready to register", () => {
    const result = nextTurn("方便", { flowStep: "registration_intent" });

    expect(result.nextFlowStep).toBe("wait_registration");
    expect(result.needsInviteCode).toBe(true);
    expect(result.reply).toContain("https://register.example/?code=INV-001");
    expect(result.reply).toContain("邀请码：INV-001");
  });

  it("exposes a default runtime engine for application services", () => {
    const direct = nextTurn("是的", { flowStep: "interest_screening" });
    const viaEngine = defaultStrictFlowRuntime.nextTurn({
      merchant,
      country,
      conversation: conversation({ flowStep: "interest_screening" }),
      analysis: analyzeMessage("是的", "zh"),
      customerText: "是的",
      inviteCode,
      config,
      strictFlowEnabled: true
    });

    expect(viaEngine.nextFlowStep).toBe(direct.nextFlowStep);
    expect(viaEngine.stage).toBe(direct.stage);
    expect(viaEngine.needsInviteCode).toBe(direct.needsInviteCode);
  });
});
