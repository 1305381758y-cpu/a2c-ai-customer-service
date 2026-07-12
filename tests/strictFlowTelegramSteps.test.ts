import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { analyzeMessage } from "../src/domain/analyzer.js";
import { buildRuleContextualIntent } from "../src/domain/strictFlow.js";
import { isContextualPositive, isPositive } from "../src/domain/strictFlowPredicates.js";
import { buildTelegramStepReply } from "../src/domain/strictFlowTelegramSteps.js";
import { isNegativeTelegramAnswer } from "../src/domain/strictFlowTelegram.js";
import type { Conversation, MerchantCountryRecord, MerchantRecord } from "../src/repositories.js";

const merchant: MerchantRecord = { id: "merchant-1", name: "严格流程商户", status: "active" };
const country: MerchantCountryRecord = {
  id: "country-1",
  merchantId: "merchant-1",
  code: "BR",
  name: "巴西",
  defaultLanguage: "zh",
  platformRegisterUrl: "https://register.example",
  tgRegisterGuideUrl: "https://t.me/teacher",
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
  A2C_APP_SECRET: "secret"
});

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
    stage: "need_tg_register",
    flowStep,
    extractedPhone: "918273718271",
    extractedTelegram: "",
    extractedWhatsApp: "",
    status: "active",
    handoffStatus: "pending",
    handoffNotified: 0,
    unreadCount: 0,
    ...overrides
  };
}

function reply(text: string, flowStep: "telegram_confirm" | "telegram_download" | "collect_telegram") {
  const conv = conversation(flowStep);
  const analysis = analyzeMessage(text, conv.language);
  const contextualIntent = buildRuleContextualIntent({
    conversation: conv,
    analysis,
    customerText: text
  });
  return buildTelegramStepReply({
    merchant,
    country,
    conversation: conv,
    analysis,
    customerText: text,
    config,
    strictFlowEnabled: true,
    contextualIntent
  }, {
    language: "zh",
    step: flowStep,
    text,
    contextualLabel: contextualIntent.intent,
    negativeTelegram: isNegativeTelegramAnswer(contextualIntent.intent, text),
    positive: isContextualPositive(flowStep, contextualIntent.intent) || isPositive(text, analysis.intent, "unknown"),
    inferredIntent: "unknown"
  });
}

describe("strict flow Telegram steps", () => {
  it("guides customers without Telegram to download it", () => {
    const result = reply("我没有", "telegram_confirm");

    expect(result.nextFlowStep).toBe("telegram_download");
    expect(result.stage).toBe("need_tg_register");
    expect(result.reply).toContain("Telegram");
    expect(result.reply).toMatch(/应用商店|Play Store|App Store/);
  });

  it("sends the teacher Telegram link when the customer has installed Telegram", () => {
    const result = reply("装好了", "telegram_download");

    expect(result.nextFlowStep).toBe("human_handoff");
    expect(result.stage).toBe("ready_for_handoff");
    expect(result.reply).toContain("https://t.me/teacher");
    expect(result.reply).toContain("500 到 2800 BOB");
  });

  it("sends the teacher Telegram link when the customer already has Telegram", () => {
    const result = reply("有", "telegram_confirm");

    expect(result.nextFlowStep).toBe("human_handoff");
    expect(result.stage).toBe("ready_for_handoff");
    expect(result.reply).toContain("https://t.me/teacher");
  });

  it("sends the teacher link after a customer submits an @ Telegram username", () => {
    const result = reply("@telegram888", "collect_telegram");

    expect(result.nextFlowStep).toBe("human_handoff");
    expect(result.stage).toBe("ready_for_handoff");
    expect(result.reply).toContain("https://t.me/teacher");
    expect(result.reply).toMatch(/点击|联系导师|主动联系/);
    expect(result.reply).not.toMatch(/我加您|加你/);
  });
});
