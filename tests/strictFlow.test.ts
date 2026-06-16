import { describe, expect, it } from "vitest";
import { analyzeMessage } from "../src/domain/analyzer.js";
import { buildStrictFlowReply, strictFlowNeedsInviteCode } from "../src/domain/strictFlow.js";
import { shouldBypassStrictFlowForNaturalReply, suppressRegistrationDetailsForNonLinkStep } from "../src/services/webhookProcessor.js";
import type { AppConfig } from "../src/config.js";
import type { A2CInviteCodeRecord, Conversation, MerchantCountryRecord, MerchantRecord } from "../src/repositories.js";

const merchant: MerchantRecord = { id: "aston", name: "阿斯顿", status: "active" };
const country: MerchantCountryRecord = {
  id: "aston:br",
  merchantId: "aston",
  code: "BR",
  name: "巴西",
  defaultLanguage: "pt-BR",
  platformRegisterUrl: "https://register.example/?code={code}",
  tgRegisterGuideUrl: "",
  requirePlatformAccount: true,
  requirePhone: true,
  requireTelegram: true,
  requireWhatsApp: false,
  status: "active"
};
const defaultCountry: MerchantCountryRecord = {
  ...country,
  id: "aston:default",
  code: "default",
  name: "默认国家",
  defaultLanguage: "zh"
};
const config = {
  PLATFORM_REGISTER_URL: "https://fallback.example",
  TG_REGISTER_GUIDE_URL: ""
} as AppConfig;
const inviteCode: A2CInviteCodeRecord = {
  id: 1,
  merchantId: "aston",
  countryId: "aston:br",
  countryCode: "BR",
  countryName: "巴西",
  a2cAccountId: 1,
  a2cAccountPhone: "18507251675",
  code: "ABC123",
  registerUrl: "https://register.example/?code={code}",
  status: "reserved",
  assignedCustomerKey: "5511913586749",
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
    merchantId: "aston",
    countryId: "aston:br",
    countryCode: "BR",
    countryName: "巴西",
    customerPhone: "5511913586749",
    a2cAccountPhone: "18507251675",
    nickname: "",
    language: "unknown",
    stage: "need_platform_register",
    flowStep: "",
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
  const analysis = analyzeMessage(text, overrides.language ?? "unknown");
  return buildStrictFlowReply({
    merchant,
    country,
    conversation: conversation(overrides),
    analysis,
    customerText: text,
    inviteCode,
    config
  });
}

