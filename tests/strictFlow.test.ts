import { describe, expect, it } from "vitest";
import { analyzeMessage } from "../src/domain/analyzer.js";
import { buildStrictFlowReply, strictFlowNeedsInviteCode } from "../src/domain/strictFlow.js";
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
  });

  it("asks for the registered phone if Telegram is provided before phone", () => {
    const result = reply("meu telegram @cliente_123", { language: "pt-BR", flowStep: "collect_telegram" });
    expect(result.nextFlowStep).toBe("collect_telegram");
    expect(result.stage).toBe("need_phone_or_tg");
    expect(result.reply).toContain("telefone");
  });
});
