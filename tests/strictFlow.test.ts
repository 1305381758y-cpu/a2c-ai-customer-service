import { describe, expect, it } from "vitest";
import { analyzeMessage } from "../src/domain/analyzer.js";
import { buildStrictFlowReply, resolveEffectiveStrictFlowStep, strictFlowNeedsInviteCode, type StrictFlowReply } from "../src/domain/strictFlow.js";
import { shouldBypassStrictFlowForNaturalReply, suppressRegistrationDetailsForNonLinkStep } from "../src/services/webhookProcessor.js";
import type { AppConfig } from "../src/config.js";
import type { A2CInviteCodeRecord, Conversation, ConversationMessageRecord, MerchantCountryRecord, MerchantRecord } from "../src/repositories.js";

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

function simulateStrictFlow(inputs: string[]) {
  const conv = conversation({ language: "unknown" });
  const turns: Array<{ input: string; analysis: ReturnType<typeof analyzeMessage>; result: StrictFlowReply | { reply: string; final: true }; flowStep: string; stage: string }> = [];

  for (const inputText of inputs) {
    const analysis = analyzeMessage(inputText, conv.language);
    if (analysis.phone) conv.extractedPhone = analysis.phone;
    if (analysis.telegram) conv.extractedTelegram = analysis.telegram;
    if (analysis.whatsapp) conv.extractedWhatsApp = analysis.whatsapp;
    conv.language = analysis.language && analysis.language !== "unknown" ? analysis.language : conv.language;

    if (conv.extractedPhone && conv.extractedTelegram) {
      conv.stage = "ready_for_handoff";
      conv.flowStep = "human_handoff";
      conv.status = "human_handoff";
      turns.push({
        input: inputText,
        analysis,
        result: { reply: "我们正在核实，请稍后。", final: true },
        flowStep: conv.flowStep,
        stage: conv.stage
      });
      break;
    }

    const result = buildStrictFlowReply({
      merchant,
      country,
      conversation: conv,
      analysis,
      customerText: inputText,
      inviteCode,
      config
    });
    conv.language = result.language;
    conv.stage = result.stage;
    conv.flowStep = result.nextFlowStep;
    turns.push({ input: inputText, analysis, result, flowStep: conv.flowStep, stage: conv.stage });
  }

  return turns;
}

