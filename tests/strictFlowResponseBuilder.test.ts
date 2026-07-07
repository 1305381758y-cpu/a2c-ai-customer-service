import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { analyzeMessage } from "../src/domain/analyzer.js";
import { buildStrictFlowResponse, normalizeReplyLanguage } from "../src/domain/strictFlowResponseBuilder.js";
import type { A2CInviteCodeRecord, Conversation, MerchantCountryRecord, MerchantRecord } from "../src/repositories.js";

const merchant: MerchantRecord = { id: "merchant-1", name: "测试商户", status: "active" };
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
  REGISTRATION_TUTORIAL_IMAGE_URL: "https://cdn.example/tutorial.jpg"
});
const inviteCode: A2CInviteCodeRecord = {
  id: 1,
  merchantId: "merchant-1",
  countryId: "country-1",
  countryCode: "BR",
  countryName: "巴西",
  a2cAccountId: 1,
  a2cAccountPhone: "agent-1",
  code: "INV-1",
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
    flowStep: "wait_registration",
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

describe("strict flow response builder", () => {
  it("normalizes reply language using detected, previous, default, then Portuguese fallback", () => {
    expect(normalizeReplyLanguage("es", "zh", "pt-BR")).toBe("es");
    expect(normalizeReplyLanguage("unknown", "zh", "pt-BR")).toBe("zh");
    expect(normalizeReplyLanguage("unknown", "unknown", "es")).toBe("es");
    expect(normalizeReplyLanguage("unknown", "unknown", "unknown")).toBe("pt-BR");
  });

  it("cleans customer-visible implementation terms and replaces low-information replies", () => {
    const analysis = analyzeMessage("好的", "zh");
    const result = buildStrictFlowResponse({
      merchant,
      country,
      conversation: conversation({ flowStep: "registration_intent" }),
      analysis,
      customerText: "好的",
      config,
      strictFlowEnabled: true
    }, "zh", "wait_registration", "need_platform_register", "好的，我继续协助您");

    expect(result.reply).toContain("注册");
    expect(result.reply).not.toContain("好的，我继续协助您");
    expect(result.reply).not.toContain("AI");
    expect(result.controlledQuestionType).toBe("none");
  });

  it("marks registration tutorial images only for registration help in the wait-registration step", () => {
    const analysis = analyzeMessage("我不会注册呀", "zh");
    const result = buildStrictFlowResponse({
      merchant,
      country,
      conversation: conversation(),
      analysis,
      customerText: "我不会注册呀",
      config,
      inviteCode,
      strictFlowEnabled: true
    }, "zh", "wait_registration", "need_platform_register", "可以，我把注册步骤给您列清楚。", true);

    expect(result.tutorialImageRequested).toBe(true);
    expect(result.needsInviteCode).toBe(true);
  });

  it("does not request tutorial images when the invite code is missing", () => {
    const analysis = analyzeMessage("我不会注册呀", "zh");
    const result = buildStrictFlowResponse({
      merchant,
      country,
      conversation: conversation(),
      analysis,
      customerText: "我不会注册呀",
      config,
      strictFlowEnabled: true
    }, "zh", "wait_registration", "need_platform_register", "注册需要邀请码。我这边正在确认您的专属邀请码，请稍等。", true);

    expect(result.tutorialImageRequested).toBe(false);
    expect(result.needsInviteCode).toBe(true);
    expect(result.fallback).toBe(true);
  });
});
