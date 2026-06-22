import { describe, expect, it } from "vitest";
import { analyzeMessage } from "../src/domain/analyzer.js";
import { buildRuleContextualIntent, buildStrictFlowReply, isStrictFlowEnabled, resolveEffectiveStrictFlowStep, strictFlowNeedsInviteCode, type StrictFlowReply } from "../src/domain/strictFlow.js";
import { shouldBypassStrictFlowForNaturalReply, suppressRegistrationDetailsForNonLinkStep } from "../src/services/webhookProcessor.js";
import type { AppConfig } from "../src/config.js";
import type { A2CInviteCodeRecord, Conversation, ConversationMessageRecord, MerchantCountryRecord, MerchantRecord, ScriptFlowRuntime } from "../src/repositories.js";

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

const scriptFlow: ScriptFlowRuntime = {
  flow: {
    id: 1,
    merchantId: "aston",
    countryId: "aston:br",
    countryCode: "BR",
    countryName: "巴西",
    name: "测试话本",
    status: "active",
    active: true,
    version: 1,
    sourceFilename: "",
    stepCount: 2,
    createdAt: "",
    updatedAt: ""
  },
  steps: [
    {
      id: 1,
      flowId: 1,
      merchantId: "aston",
      countryId: "aston:br",
      flowCode: "B",
      flowName: "项目介绍",
      flowStep: "registration_intent",
      goal: "",
      triggerCondition: "",
      customerExpressions: "",
      standardReply: "好的，我来自测试商户。这里是甲方自定义项目介绍，收益由话本填写。您现在有空继续吗？",
      collectInfo: "",
      sendLink: false,
      sendInvite: false,
      nextCondition: "",
      nextFlowCode: "C",
      nextFlowStep: "wait_registration",
      forbidden: "",
      notes: "",
      sortOrder: 1,
      enabled: true,
      createdAt: "",
      updatedAt: ""
    },
    {
      id: 2,
      flowId: 1,
      merchantId: "aston",
      countryId: "aston:br",
      flowCode: "C",
      flowName: "发送链接",
      flowStep: "wait_registration",
      goal: "",
      triggerCondition: "",
      customerExpressions: "",
      standardReply: "请打开 {{REGISTER_URL}}，邀请码是 {{INVITE_CODE}}。注册完成后告诉我。",
      collectInfo: "",
      sendLink: true,
      sendInvite: true,
      nextCondition: "",
      nextFlowCode: "D",
      nextFlowStep: "telegram_confirm",
      forbidden: "",
      notes: "",
      sortOrder: 2,
      enabled: true,
      createdAt: "",
      updatedAt: ""
    }
  ]
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
  const conv = conversation(overrides);
  const contextualIntent = buildRuleContextualIntent({
    conversation: conv,
    analysis,
    customerText: text
  });
  return buildStrictFlowReply({
    merchant,
    country,
    conversation: conv,
    analysis,
    customerText: text,
    inviteCode,
    config,
    contextualIntent
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
      config,
      contextualIntent: buildRuleContextualIntent({
        conversation: conv,
        analysis,
        customerText: inputText
      })
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
  it("enables strict flow for the default merchant on the Brazil registration flow", () => {
    const defaultMerchant: MerchantRecord = { id: "default", name: "默认商户", status: "active" };
    const defaultMerchantCountry: MerchantCountryRecord = {
      ...country,
      id: "default:br",
      merchantId: "default",
      requirePlatformAccount: true,
      requirePhone: true,
      requireTelegram: true,
      requireWhatsApp: false
    };
    expect(isStrictFlowEnabled(defaultMerchant, defaultMerchantCountry, { strictScriptFlowEnabled: false })).toBe(true);
  });

  it("keeps the previous language for short contextual replies", () => {
    expect(analyzeMessage("sim", "pt-BR").language).toBe("pt-BR");
    expect(analyzeMessage("ok", "zh").language).toBe("zh");
    expect(analyzeMessage("no", "pt-BR").language).toBe("pt-BR");
  });

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

  it("uses the active merchant script flow to override strict-flow node wording", () => {
    const first = buildStrictFlowReply({
      merchant,
      country,
      conversation: conversation({ flowStep: "interest_screening", language: "zh" }),
      analysis: analyzeMessage("是的", "zh"),
      customerText: "是的",
      inviteCode,
      config,
      scriptFlow
    });
    expect(first.nextFlowStep).toBe("registration_intent");
    expect(first.reply).toContain("甲方自定义项目介绍");

    const second = buildStrictFlowReply({
      merchant,
      country,
      conversation: conversation({ flowStep: "registration_intent", language: "zh" }),
      analysis: analyzeMessage("有空", "zh"),
      customerText: "有空",
      inviteCode,
      config,
      scriptFlow
    });
    expect(second.nextFlowStep).toBe("wait_registration");
    expect(second.reply).toContain("https://register.example/?code=ABC123");
    expect(second.reply).toContain("ABC123");
  });

  it("moves from interest screening to project intro when the customer asks for an introduction", () => {
    const result = reply("兼职?你介绍下", { language: "zh", flowStep: "interest_screening" });

    expect(result.nextFlowStep).toBe("registration_intent");
    expect(result.reply).toContain("每天可以赚取");
    expect(result.reply).toContain("空闲时间");
    expect(result.reply).not.toContain("您如果感兴趣，我可以先简单介绍");
    expect(result.reply).not.toContain("开户链接");
    expect(result.reply).not.toContain("邀请码");
  });

  it("pauses instead of restarting the flow when the customer refuses", () => {
    const result = reply("我不接受呢", { language: "zh", flowStep: "interest_screening" });

    expect(result.nextFlowStep).toBe("interest_screening");
    expect(result.reply).toContain("不继续打扰");
    expect(result.reply).not.toContain("您是想了解这份兼职在线工作吗");
    expect(result.reply).not.toContain("开户链接");
  });

  it("answers earning concerns naturally without returning to the opener", () => {
    const result = reply("每天能赚300到800? 这么多吗", { language: "zh", flowStep: "registration_intent" });

    expect(result.nextFlowStep).toBe("registration_intent");
    expect(result.reply).toContain("收益");
    expect(result.reply).toContain("平台规则");
    expect(result.reply).toContain("是否有空");
    expect(result.reply).not.toContain("您好，您是想了解这份兼职在线工作吗");
    expect(result.reply).not.toContain("开户链接");
    expect(result.reply).not.toContain("邀请码");
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
    expect(result.reply).toContain("恭喜");
    expect(result.reply).toContain("保存您的用户名和密码");
    expect(result.reply).toContain("开始工作");
    expect(result.reply).not.toContain("注册奖励");
    expect(result.reply).not.toContain("register.example");
    expect(result.reply).not.toContain("邀请码");
  });

  it("goes directly to Telegram download when phone and no Telegram are sent together", () => {
    const result = reply("手机号 99228822881，我没有 Telegram", { language: "zh", flowStep: "wait_registration" });
    expect(result.nextFlowStep).toBe("telegram_download");
    expect(result.stage).toBe("need_tg_register");
    expect(result.reply).toContain("下载 Telegram");
    expect(result.reply).toContain("@");
    expect(result.reply).not.toContain("WhatsApp");
    expect(result.reply).not.toContain("register.example");
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

    const trust = reply("这个安全吗", { language: "zh", flowStep: "registration_intent" });
    expect(trust.reply).toContain("理解您的顾虑");
    expect(trust.reply).toContain("是否有空");
    expect(trust.reply).not.toContain("register.example");
    expect(trust.nextFlowStep).toBe("registration_intent");
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
    expect(replies[2]).toContain("空闲时间");
    expect(replies[2]).not.toContain("如果您觉得可以继续");

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
    expect(turns[1].result.reply).toContain("每天可以赚取");
    expect(turns[1].result.reply).toContain("空闲时间");
    expect(turns[1].result.reply).not.toContain("register.example");
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
    expect(result.reply).toContain("每天可以赚取");
    expect(result.reply).toContain("空闲时间");
    expect(result.reply).not.toContain("register.example");
    expect(result.reply).not.toBe("好的，我继续协助您。");
  });

  it("answers a concern then still introduces the project when interest is expressed", () => {
    const result = reply("这个安全吗，我有兴趣", { language: "zh", flowStep: "interest_screening" });
    expect(result.enabled).toBe(true);
    expect(result.nextFlowStep).toBe("registration_intent");
    expect(result.reply).toContain("理解您的顾虑");
    expect(result.reply).toContain("简单介绍");
    expect(result.reply).toContain("每天可以赚取");
    expect(result.reply).toContain("空闲时间");
    expect(result.reply).not.toContain("register.example");
    expect(result.reply).not.toBe("好的，我继续协助您。");
  });

  it("introduces the project when the customer asks to understand the job", () => {
    const result = reply("我想了解这个工作", { language: "zh", flowStep: "interest_screening" });
    expect(result.enabled).toBe(true);
    expect(result.nextFlowStep).toBe("registration_intent");
    expect(result.reply).toContain("简单介绍");
    expect(result.reply).toContain("每天可以赚取");
    expect(result.reply).toContain("空闲时间");
    expect(result.reply).not.toContain("register.example");
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

  it("does not stall when the customer uses short completion and Telegram confirmations", () => {
    const turns = simulateStrictFlow([
      "你好",
      "想",
      "要",
      "好了",
      "99228822881",
      "有",
      "@customer_456"
    ]);
    const replies = turns.map((turn) => turn.result.reply);
    expect(turns[1].flowStep).toBe("registration_intent");
    expect(turns[2].flowStep).toBe("wait_registration");
    expect(replies[2]).toContain("https://register.example/?code=ABC123");
    expect(turns[3].flowStep).toBe("telegram_confirm");
    expect(replies[3]).toContain("手机号码");
    expect(turns[4].flowStep).toBe("telegram_confirm");
    expect(replies[4]).toContain("Telegram");
    expect(turns[5].flowStep).toBe("collect_telegram");
    expect(replies[5]).toContain("@");
    expect(turns.at(-1)?.stage).toBe("ready_for_handoff");
    expect(replies.at(-1)).toBe("我们正在核实，请稍后。");
    for (const replyText of replies) {
      expect(replyText).not.toBe("好的，我继续协助您。");
    }
  });

  it("keeps guiding through repeated help requests without resetting the flow", () => {
    const turns = simulateStrictFlow([
      "你好",
      "是的",
      "怎么弄",
      "好了",
      "99228822881",
      "我没有 Telegram",
      "怎么弄",
      "@customer_help"
    ]);
    const replies = turns.map((turn) => turn.result.reply);
    expect(turns[2].flowStep).toBe("wait_registration");
    expect(replies[2]).toContain("https://register.example/?code=ABC123");
    expect(replies[2]).toContain("邀请码");
    expect(turns[3].flowStep).toBe("telegram_confirm");
    expect(turns[5].flowStep).toBe("telegram_download");
    expect(turns[6].flowStep).toBe("collect_telegram");
    expect(replies[6]).toContain("@");
    expect(replies[6]).not.toContain("WhatsApp");
    expect(turns.at(-1)?.stage).toBe("ready_for_handoff");
  });

  it("does not reset completed registration progress on repeated greetings", () => {
    const turns = simulateStrictFlow([
      "你好",
      "是的",
      "好的",
      "99228822881",
      "你好",
      "有",
      "@customer_repeat"
    ]);
    const replies = turns.map((turn) => turn.result.reply);
    expect(turns[3].flowStep).toBe("telegram_confirm");
    expect(turns[4].flowStep).toBe("telegram_confirm");
    expect(replies[4]).toContain("我在");
    expect(replies[4]).toContain("Telegram");
    expect(replies[4]).not.toContain("register.example");
    expect(turns[5].flowStep).toBe("collect_telegram");
    expect(turns.at(-1)?.stage).toBe("ready_for_handoff");
  });

  it("pauses on short refusals without forcing the next flow step", () => {
    const interestRefusal = reply("不是", { language: "zh", flowStep: "interest_screening" });
    expect(interestRefusal.nextFlowStep).toBe("interest_screening");
    expect(interestRefusal.reply).toContain("先不继续打扰");
    expect(interestRefusal.reply).not.toContain("简单介绍");
    expect(interestRefusal.reply).not.toContain("register.example");

    const registrationRefusal = reply("no", { language: "en", flowStep: "registration_intent" });
    expect(registrationRefusal.nextFlowStep).toBe("registration_intent");
    expect(registrationRefusal.reply).toContain("not disturb");
    expect(registrationRefusal.reply).not.toContain("registration link");
  });

  it("can continue normally after a previous short refusal", () => {
    const turns = simulateStrictFlow(["你好", "不是", "继续", "好的"]);
    const replies = turns.map((turn) => turn.result.reply);
    expect(turns[1].flowStep).toBe("interest_screening");
    expect(replies[1]).toContain("先不继续打扰");
    expect(turns[2].flowStep).toBe("registration_intent");
    expect(replies[2]).toContain("简单介绍");
    expect(turns[3].flowStep).toBe("wait_registration");
    expect(replies[3]).toContain("https://register.example/?code=ABC123");
  });

  it("keeps Portuguese flow language through short confirmations", () => {
    const turns = simulateStrictFlow(["olá", "sim", "sim", "cadastrei, telefone 119922882288", "não tenho Telegram", "como faço", "@cliente_pt_123"]);
    const replies = turns.map((turn) => turn.result.reply);
    expect(turns[0].flowStep).toBe("interest_screening");
    expect("language" in turns[1].result ? turns[1].result.language : "").toBe("pt-BR");
    expect(replies[1]).toContain("vou explicar rapidamente");
    expect("language" in turns[2].result ? turns[2].result.language : "").toBe("pt-BR");
    expect(replies[2]).toContain("Link exclusivo de cadastro");
    expect(turns[3].flowStep).toBe("telegram_confirm");
    expect(turns[4].flowStep).toBe("telegram_download");
    expect(replies[4]).toContain("baixar o Telegram");
    expect(turns[5].flowStep).toBe("collect_telegram");
    expect(replies[5]).toContain("@");
    expect(turns.at(-1)?.stage).toBe("ready_for_handoff");
  });

  it("keeps every major strict-flow step actionable for common customer replies", () => {
    const cases: Array<{ step: Conversation["flowStep"]; text: string; extra?: Partial<Conversation> }> = [
      { step: "interest_screening", text: "是的" },
      { step: "interest_screening", text: "不是" },
      { step: "interest_screening", text: "什么平台" },
      { step: "registration_intent", text: "好的" },
      { step: "registration_intent", text: "no" },
      { step: "registration_intent", text: "安全吗" },
      { step: "registration_intent", text: "怎么弄" },
      { step: "wait_registration", text: "你好" },
      { step: "wait_registration", text: "好了" },
      { step: "telegram_confirm", text: "有", extra: { extractedPhone: "99228822881" } },
      { step: "telegram_confirm", text: "没有 Telegram", extra: { extractedPhone: "99228822881" } },
      { step: "telegram_download", text: "怎么弄", extra: { extractedPhone: "99228822881" } },
      { step: "collect_telegram", text: "你好", extra: { extractedPhone: "99228822881" } }
    ];

    for (const item of cases) {
      const result = reply(item.text, { language: "zh", flowStep: item.step, ...item.extra });
      expect(result.reply, `${item.step}:${item.text}`).not.toBe("好的，我继续协助您。");
      expect(result.reply, `${item.step}:${item.text}`).not.toMatch(/AI|机器人|自动客服|自动回复/i);
      expect(result.reply.trim().length, `${item.step}:${item.text}`).toBeGreaterThan(8);
      expect(result.nextFlowStep, `${item.step}:${item.text}`).not.toBe("first_greeting");
      if (item.step === "telegram_confirm" || item.step === "telegram_download" || item.step === "collect_telegram") {
        expect(result.reply, `${item.step}:${item.text}`).not.toContain("WhatsApp");
      }
    }
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

  it("does not reserve invitation codes before the registration step even if the customer asks for a link", () => {
    const analysis = analyzeMessage("链接和邀请码发我");

    expect(strictFlowNeedsInviteCode({
      merchant,
      country,
      conversation: conversation({ language: "zh", flowStep: "interest_screening" }),
      analysis,
      customerText: "链接和邀请码发我",
      inferredIntent: "ask_link"
    })).toBe(false);

    expect(strictFlowNeedsInviteCode({
      merchant,
      country,
      conversation: conversation({ language: "zh", flowStep: "registration_intent" }),
      analysis,
      customerText: "链接和邀请码发我",
      inferredIntent: "ask_link"
    })).toBe(true);

    expect(strictFlowNeedsInviteCode({
      merchant,
      country,
      conversation: conversation({ language: "zh", flowStep: "wait_registration" }),
      analysis,
      customerText: "链接和邀请码发我",
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

  it("answers trust payment and Telegram questions while waiting for registration", () => {
    const scam = reply("你不会是骗子吧", { language: "zh", flowStep: "wait_registration" });
    expect(scam.reply).toContain("理解您的顾虑");
    expect(scam.reply).toContain("如果已经注册完成");
    expect(scam.reply).not.toContain("刚才没有理解");
    expect(scam.reply).not.toContain("register.example");
    expect(scam.reply).not.toContain("邀请码");
    expect(scam.nextFlowStep).toBe("wait_registration");

    const fraud = reply("你这不是诈骗吧", { language: "zh", flowStep: "wait_registration" });
    expect(fraud.reply).toContain("理解您的顾虑");
    expect(fraud.reply).toContain("如果已经注册完成");
    expect(fraud.reply).not.toContain("刚才没有理解");
    expect(fraud.nextFlowStep).toBe("wait_registration");

    const payment = reply("我要付钱么", { language: "zh", flowStep: "wait_registration" });
    expect(payment.reply).toContain("不会要求您向客服转账或私下付款");
    expect(payment.reply).toContain("如果已经注册完成");
    expect(payment.reply).not.toContain("register.example");
    expect(payment.reply).not.toContain("邀请码");
    expect(payment.nextFlowStep).toBe("wait_registration");

    const telegram = reply("Telegram是什么", { language: "zh", flowStep: "wait_registration" });
    expect(telegram.reply).toContain("Telegram 是后续联系和指导使用的沟通工具");
    expect(telegram.reply).toContain("完成平台注册");
    expect(telegram.reply).toContain("注册手机号");
    expect(telegram.reply).not.toContain("下载 Telegram");
    expect(telegram.reply).not.toContain("register.example");
    expect(telegram.nextFlowStep).toBe("wait_registration");
  });

  it("uses controlled natural answers without changing the strict flow", () => {
    const earningIntent = reply("我想要赚钱", { language: "zh", flowStep: "interest_screening" });
    expect(earningIntent.reply).toContain("简单介绍");
    expect(earningIntent.reply).toContain("空闲时间");
    expect(earningIntent.reply).not.toContain("不会要求您向客服转账");
    expect(earningIntent.nextFlowStep).toBe("registration_intent");

    const identity = reply("你是谁", { language: "zh", flowStep: "wait_registration" });
    expect(identity.reply).toContain("负责协助您完成开户注册和联系方式核对");
    expect(identity.reply).toContain("如果已经注册完成");
    expect(identity.reply).not.toMatch(/AI|机器人|自动客服|自动回复/i);
    expect(identity.nextFlowStep).toBe("wait_registration");

    const unknown = reply("巴西今天下雨吗", { language: "zh", flowStep: "wait_registration" });
    expect(unknown.reply).toContain("以后续页面或人工确认为准");
    expect(unknown.reply).toContain("如果已经注册完成");
    expect(unknown.nextFlowStep).toBe("wait_registration");
  });

  it("answers investment and complaint questions before returning to the current step", () => {
    const investment = reply("这份工作需要投资么", { language: "zh", flowStep: "registration_intent" });
    expect(investment.reply).toContain("不用先给我这边投钱或交押金");
    expect(investment.reply).toContain("有空继续开户注册");
    expect(investment.reply).not.toContain("我先简单介绍一下");
    expect(investment.nextFlowStep).toBe("registration_intent");

    const missedQuestion = reply("你没有回答我的疑问", { language: "zh", flowStep: "wait_registration" });
    expect(missedQuestion.reply).toContain("刚才没接住您的问题");
    expect(missedQuestion.reply).toContain("如果已经注册完成");
    expect(missedQuestion.nextFlowStep).toBe("wait_registration");
  });

  it("answers Telegram questions according to whether the phone was already collected", () => {
    const beforePhone = reply("Telegram是什么", { language: "zh", flowStep: "wait_registration" });
    expect(beforePhone.reply).toContain("先完成平台注册");
    expect(beforePhone.reply).toContain("注册手机号");
    expect(beforePhone.nextFlowStep).toBe("wait_registration");

    const afterPhone = reply("Telegram是什么，怎么下载", { language: "zh", flowStep: "collect_telegram", extractedPhone: "654387654" });
    expect(afterPhone.reply).toContain("已经完成手机号这一步");
    expect(afterPhone.reply).toContain("@ 开头");
    expect(afterPhone.reply).not.toContain("先完成平台注册");
    expect(afterPhone.nextFlowStep).toBe("collect_telegram");

    const phoneAlreadySent = reply("手机号我已经发给你了", { language: "zh", flowStep: "collect_telegram", extractedPhone: "654387654" });
    expect(phoneAlreadySent.reply).toContain("@ 开头");
    expect(phoneAlreadySent.reply).not.toContain("注册手机号");
    expect(phoneAlreadySent.nextFlowStep).toBe("collect_telegram");
  });

  it("uses context to understand short Telegram-stage replies", () => {
    const noTelegram = reply("我没有", { language: "zh", flowStep: "telegram_confirm", extractedPhone: "9876789" });
    expect(noTelegram.nextFlowStep).toBe("telegram_download");
    expect(noTelegram.reply).toContain("应用商店");
    expect(noTelegram.reply).not.toContain("不继续打扰");
    expect(noTelegram.contextualIntent?.intent).toBe("no_telegram");

    const installed = reply("装好了", { language: "zh", flowStep: "telegram_download", extractedPhone: "9876789" });
    expect(installed.nextFlowStep).toBe("collect_telegram");
    expect(installed.reply).toContain("@ 开头");
    expect(installed.contextualIntent?.intent).toBe("telegram_installed");

    const tgQuestion = reply("为什么要使用Telegram呢", { language: "zh", flowStep: "collect_telegram", extractedPhone: "9876789" });
    expect(tgQuestion.nextFlowStep).toBe("collect_telegram");
    expect(tgQuestion.reply).toContain("后续联系和指导");
    expect(tgQuestion.reply).toContain("@ 开头");

    const acknowledgement = reply("ok", { language: "zh", flowStep: "collect_telegram", extractedPhone: "9876789" });
    expect(acknowledgement.nextFlowStep).toBe("collect_telegram");
    expect(acknowledgement.reply).toContain("我在这边等");
    expect(acknowledgement.contextualIntent?.intent).toBe("acknowledgement");
  });

  it("uses context to distinguish short no answers outside Telegram", () => {
    const notRegistered = reply("我没有", { language: "zh", flowStep: "wait_registration" });
    expect(notRegistered.nextFlowStep).toBe("wait_registration");
    expect(notRegistered.reply).toContain("卡在哪一步");
    expect(notRegistered.reply).not.toContain("Telegram");
    expect(notRegistered.contextualIntent?.intent).toBe("not_registered");

    const notAvailable = reply("我没有", { language: "zh", flowStep: "registration_intent" });
    expect(notAvailable.nextFlowStep).toBe("registration_intent");
    expect(notAvailable.reply).toContain("先不继续打扰");
    expect(notAvailable.reply).not.toContain("开户链接");
    expect(notAvailable.contextualIntent?.intent).toBe("not_available");
  });
});