describe("strict Aston Brazil flow", () => {
  it("starts with interest screening instead of sending the registration link", () => {
    const result = reply("olá");
    expect(result.enabled).toBe(true);
    expect(result.nextFlowStep).toBe("interest_screening");
    expect(result.reply).toContain("trabalho online de meio período");
    expect(result.reply).not.toContain("register.example");
  });

  it("keeps Aston on the strict script when the market is still the default country", () => {
    const analysis = analyzeMessage("你好");
    const result = buildStrictFlowReply({
      merchant,
      country: defaultCountry,
      conversation: conversation({ countryId: defaultCountry.id, countryCode: defaultCountry.code, countryName: defaultCountry.name }),
      analysis,
      customerText: "你好",
      inviteCode,
      config
    });

    expect(result.enabled).toBe(true);
    expect(result.nextFlowStep).toBe("interest_screening");
    expect(result.reply).toContain("兼职在线工作");
    expect(result.reply).not.toContain("注册、排查问题");
    expect(result.reply).not.toContain("register.example");
  });

  it("only sends the registration link and invitation code after registration intent", () => {
    const analysis = analyzeMessage("sim");
    const conv = conversation({ language: "pt-BR", flowStep: "registration_intent" });
    expect(strictFlowNeedsInviteCode({ merchant, country, conversation: conv, analysis, customerText: "sim" })).toBe(true);

    const result = buildStrictFlowReply({
      merchant,
      country,
      conversation: conv,
      analysis,
      customerText: "sim",
      inviteCode,
      config
    });

    expect(result.nextFlowStep).toBe("wait_registration");
    expect(result.reply).toContain("https://register.example/?code=ABC123");
    expect(result.reply).toContain("ABC123");
  });

  it("guides Telegram download when the customer says they do not have Telegram", () => {
    const result = reply("não tenho", { language: "pt-BR", flowStep: "telegram_confirm", extractedPhone: "123456789" });
    expect(result.nextFlowStep).toBe("telegram_download");
    expect(result.stage).toBe("need_tg_register");
    expect(result.reply).toContain("Telegram");
    expect(result.reply).not.toContain("WhatsApp");
    expect(result.reply).not.toContain("register.example");
    expect(result.needsInviteCode).toBe(false);
  });

  it("does not reserve or repeat invite codes after the registration link step", () => {
    const analysis = analyzeMessage("99228822881");
    const conv = conversation({ language: "zh", flowStep: "wait_registration" });
    expect(strictFlowNeedsInviteCode({ merchant, country, conversation: conv, analysis, customerText: "99228822881" })).toBe(false);

    const result = buildStrictFlowReply({
      merchant,
      country,
      conversation: conv,
      analysis,
      customerText: "99228822881",
      config
    });

    expect(result.nextFlowStep).toBe("telegram_confirm");
    expect(result.reply).toContain("Telegram");
    expect(result.reply).not.toContain("register.example");
    expect(result.reply).not.toContain("邀请码");
  });

  it("asks for the registered phone if Telegram is provided before phone", () => {
    const result = reply("meu telegram @cliente_123", { language: "pt-BR", flowStep: "collect_telegram" });
    expect(result.nextFlowStep).toBe("collect_telegram");
    expect(result.stage).toBe("need_phone_or_tg");
    expect(result.reply).toContain("telefone");
  });

  it("strips registration links and invite codes from non-link replies", () => {
    const cleaned = suppressRegistrationDetailsForNonLinkStep(
      "您好！请点击此链接完成开户注册：https://www.google.com。注册完成后，请把您的手机号和 Telegram 账号发给我。邀请码：4。",
      { PLATFORM_REGISTER_URL: "https://www.google.com" } as AppConfig,
      { platformRegisterUrl: "https://www.google.com", requireTelegram: true },
      { extractedPhone: "99228822881", extractedTelegram: "" },
      "zh"
    );

    expect(cleaned).toContain("Telegram");
    expect(cleaned).not.toContain("google");
    expect(cleaned).not.toContain("邀请码");
    expect(cleaned).not.toContain("手机号");
  });

  it("keeps non-registration helper links while stripping registration details", () => {
    const cleaned = suppressRegistrationDetailsForNonLinkStep(
      "您可以从 https://telegram.org 下载 Telegram。开户链接和邀请码：https://www.google.com 邀请码：4",
      { PLATFORM_REGISTER_URL: "https://www.google.com" } as AppConfig,
      { platformRegisterUrl: "https://www.google.com", requireTelegram: true },
      { extractedPhone: "99228822881", extractedTelegram: "" },
      "zh"
    );

    expect(cleaned).toContain("telegram.org");
    expect(cleaned).not.toContain("google");
    expect(cleaned).not.toContain("邀请码");
  });

  it("removes empty registration link shells after url stripping", () => {
    const cleaned = suppressRegistrationDetailsForNonLinkStep(
      "好的，请点击这个链接完成开户注册：https://www.google.com。注册完成后，请把您的手机号和 Telegram 账号发给我。",
      { PLATFORM_REGISTER_URL: "https://www.google.com" } as AppConfig,
      { platformRegisterUrl: "https://www.google.com", requireTelegram: true },
      { extractedPhone: "", extractedTelegram: "" },
      "zh"
    );

    expect(cleaned).not.toContain("点击这个链接");
    expect(cleaned).not.toContain("google");
    expect(cleaned).not.toContain("：。");
  });

  it("lets natural replies handle complaints and repeated greetings instead of hard scripting", () => {
    expect(shouldBypassStrictFlowForNaturalReply("你只会这一句话吗", conversation({ flowStep: "interest_screening" }))).toBe(true);
    expect(shouldBypassStrictFlowForNaturalReply("你好", conversation({ flowStep: "wait_registration" }))).toBe(true);
    expect(shouldBypassStrictFlowForNaturalReply("Good morning", conversation({ flowStep: "wait_registration" }))).toBe(true);
    expect(shouldBypassStrictFlowForNaturalReply("你好，我想找一份工作", conversation({ flowStep: "interest_screening" }))).toBe(true);
    expect(shouldBypassStrictFlowForNaturalReply("你好", conversation())).toBe(false);
  });

  it("does not repeat registration reminders when the customer is chatting or complaining", () => {
    const chat = reply("可以聊天吗", { language: "zh", flowStep: "wait_registration" });
    expect(chat.reply).toContain("可以");
    expect(chat.reply).not.toContain("完成平台开户");
    expect(chat.reply).not.toContain("手机号和 Telegram");
    expect(chat.nextFlowStep).toBe("wait_registration");

    const complaint = reply("为什么会这样？", { language: "zh", flowStep: "wait_registration" });
    expect(complaint.reply).toContain("抱歉");
    expect(complaint.reply).not.toContain("完成平台开户");
    expect(complaint.nextFlowStep).toBe("wait_registration");

    const platform = reply("什么平台", { language: "zh", flowStep: "wait_registration" });
    expect(platform.reply).toContain("兼职在线工作");
    expect(platform.reply).not.toContain("邀请码");
    expect(platform.nextFlowStep).toBe("interest_screening");
  });

  it("reintroduces the job instead of pushing registration when the customer asks about the job again", () => {
    const result = reply("我想了解这份工作", { language: "zh", flowStep: "wait_registration" });
    expect(result.reply).toContain("简单介绍");
    expect(result.reply).toContain("兼职在线工作");
    expect(result.reply).not.toContain("完成平台开户");
    expect(result.nextFlowStep).toBe("registration_intent");
  });
});
