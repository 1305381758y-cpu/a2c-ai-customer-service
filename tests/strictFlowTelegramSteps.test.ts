import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { analyzeMessage } from "../src/domain/analyzer.js";
import { buildRuleContextualIntent } from "../src/domain/strictFlow.js";
import {
  asksTelegramVerificationCodeProblem,
  asksVerificationCodeProblem,
  isContextualPositive,
  isPositive
} from "../src/domain/strictFlowPredicates.js";
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
  it("does not confuse a missing invitation code with a Telegram verification code", () => {
    expect(asksVerificationCodeProblem("Nao recebi o codigo de convite")).toBe(false);
    expect(asksTelegramVerificationCodeProblem("Nao recebi o codigo de convite")).toBe(false);
    expect(asksTelegramVerificationCodeProblem("Nao recebi o codigo")).toBe(true);
  });

  it.each([
    "手机下载 Telegram 后，注册时一直收不到验证码",
    "Nao recebi o codigo de verificacao no celular",
    "Nao recebi o codigo",
    "No me llega el codigo de verificacion al telefono",
    "I still have not received the verification code on my phone"
  ])("hands off when Telegram phone registration cannot receive the verification code: %s", (customerText) => {
    const result = reply(customerText, "telegram_download");

    expect(result.nextFlowStep).toBe("human_handoff");
    expect(result.stage).toBe("ready_for_handoff");
    expect(result.handoffReason).toBe("客户注册 Telegram 时手机收不到验证码");
    expect(result.reply).toContain("稍等");
    expect(result.reply).toContain("公司核实");
    expect(result.reply).not.toContain("截图");
  });

  it("guides customers without Telegram to download it", () => {
    const result = reply("我没有", "telegram_confirm");

    expect(result.nextFlowStep).toBe("telegram_download");
    expect(result.stage).toBe("need_tg_register");
    expect(result.reply).toContain("Telegram");
    expect(result.reply).toMatch(/应用商店|Play Store|App Store/);
  });

  it("understands a bare Portuguese no after asking whether Telegram is installed", () => {
    const result = reply("Não", "telegram_confirm");

    expect(result.nextFlowStep).toBe("telegram_download");
    expect(result.stage).toBe("need_tg_register");
    expect(result.reply).not.toContain("https://t.me/teacher");
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

  it("understands tenho as Telegram being available in the confirmation context", () => {
    const result = reply("Tenho", "telegram_confirm");

    expect(result.nextFlowStep).toBe("human_handoff");
    expect(result.reply).toContain("https://t.me/teacher");
  });

  it("keeps an acknowledgement in the Telegram download step without sending the teacher link", () => {
    const result = reply("Ok", "telegram_download");

    expect(result.nextFlowStep).toBe("telegram_download");
    expect(result.reply).not.toContain("https://t.me/teacher");
  });

  it("answers why Telegram is needed without sending the tutor link or handing off", () => {
    const result = reply("为什么要用Telegram", "telegram_confirm");

    expect(result.nextFlowStep).toBe("telegram_confirm");
    expect(result.stage).toBe("need_tg_register");
    expect(result.reply).not.toContain("https://t.me/teacher");
    expect(result.reply).not.toContain("500 到 2800 BOB");
    expect(result.reply).toMatch(/Telegram/);
  });

  it("answers repeated trust questions while staying in the current Telegram node", () => {
    const result = reply("Telegram不是骗人的软件吗？", "telegram_confirm");

    expect(result.nextFlowStep).toBe("telegram_confirm");
    expect(result.stage).toBe("need_tg_register");
    expect(result.reply).toMatch(/规则|页面|转账|充值|Telegram/);
    expect(result.reply).not.toContain("https://t.me/teacher");
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
