import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { analyzeMessage } from "../src/domain/analyzer.js";
import { buildRuleContextualIntent } from "../src/domain/strictFlow.js";
import { buildWaitRegistrationReply } from "../src/domain/strictFlowWaitRegistration.js";
import { isNegativeTelegramAnswer } from "../src/domain/strictFlowTelegram.js";
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

function reply(text: string, overrides: Partial<Conversation> = {}) {
  const conv = conversation(overrides);
  const analysis = analyzeMessage(text, conv.language);
  const contextualIntent = buildRuleContextualIntent({
    conversation: conv,
    analysis,
    customerText: text
  });
  return buildWaitRegistrationReply({
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
    step: "wait_registration",
    text,
    contextualLabel: contextualIntent.intent,
    negativeTelegram: isNegativeTelegramAnswer(contextualIntent.intent, text),
    asksLink: false,
    inferredIntent: "unknown"
  });
}

describe("strict flow wait-registration step", () => {
  it("resends complete registration instructions when the customer asks for help", () => {
    const result = reply("我不会注册呀");

    expect(result.nextFlowStep).toBe("wait_registration");
    expect(result.needsInviteCode).toBe(true);
    expect(result.reply).toContain("https://register.example/?code=INV-001");
    expect(result.reply).toContain("邀请码：INV-001");
    expect(result.reply).toContain("注册步骤");
  });

  it("handles link-load failures without leaving the registration step", () => {
    const result = reply("链接打不开，无法加载内容");

    expect(result.nextFlowStep).toBe("wait_registration");
    expect(result.needsInviteCode).toBe(false);
    expect(result.reply).toMatch(/Chrome|Safari/);
    expect(result.reply).not.toContain("邀请码");
  });

  it("moves to Telegram confirmation only after a complete registered phone is present", () => {
    const result = reply("918273718271 注册好了");

    expect(result.nextFlowStep).toBe("telegram_confirm");
    expect(result.stage).toBe("need_tg_register");
    expect(result.reply).toContain("Telegram");
  });

  it("moves to Telegram confirmation when the phone is embedded in the completion message", () => {
    const result = reply("好的，打开了，我已经注册完毕了78567876");

    expect(result.nextFlowStep).toBe("telegram_confirm");
    expect(result.stage).toBe("need_tg_register");
    expect(result.reply).toContain("Telegram");
    expect(result.reply).not.toContain("请将您注册时使用的电话号码");
  });
});