function outboundMessage(content: string, strictFlowStep = ""): ConversationMessageRecord {
  return {
    id: 1,
    direction: "outbound",
    content,
    msgType: "text",
    language: "zh",
    intent: "unknown",
    rawPayload: strictFlowStep ? { strictFlow: true, strictFlowStep } : {},
    createdAt: "2026-06-16T00:00:00.000Z"
  };
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

  it("keeps natural customer questions inside the strict flow", () => {
    expect(shouldBypassStrictFlowForNaturalReply("你只会这一句话吗", conversation({ flowStep: "interest_screening" }))).toBe(false);
    expect(shouldBypassStrictFlowForNaturalReply("你好", conversation({ flowStep: "wait_registration" }))).toBe(false);
    expect(shouldBypassStrictFlowForNaturalReply("Good morning", conversation({ flowStep: "wait_registration" }))).toBe(false);
    expect(shouldBypassStrictFlowForNaturalReply("你好，我想找一份工作", conversation({ flowStep: "interest_screening" }))).toBe(false);
    expect(shouldBypassStrictFlowForNaturalReply("你好", conversation())).toBe(false);
  });

  it("answers naturally before gently returning to the current step", () => {
    const chat = reply("可以聊天吗", { language: "zh", flowStep: "wait_registration" });
    expect(chat.reply).toContain("可以");
    expect(chat.reply).not.toContain("完成平台开户");
    expect(chat.reply).toContain("已经注册完成");
    expect(chat.nextFlowStep).toBe("wait_registration");

    const complaint = reply("为什么会这样？", { language: "zh", flowStep: "wait_registration" });
    expect(complaint.reply).toContain("抱歉");
    expect(complaint.reply).not.toContain("完成平台开户");
    expect(complaint.reply).toContain("准备继续时告诉我");
    expect(complaint.nextFlowStep).toBe("wait_registration");

    const platform = reply("什么平台", { language: "zh", flowStep: "wait_registration" });
    expect(platform.reply).toContain("兼职在线工作");
    expect(platform.reply).not.toContain("邀请码");
    expect(platform.reply).toContain("已经注册完成");
    expect(platform.nextFlowStep).toBe("wait_registration");
  });

  it("reintroduces the job instead of pushing registration when the customer asks about the job again", () => {
    const result = reply("我想了解这份工作", { language: "zh", flowStep: "wait_registration" });
    expect(result.reply).toContain("简单介绍");
    expect(result.reply).toContain("兼职在线工作");
    expect(result.reply).not.toContain("完成平台开户");
    expect(result.reply).toContain("准备继续时告诉我");
    expect(result.nextFlowStep).toBe("wait_registration");
  });

  it("does not repeat the registration link for a greeting after the link step", () => {
    const result = reply("你好", { language: "zh", flowStep: "wait_registration" });
    expect(result.reply).toContain("您好，我在的");
    expect(result.reply).toContain("如果已经注册完成");
    expect(result.reply).not.toContain("register.example");
    expect(result.reply).not.toContain("邀请码");
    expect(result.nextFlowStep).toBe("wait_registration");
  });

  it("simulates a complete natural conversation from greeting to handoff", () => {
    const turns = simulateStrictFlow([
      "你好",
      "什么平台",
      "我想了解这份工作",
      "可以，发我注册链接和邀请码",
      "注册好了，手机号 99228822881",
      "我没有 Telegram",
      "怎么注册 Telegram",
      "我的 Telegram 是 @flowuser_123"
    ]);

    const replies = turns.map((turn) => turn.result.reply);
    expect(turns.at(0)?.analysis.intent).toBe("greeting");
    expect(replies[0]).toContain("兼职在线工作");
    expect(replies[0]).not.toContain("register.example");

    expect(replies[1]).toContain("开户注册平台");
    expect(replies[1]).not.toContain("邀请码");

    expect(replies[2]).toContain("每天可以赚取");
    expect(replies[2]).toContain("如果您觉得可以继续");

    const linkReplies = replies.filter((item) => item.includes("register.example"));
    expect(linkReplies).toHaveLength(1);
    expect(linkReplies[0]).toContain("ABC123");
    expect(linkReplies[0]).toContain("https://register.example/?code=ABC123");

    expect(replies[4]).toContain("Telegram");
    expect(replies[4]).not.toContain("register.example");
    expect(replies[5]).toContain("Telegram");
    expect(replies[5]).not.toContain("WhatsApp");
    expect(replies[5]).not.toContain("register.example");
    expect(replies[6]).toContain("协助");
    expect(replies[6]).toContain("@");
    expect(replies[6]).not.toContain("register.example");

    expect(turns.at(-1)?.stage).toBe("ready_for_handoff");
    expect(replies.at(-1)).toBe("我们正在核实，请稍后。");

    for (let index = 1; index < replies.length; index += 1) {
      expect(replies[index]).not.toBe(replies[index - 1]);
    }
  });

  it("does not stall after a short positive confirmation", () => {
    const turns = simulateStrictFlow(["你好", "是的"]);
    expect(turns).toHaveLength(2);
    expect(turns[0].flowStep).toBe("interest_screening");
    expect(turns[1].analysis.intent).not.toBe("irrelevant_or_spam");
    expect(turns[1].flowStep).toBe("registration_intent");
    expect(turns[1].result.reply).toContain("简单介绍");
    expect(turns[1].result.reply).toContain("如果您觉得可以继续");
    expect(turns[1].result.reply).not.toBe("好的，我继续协助您。");
  });

  it("continues to the registration link after greeting, positive confirmation, and another short confirmation", () => {
    const turns = simulateStrictFlow(["你好", "是的", "好的"]);
    const replies = turns.map((turn) => turn.result.reply);
    expect(turns[0].flowStep).toBe("interest_screening");
    expect(turns[1].flowStep).toBe("registration_intent");
    expect(turns[2].flowStep).toBe("wait_registration");
    expect(replies[1]).toContain("简单介绍");
    expect(replies[2]).toContain("https://register.example/?code=ABC123");
    expect(replies[2]).toContain("邀请码");
    expect(replies[1]).not.toBe("好的，我继续协助您。");
    expect(replies[2]).not.toBe("好的，我继续协助您。");
  });

  it("recovers the flow step from the previous strict-flow reply when old conversations have no stored flow step", () => {
    const recoveredStep = resolveEffectiveStrictFlowStep(
      conversation({ flowStep: "", stage: "need_platform_register" }),
      [outboundMessage("您好！您是否正在寻找可以在线完成的工作，以获得额外收入呢？")]
    );
    expect(recoveredStep).toBe("interest_screening");

    const conv = conversation({ language: "zh", flowStep: recoveredStep });
    const analysis = analyzeMessage("是的", conv.language);
    const result = buildStrictFlowReply({
      merchant,
      country,
      conversation: conv,
      analysis,
      customerText: "是的",
      inviteCode,
      config
    });

    expect(result.nextFlowStep).toBe("registration_intent");
    expect(result.reply).toContain("简单介绍");
    expect(result.reply).toContain("如果您觉得可以继续");
    expect(result.reply).not.toBe("好的，我继续协助您。");
  });

  it("prefers a later previous strict-flow step over stale stored flow data", () => {
    const recoveredStep = resolveEffectiveStrictFlowStep(
      conversation({ flowStep: "interest_screening", stage: "need_platform_register" }),
      [outboundMessage("好的，现在我会把链接和邀请码发给您。\n开户链接：https://register.example/?code=ABC123\n邀请码：ABC123", "wait_registration")]
    );
    expect(recoveredStep).toBe("wait_registration");
  });

  it("runs the requested short-confirmation path through registration and Telegram", () => {
    const turns = simulateStrictFlow([
      "你好",
      "是的",
      "可以注册",
      "注册好了，手机号 99228822881",
      "没有 Telegram",
      "怎么注册",
      "@customer_123"
    ]);
    const replies = turns.map((turn) => turn.result.reply);
    expect(turns[1].flowStep).toBe("registration_intent");
    expect(turns[2].flowStep).toBe("wait_registration");
    expect(replies[2]).toContain("https://register.example/?code=ABC123");
    expect(replies[2]).toContain("ABC123");
    expect(turns[3].flowStep).toBe("telegram_confirm");
    expect(turns[4].flowStep).toBe("telegram_download");
    expect(replies[4]).toContain("Telegram");
    expect(replies[4]).not.toContain("WhatsApp");
    expect(turns[5].flowStep).toBe("collect_telegram");
    expect(replies[5]).toContain("@");
    expect(turns.at(-1)?.stage).toBe("ready_for_handoff");
    expect(replies.at(-1)).toBe("我们正在核实，请稍后。");
  });

  it("uses inferred strict-flow intent when rule-based intent is ambiguous", () => {
    const ambiguous = analyzeMessage("mn");
    expect(ambiguous.intent).toBe("irrelevant_or_spam");

    const positive = buildStrictFlowReply({
      merchant,
      country,
      conversation: conversation({ language: "zh", flowStep: "interest_screening" }),
      analysis: ambiguous,
      customerText: "mn",
      inviteCode,
      config,
      inferredIntent: "positive_confirmation"
    });
    expect(positive.nextFlowStep).toBe("registration_intent");
    expect(positive.reply).toContain("briefly introduce");

    const linkConversation = conversation({ language: "zh", flowStep: "wait_registration" });
    expect(strictFlowNeedsInviteCode({
      merchant,
      country,
      conversation: linkConversation,
      analysis: ambiguous,
      customerText: "mn",
      inferredIntent: "ask_link"
    })).toBe(true);
  });

  it("continues proactively after help requests but pauses on explicit refusal", () => {
    const help = reply("我不会操作，你帮我", { language: "zh", flowStep: "wait_registration" });
    expect(help.reply).toContain("带您处理注册步骤");
    expect(help.reply).toContain("如果已经注册完成");
    expect(help.reply).not.toContain("register.example");
    expect(help.nextFlowStep).toBe("wait_registration");

    const telegramHelp = reply("怎么下载", { language: "zh", flowStep: "telegram_download", extractedPhone: "99228822881" });
    expect(telegramHelp.reply).toContain("协助您处理 Telegram");
    expect(telegramHelp.reply).toContain("@");
    expect(telegramHelp.reply).not.toContain("WhatsApp");

    const refusal = reply("不需要了，别发了", { language: "zh", flowStep: "wait_registration" });
    expect(refusal.reply).toContain("先不继续打扰");
    expect(refusal.reply).not.toContain("注册完成");
    expect(refusal.reply).not.toContain("register.example");
    expect(refusal.nextFlowStep).toBe("wait_registration");
  });
});
