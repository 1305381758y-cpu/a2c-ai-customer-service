import { describe, expect, it } from "vitest";
import type { AppConfig } from "../src/config.js";
import { registerInstruction, registrationStartInstruction, strictFlowNeedsInviteCode } from "../src/domain/strictFlow.js";
import { analyzeMessage } from "../src/domain/analyzer.js";
import type { A2CInviteCodeRecord, Conversation, MerchantCountryRecord, MerchantRecord } from "../src/repositories.js";
import type { StrictFlowInput } from "../src/domain/strictFlowTypes.js";

const merchant: MerchantRecord = { id: "aston", name: "阿斯顿", status: "active" };
const country: MerchantCountryRecord = {
  id: "country-br",
  merchantId: "aston",
  code: "BR",
  name: "巴西",
  defaultLanguage: "zh",
  platformRegisterUrl: "https://register.example/?code={code}",
  tgRegisterGuideUrl: "",
  requirePlatformAccount: true,
  requirePhone: true,
  requireTelegram: true,
  requireWhatsApp: false,
  status: "active"
};
const conversation: Conversation = {
  id: "conversation-1",
  merchantId: "aston",
  countryId: "country-br",
  countryCode: "BR",
  countryName: "巴西",
  customerPhone: "customer-1",
  a2cAccountPhone: "agent-1",
  nickname: "客户",
  language: "zh",
  stage: "need_platform_register",
  flowStep: "registration_intent",
  extractedPhone: "",
  extractedTelegram: "",
  extractedWhatsApp: "",
  status: "active",
  handoffStatus: "pending",
  handoffNotified: 0,
  unreadCount: 0
};
const inviteCode: A2CInviteCodeRecord = {
  id: 1,
  merchantId: "aston",
  countryId: "country-br",
  countryCode: "BR",
  countryName: "巴西",
  a2cAccountId: 1,
  a2cAccountPhone: "agent-1",
  code: "ABC123",
  registerUrl: "https://register.example/?code={code}",
  status: "reserved",
  assignedCustomerKey: "customer-1",
  assignedConversationId: "conversation-1",
  platformAccount: "",
  assignedAt: "",
  usedAt: "",
  createdAt: "",
  updatedAt: ""
};

function input(overrides: Partial<StrictFlowInput> = {}): StrictFlowInput {
  const customerText = overrides.customerText ?? "可以开始注册";
  return {
    merchant,
    country,
    conversation,
    config: {
      PLATFORM_REGISTER_URL: "https://fallback.example",
      REGISTRATION_TUTORIAL_IMAGE_URL: ""
    } as AppConfig,
    analysis: analyzeMessage(customerText, "zh"),
    customerText,
    inviteCode,
    inferredIntent: "unknown",
    strictFlowEnabled: true,
    ...overrides
  };
}

describe("strict flow registration policy", () => {
  it("keeps registration link and invite text generation behind a dedicated module", () => {
    const text = registerInstruction(input(), "zh");

    expect(text).toContain("https://register.example/?code=ABC123");
    expect(text).toContain("邀请码：ABC123");
    expect(text).toContain("注册步骤");
  });

  it("adds first-step guidance when the customer is ready to start", () => {
    const text = registrationStartInstruction(input(), "zh");

    expect(text).toContain("先从第一步开始");
    expect(text).toContain("https://register.example/?code=ABC123");
  });

  it("does not request invite codes before the registration step", () => {
    const early = input({
      customerText: "你好",
      conversation: { ...conversation, flowStep: "interest_screening" },
      analysis: analyzeMessage("你好", "zh")
    });

    expect(strictFlowNeedsInviteCode(early)).toBe(false);
    expect(strictFlowNeedsInviteCode(input({
      customerText: "请发注册链接和邀请码",
      analysis: analyzeMessage("请发注册链接和邀请码", "zh")
    }))).toBe(true);
  });
});
