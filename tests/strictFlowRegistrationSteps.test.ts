import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { analyzeMessage } from "../src/domain/analyzer.js";
import { buildRuleContextualIntent } from "../src/domain/strictFlow.js";
import { isContextualPositive, isPositive, asksForInviteOrLink } from "../src/domain/strictFlowPredicates.js";
import { buildRegistrationStepReply } from "../src/domain/strictFlowRegistrationSteps.js";
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

function conversation(flowStep: Conversation["flowStep"], overrides: Partial<Conversation> = {}): Conversation {
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
    flowStep,
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

function reply(text: string, flowStep: "interest_screening" | "project_intro" | "registration_intent" | "send_register_link") {
  const conv = conversation(flowStep);
  const analysis = analyzeMessage(text, conv.language);
  const contextualIntent = buildRuleContextualIntent({
    conversation: conv,
    analysis,
    customerText: text
  });

  return buildRegistrationStepReply({
    merchant,
    country,
    conversation: conv,
    analysis,
    customerText: text,
    inviteCode,
    config,
    strictFlowEnabled: true,
    contextualIntent
  }, {
    language: "zh",
    step: flowStep,
    text,
    contextualLabel: contextualIntent.intent,
    positive: isContextualPositive(flowStep, contextualIntent.intent) || isPositive(text, analysis.intent, "unknown"),
    asksLink: asksForInviteOrLink(text, analysis.intent),
    inferredIntent: "unknown"
  });
}

describe("strict flow registration steps", () => {
  it("moves interested customers from screening to project introduction without sending the invite", () => {
    const result = reply("是的", "interest_screening");

    expect(result.nextFlowStep).toBe("registration_intent");
    expect(result.needsInviteCode).toBe(false);
    expect(result.reply).toMatch(/兼职|工作|收益|佣金/);
    expect(result.reply).not.toContain("邀请码");
  });

  it("sends the registration link and invite only after the customer is ready", () => {
    const result = reply("方便", "registration_intent");

    expect(result.nextFlowStep).toBe("wait_registration");
    expect(result.needsInviteCode).toBe(true);
    expect(result.reply).toContain("https://register.example/?code=INV-001");
    expect(result.reply).toContain("邀请码：INV-001");
    expect(result.reply).toContain("注册步骤");
  });

  it("answers more-info requests without prematurely sending the link", () => {
    const result = reply("你能提供更多信息吗", "registration_intent");

    expect(result.nextFlowStep).toBe("registration_intent");
    expect(result.needsInviteCode).toBe(false);
    expect(result.reply).toMatch(/页面|人工|确认为准|规则/);
    expect(result.reply).not.toContain("邀请码");
  });

  it("does not send the registration link when ok only acknowledges a temporary pause", () => {
    const conv = conversation("registration_intent");
    const text = "ok";
    const analysis = analyzeMessage(text, "pt-BR");
    const contextualIntent = buildRuleContextualIntent({
      conversation: conv,
      analysis,
      customerText: text
    }, [
      { direction: "outbound", content: "Tudo bem, não vou incomodar você agora." },
      { direction: "inbound", content: "暂时没有时间，要等到晚上九点" }
    ]);

    const result = buildRegistrationStepReply({
      merchant,
      country,
      conversation: conv,
      analysis,
      customerText: text,
      inviteCode,
      config,
      strictFlowEnabled: true,
      contextualIntent
    }, {
      language: "pt-BR",
      step: "registration_intent",
      text,
      contextualLabel: contextualIntent.intent,
      positive: true,
      asksLink: false,
      inferredIntent: "unknown"
    });

    expect(result.nextFlowStep).toBe("registration_intent");
    expect(result.needsInviteCode).toBe(false);
    expect(result.reply).toMatch(/21h|9 PM|晚上九点/);
    expect(result.reply).not.toContain("INV-001");
  });
});
