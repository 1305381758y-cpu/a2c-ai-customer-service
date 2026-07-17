import { describe, expect, it } from "vitest";
import { sanitizeNaturalizedText } from "../src/clients/aiStrictFlowNaturalization.js";
import { analyzeMessage } from "../src/domain/analyzer.js";
import { suppressRegistrationDetailsForNonLinkStep } from "../src/domain/registrationPolicy.js";
import { buildRuleContextualIntent, buildStrictFlowReply, isStrictFlowEnabled, resolveEffectiveStrictFlowStep, strictFlowNeedsInviteCode, type StrictFlowReply } from "../src/domain/strictFlow.js";
import { detectContextualRegistrationPhone } from "../src/services/inboundTurnAnalysis.js";
import { shouldBypassStrictFlowForNaturalReply } from "../src/services/inboundTurnResponder.js";
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
  tgRegisterGuideUrl: "https://t.me/teacher",
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
  TG_REGISTER_GUIDE_URL: "https://t.me/teacher"
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
      sendTutorialImage: false,
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
      sendTutorialImage: false,
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

function replyWithRuntime(
  text: string,
  overrides: Partial<Conversation> = {},
  runtime: { inviteCode?: A2CInviteCodeRecord; teacherTelegramLink?: string } = {}
) {
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
    inviteCode: runtime.inviteCode,
    teacherTelegramLink: runtime.teacherTelegramLink,
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

  it("keeps editable built-in project intro nodes compatible with the strict engine", () => {
    const builtInCompatibleFlow: ScriptFlowRuntime = {
      ...scriptFlow,
      steps: [
        {
          ...scriptFlow.steps[0],
          flowCode: "2",
          flowName: "兴趣筛选",
          flowStep: "interest_screening",
          standardReply: "您好，您想了解这份在线工作吗？",
          nextFlowCode: "3",
          nextFlowStep: "project_intro"
        },
        {
          ...scriptFlow.steps[0],
          id: 3,
          flowCode: "3",
          flowName: "项目介绍",
          flowStep: "project_intro",
          standardReply: "这是商户编辑后的项目介绍。收益以页面规则为准。您现在方便继续开户注册吗？",
          nextFlowCode: "4",
          nextFlowStep: "registration_intent"
        },
        {
          ...scriptFlow.steps[0],
          id: 4,
          flowCode: "4",
          flowName: "确认意向",
          flowStep: "registration_intent",
          standardReply: "您现在方便继续开户注册吗？",
          nextFlowCode: "5",
          nextFlowStep: "send_register_link"
        },
        {
          ...scriptFlow.steps[1],
          id: 5,
          flowCode: "5",
          flowName: "发送链接",
          flowStep: "send_register_link",
          standardReply: "开户链接：{{REGISTER_URL}}\n邀请码：{{INVITE_CODE}}\n完成注册后告诉我。",
          sendLink: true,
          sendInvite: true,
          nextFlowCode: "6",
          nextFlowStep: "wait_registration"
        }
      ]
    };

    const result = buildStrictFlowReply({
      merchant,
      country,
      conversation: conversation({ flowStep: "interest_screening", language: "zh" }),
      analysis: analyzeMessage("是的", "zh"),
      customerText: "是的",
      config,
      scriptFlow: builtInCompatibleFlow
    });

    expect(result.nextFlowStep).toBe("registration_intent");
    expect(result.reply).toContain("商户编辑后的项目介绍");
    expect(result.reply).not.toContain("开户链接");
    expect(result.reply).not.toContain("邀请码");
  });

  it("uses the merchant project-intro node before the confirmation-intent node in editable 11-step flows", () => {
    const builtInDuplicateFlow: ScriptFlowRuntime = {
      ...scriptFlow,
      steps: [
        {
          ...scriptFlow.steps[0],
          flowCode: "2",
          flowName: "兴趣筛选",
          flowStep: "interest_screening",
          standardReply: "Hola, ¿le interesa conocer un trabajo en línea?",
          nextFlowCode: "3",
          nextFlowStep: "project_intro",
          sortOrder: 2
        },
        {
          ...scriptFlow.steps[0],
          id: 3,
          flowCode: "3",
          flowName: "项目介绍",
          flowStep: "项目介绍",
          standardReply: "Esta es la presentación personalizada del proyecto. Las ganancias siguen las reglas de la página. ¿Tiene tiempo para continuar el registro?",
          nextFlowCode: "4",
          nextFlowStep: "registration_intent",
          sortOrder: 3
        },
        {
          ...scriptFlow.steps[0],
          id: 4,
          flowCode: "4",
          flowName: "确认意向",
          flowStep: "确认意向",
          standardReply: "¿Le sería posible continuar con el siguiente paso del proceso de apertura de cuenta?",
          nextFlowCode: "5",
          nextFlowStep: "send_register_link",
          sortOrder: 4
        },
        {
          ...scriptFlow.steps[1],
          id: 5,
          flowCode: "5",
          flowName: "发送链接",
          flowStep: "send_register_link",
          standardReply: "Enlace de registro: {{REGISTER_URL}}\nCódigo de invitación: {{INVITE_CODE}}",
          sendLink: true,
          sendInvite: true,
          nextFlowCode: "6",
          nextFlowStep: "wait_registration",
          sortOrder: 5
        }
      ]
    };

    const result = buildStrictFlowReply({
      merchant,
      country: { ...country, defaultLanguage: "es" },
      conversation: conversation({ flowStep: "interest_screening", language: "es" }),
      analysis: analyzeMessage("Sí", "es"),
      customerText: "Sí",
      config,
      scriptFlow: builtInDuplicateFlow
    });

    expect(result.nextFlowStep).toBe("registration_intent");
    expect(result.reply).toContain("presentación personalizada del proyecto");
    expect(result.reply).not.toContain("siguiente paso del proceso de apertura de cuenta");
    expect(result.reply).not.toContain("Enlace de registro");
    expect(result.reply).not.toContain("Código de invitación");
  });

  it("uses script flow next system step when a node configures custom routing", () => {
    const routedFlow: ScriptFlowRuntime = {
      ...scriptFlow,
      steps: scriptFlow.steps.map((step) => step.flowStep === "wait_registration" ? { ...step, nextFlowStep: "collect_telegram" } : step)
    };
    const result = buildStrictFlowReply({
      merchant,
      country,
      conversation: conversation({ flowStep: "wait_registration", language: "zh" }),
      analysis: analyzeMessage("918273718271 注册好了", "zh"),
      customerText: "918273718271 注册好了",
      inviteCode,
      config,
      scriptFlow: routedFlow
    });

    expect(result.nextFlowStep).toBe("collect_telegram");
    expect(result.stage).toBe("need_tg_register");
  });

  it("uses a configured send-link node but stores the next state as waiting registration", () => {
    const splitFlow: ScriptFlowRuntime = {
      ...scriptFlow,
      steps: [
        {
          ...scriptFlow.steps[0],
          flowCode: "D",
          flowName: "确认意向",
          flowStep: "registration_intent",
          standardReply: "您现在方便继续开户注册吗？",
          nextFlowCode: "E",
          nextFlowStep: "send_register_link"
        },
        {
          ...scriptFlow.steps[1],
          flowCode: "E",
          flowName: "发送链接",
          flowStep: "send_register_link",
          standardReply: "专属链接：{{REGISTER_URL}}\n专属码：{{INVITE_CODE}}",
          sendLink: true,
          sendInvite: true,
          sendTutorialImage: true,
          nextFlowCode: "F",
          nextFlowStep: "wait_registration"
        },
        {
          ...scriptFlow.steps[1],
          id: 3,
          flowCode: "F",
          flowName: "等待注册",
          flowStep: "wait_registration",
          standardReply: "注册好后把手机号发给我。",
          sendLink: false,
          sendInvite: false,
          sendTutorialImage: false,
          nextFlowCode: "G",
          nextFlowStep: "telegram_confirm"
        }
      ]
    };

    const result = buildStrictFlowReply({
      merchant,
      country,
      conversation: conversation({ flowStep: "registration_intent", language: "zh" }),
      analysis: analyzeMessage("方便", "zh"),
      customerText: "方便",
      inviteCode,
      config: { ...config, REGISTRATION_TUTORIAL_IMAGE_URL: "https://cdn.example/tutorial.jpg" } as AppConfig,
      scriptFlow: splitFlow
    });

    expect(result.nextFlowStep).toBe("wait_registration");
    expect(result.reply).toContain("专属链接：https://register.example/?code=ABC123");
    expect(result.reply).toContain("专属码：ABC123");
    expect(result.tutorialImageRequested).toBe(true);
  });

  it("moves from interest screening to project intro when the customer asks for an introduction", () => {
    const result = reply("兼职?你介绍下", { language: "zh", flowStep: "interest_screening" });

    expect(result.nextFlowStep).toBe("registration_intent");
    expect(result.reply).toContain("页面规则");
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

  it("does not expose script wording in customer-visible project introduction", () => {
    const result = reply("是的", { language: "zh", flowStep: "interest_screening" });

    expect(result.nextFlowStep).toBe("registration_intent");
    expect(result.reply).toContain("页面规则");
    expect(result.reply).not.toMatch(/雷亚尔|reais/i);
    expect(result.reply).not.toMatch(/话本|脚本|模板|严格流程|自动客服|机器人|AI/i);
  });

  it("prioritizes no Telegram over refusal when the customer says they do not have it", () => {
    const analysis = analyzeMessage("我没有", "zh");
    const result = buildStrictFlowReply({
      merchant,
      country,
      conversation: conversation({ language: "zh", flowStep: "telegram_confirm", extractedPhone: "56789045678" }),
      analysis,
      customerText: "我没有",
      inviteCode,
      config,
      inferredIntent: "negative_refusal",
      contextualIntent: {
        intent: "negative_refusal",
        source: "ai",
        answeredPreviousQuestion: true,
        isQuestion: false,
        isSubmission: false,
        shouldPause: true,
        questionType: "none",
        nextAction: "pause politely",
        reason: "misclassified short no"
      }
    });

    expect(result.nextFlowStep).toBe("telegram_download");
    expect(result.reply).toContain("Telegram");
    expect(result.reply).toContain("应用商店");
    expect(result.reply).not.toContain("不继续打扰");
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
    expect(result.reply).toContain("老师的 Telegram 链接");
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

    expect(replies[2]).toContain("页面规则");
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
    expect(replies[6]).toContain("老师的 Telegram 链接");
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
    expect(turns[1].result.reply).toContain("页面规则");
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
    expect(result.reply).toContain("页面规则");
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
    expect(result.reply).toContain("页面规则");
    expect(result.reply).toContain("空闲时间");
    expect(result.reply).not.toContain("register.example");
    expect(result.reply).not.toBe("好的，我继续协助您。");
  });

  it("introduces the project when the customer asks to understand the job", () => {
    const result = reply("我想了解这个工作", { language: "zh", flowStep: "interest_screening" });
    expect(result.enabled).toBe(true);
    expect(result.nextFlowStep).toBe("registration_intent");
    expect(result.reply).toContain("简单介绍");
    expect(result.reply).toContain("页面规则");
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
      "装好了"
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
    expect(turns[5].flowStep).toBe("telegram_download");
    expect(replies[5]).toContain("Telegram");
    expect(turns[6].flowStep).toBe("human_handoff");
    expect(replies[6]).toContain("https://t.me/teacher");
    expect(replies[6]).toContain("老师");
    expect(turns.at(-1)?.stage).toBe("ready_for_handoff");
  });

  it("does not stall when the customer uses short completion and Telegram confirmations", () => {
    const turns = simulateStrictFlow([
      "你好",
      "想",
      "要",
      "好了",
      "99228822881",
      "有"
    ]);
    const replies = turns.map((turn) => turn.result.reply);
    expect(turns[1].flowStep).toBe("registration_intent");
    expect(turns[2].flowStep).toBe("wait_registration");
    expect(replies[2]).toContain("https://register.example/?code=ABC123");
    expect(turns[3].flowStep).toBe("wait_registration");
    expect(replies[3]).toContain("手机号码");
    expect(turns[4].flowStep).toBe("telegram_confirm");
    expect(replies[4]).toContain("Telegram");
    expect(turns[5].flowStep).toBe("human_handoff");
    expect(replies[5]).toContain("https://t.me/teacher");
    expect(replies[5]).toContain("老师");
    expect(turns.at(-1)?.stage).toBe("ready_for_handoff");
    for (const replyText of replies) {
      expect(replyText).not.toBe("好的，我继续协助您。");
    }
  });

  it("keeps guiding through repeated help requests without resetting the flow", () => {
    const turns = simulateStrictFlow([
      "你好",
      "是的",
      "怎么弄",
      "方便",
      "好了",
      "99228822881",
      "我没有 Telegram",
      "怎么弄",
      "装好了"
    ]);
    const replies = turns.map((turn) => turn.result.reply);
    expect(turns[2].flowStep).toBe("registration_intent");
    expect(replies[2]).toContain("方便操作");
    expect(replies[2]).not.toContain("https://register.example/?code=ABC123");
    expect(turns[3].flowStep).toBe("wait_registration");
    expect(replies[3]).toContain("https://register.example/?code=ABC123");
    expect(replies[3]).toContain("邀请码");
    expect(turns[4].flowStep).toBe("wait_registration");
    expect(turns[6].flowStep).toBe("telegram_download");
    expect(turns[7].flowStep).toBe("telegram_download");
    expect(replies[7]).toContain("Telegram");
    expect(replies[7]).not.toContain("WhatsApp");
    expect(turns[8].flowStep).toBe("human_handoff");
    expect(replies[8]).toContain("https://t.me/teacher");
    expect(replies[8]).toContain("老师");
    expect(turns.at(-1)?.stage).toBe("ready_for_handoff");
  });

  it("does not reset completed registration progress on repeated greetings", () => {
    const turns = simulateStrictFlow([
      "你好",
      "是的",
      "好的",
      "99228822881",
      "你好",
      "有"
    ]);
    const replies = turns.map((turn) => turn.result.reply);
    expect(turns[3].flowStep).toBe("telegram_confirm");
    expect(turns[4].flowStep).toBe("telegram_confirm");
    expect(replies[4]).toContain("我在");
    expect(replies[4]).toContain("Telegram");
    expect(replies[4]).not.toContain("register.example");
    expect(turns[5].flowStep).toBe("human_handoff");
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
    const turns = simulateStrictFlow(["olá", "sim", "sim", "cadastrei, telefone 119922882288", "não tenho Telegram", "como faço", "instalei"]);
    const replies = turns.map((turn) => turn.result.reply);
    expect(turns[0].flowStep).toBe("interest_screening");
    expect("language" in turns[1].result ? turns[1].result.language : "").toBe("pt-BR");
    expect(replies[1]).toContain("vou explicar rapidamente");
    expect("language" in turns[2].result ? turns[2].result.language : "").toBe("pt-BR");
    expect(replies[2]).toContain("Link exclusivo de cadastro");
    expect(turns[3].flowStep).toBe("telegram_confirm");
    expect(turns[4].flowStep).toBe("telegram_download");
    expect(replies[4]).toContain("baixe o Telegram");
    expect(turns[5].flowStep).toBe("telegram_download");
    expect(replies[5]).toContain("Telegram");
    expect(turns[6].flowStep).toBe("human_handoff");
    expect(replies[6]).toContain("https://t.me/teacher");
    expect(replies[6]).toContain("professora");
    expect(turns.at(-1)?.stage).toBe("ready_for_handoff");
  });

  it("keeps Spanish flow language for short Spanish customer messages", () => {
    const info = reply("Información", { language: "unknown" });
    expect(info.language).toBe("es");
    expect(info.reply).toContain("Hola");
    expect(info.reply).not.toContain("Hello");

    const favor = reply("X favor", { language: "en", flowStep: "interest_screening" });
    expect(favor.language).toBe("es");
    expect(favor.reply).toContain("explic");
    expect(favor.reply).not.toContain("Got it");

    const turns = simulateStrictFlow(["Información", "Si"]);
    const secondReply = turns[1].result.reply;
    expect("language" in turns[1].result ? turns[1].result.language : "").toBe("es");
    expect(secondReply).toContain("trabajo");
    expect(secondReply).toContain("registro");
    expect(secondReply).not.toContain("online part-time job");
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
    expect(positive.nextFlowStep).toBe("interest_screening");
    expect(positive.reply).toContain("would you like to learn");

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
    expect(help.reply).toContain("卡在");
    expect(help.reply).toContain("打开链接");
    expect(help.reply).not.toContain("开户链接");
    expect(help.reply).not.toContain("ABC123");
    expect(help.nextFlowStep).toBe("wait_registration");

    const telegramHelp = reply("怎么下载", { language: "zh", flowStep: "telegram_download", extractedPhone: "99228822881" });
    expect(telegramHelp.reply).toContain("协助您处理 Telegram");
    expect(telegramHelp.reply).toContain("老师的 Telegram 链接");
    expect(telegramHelp.reply).not.toContain("WhatsApp");

    const refusal = reply("不需要了，别发了", { language: "zh", flowStep: "wait_registration" });
    expect(refusal.reply).toContain("先不继续打扰");
    expect(refusal.reply).not.toContain("注册完成");
    expect(refusal.reply).not.toContain("register.example");
    expect(refusal.nextFlowStep).toBe("wait_registration");
  });

  it("does not fall back to missing invite when customer asks for tutorial or cannot open registration", () => {
    const tutorialAnalysis = analyzeMessage("我不会，有教程吗", "zh");
    expect(strictFlowNeedsInviteCode({
      merchant,
      country,
      conversation: conversation({ language: "zh", flowStep: "wait_registration" }),
      analysis: tutorialAnalysis,
      customerText: "我不会，有教程吗",
      inferredIntent: "need_help"
    })).toBe(true);

    const tutorial = reply("我不会，有教程吗", { language: "zh", flowStep: "wait_registration" });
    expect(tutorial.reply).toContain("开户链接");
    expect(tutorial.reply).toContain("邀请码");
    expect(tutorial.reply).toContain("注册步骤");
    expect(tutorial.reply).not.toContain("正在确认您的专属邀请码");

    const cannotOpen = reply("打不开", { language: "zh", flowStep: "wait_registration" });
    expect(cannotOpen.reply).toContain("链接页面加载不出来");
    expect(cannotOpen.reply).toContain("切换一下网络");
    expect(cannotOpen.reply).not.toContain("正在确认您的专属邀请码");
    expect(cannotOpen.nextFlowStep).toBe("wait_registration");
  });

  it("hands off when the customer reports the registration link cannot open for the second time", () => {
    const text = "链接还是打不开";
    const conv = conversation({ language: "zh", flowStep: "wait_registration" });
    const analysis = analyzeMessage(text, "zh");
    const contextualIntent = buildRuleContextualIntent({
      conversation: conv,
      analysis,
      customerText: text
    });

    const result = buildStrictFlowReply({
      merchant,
      country,
      conversation: conv,
      analysis,
      customerText: text,
      inviteCode,
      config,
      contextualIntent,
      linkLoadFailureCount: 2
    });

    expect(result.nextFlowStep).toBe("human_handoff");
    expect(result.stage).toBe("ready_for_handoff");
    expect(result.handoffReason).toBe("客户反馈无法打开注册链接");
    expect(result.reply).toBe("我正在核实，请稍等。");
  });

  it("hands off when a Spanish customer reports the registration link cannot be accessed twice", () => {
    const text = "No puedo acceder al enlace.";
    const conv = conversation({ language: "es", flowStep: "wait_registration" });
    const analysis = analyzeMessage(text, "es");
    const contextualIntent = buildRuleContextualIntent({
      conversation: conv,
      analysis,
      customerText: text
    });

    const result = buildStrictFlowReply({
      merchant,
      country,
      conversation: conv,
      analysis,
      customerText: text,
      inviteCode,
      config,
      contextualIntent,
      linkLoadFailureCount: 2
    });

    expect(result.nextFlowStep).toBe("human_handoff");
    expect(result.stage).toBe("ready_for_handoff");
    expect(result.handoffReason).toBe("客户反馈无法打开注册链接");
    expect(result.reply).toContain("Espere un momento");
  });

  it("answers generic questions and look-at-this prompts without resending the registration package", () => {
    const question = reply("我有个问题你可以帮我解答吗", { language: "zh", flowStep: "wait_registration" });
    expect(question.reply).toContain("直接说您的问题");
    expect(question.reply).not.toMatch(/当前开户注册|继续.*注册|注册手机号/);
    expect(question.reply).not.toContain("开户链接");
    expect(question.reply).not.toContain("邀请码");
    expect(question.tutorialImageRequested).toBe(false);

    const look = reply("你看看", { language: "zh", flowStep: "wait_registration" });
    expect(look.reply).toContain("截图");
    expect(look.reply).toContain("卡");
    expect(look.reply).not.toContain("开户链接");
    expect(look.reply).not.toContain("邀请码");
    expect(look.tutorialImageRequested).toBe(false);

    const link = reply("链接无法打开", { language: "zh", flowStep: "wait_registration" });
    expect(link.reply).toContain("浏览器");
    expect(link.reply).toContain("完整链接");
    expect(link.reply).not.toContain("register.example");
    expect(link.reply).not.toContain("ABC123");
    expect(link.tutorialImageRequested).toBe(false);

    const stillCannotOpen = reply("还是打不开", { language: "zh", flowStep: "wait_registration" });
    expect(stillCannotOpen.reply).toContain("链接页面加载不出来");
    expect(stillCannotOpen.reply).toContain("切换一下网络");
    expect(stillCannotOpen.reply).not.toContain("注册步骤");

    const stuckOpening = reply("卡在打开链接", { language: "zh", flowStep: "wait_registration" });
    expect(stuckOpening.reply).toContain("浏览器");
    expect(stuckOpening.reply).toContain("完整链接");
    expect(stuckOpening.reply).not.toContain("注册步骤");

    const noErrorBlank = reply("没有报错就是打不开", { language: "zh", flowStep: "wait_registration" });
    expect(noErrorBlank.reply).toContain("链接页面加载不出来");
    expect(noErrorBlank.reply).toContain("核对开户链接");

    const cannotLoadContent = reply("我说我打不开链接无法加载内容", { language: "zh", flowStep: "wait_registration" });
    expect(cannotLoadContent.reply).toContain("链接页面加载不出来");
    expect(cannotLoadContent.reply).not.toContain("卡在打开链接、填写手机号");
  });

  it("answers Spanish registration field questions in wait registration without resending the link package", () => {
    const result = reply("¿Necesito registrarme con mi nombre y número de teléfono reales?", { language: "es", flowStep: "wait_registration" });

    expect(result.nextFlowStep).toBe("wait_registration");
    expect(result.reply).toContain("teléfono");
    expect(result.reply).not.toContain("Enlace de registro");
    expect(result.reply).not.toContain("Código de invitación");
    expect(result.reply).not.toContain("https://register.example");
  });

  it("treats inbound registration screenshots as a registration blocker instead of missing invite", () => {
    const screenshot = reply("[图片]", { language: "zh", flowStep: "wait_registration" });
    expect(screenshot.reply).toContain("看到您发的截图");
    expect(screenshot.reply).toContain("打开或加载");
    expect(screenshot.reply).toContain("核对开户链接");
    expect(screenshot.reply).not.toContain("正在确认您的专属邀请码");
    expect(screenshot.reply).not.toContain("register.example");
    expect(screenshot.nextFlowStep).toBe("wait_registration");

    const conv = conversation({ language: "zh", flowStep: "wait_registration" });
    const imageWithTutorial = buildStrictFlowReply({
      merchant,
      country,
      conversation: conv,
      analysis: analyzeMessage("客户发送的图片", "zh"),
      customerText: "客户发送的图片",
      inviteCode,
      config: { ...config, REGISTRATION_TUTORIAL_IMAGE_URL: "https://cdn.example/tutorial.jpg" } as AppConfig,
      contextualIntent: buildRuleContextualIntent({ conversation: conv, analysis: analyzeMessage("客户发送的图片", "zh"), customerText: "客户发送的图片" })
    });
    expect(imageWithTutorial.reply).toContain("截图");
    expect(imageWithTutorial.tutorialImageRequested).toBe(false);
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
    expect(telegram.reply).toContain("Telegram 是个聊天工具");
    expect(telegram.reply).toContain("后续的沟通和指导都会通过它进行");
    expect(telegram.reply).toContain("完成平台注册");
    expect(telegram.reply).toContain("注册手机号");
    expect(telegram.reply).not.toContain("下载 Telegram");
    expect(telegram.reply).not.toContain("register.example");
    expect(telegram.reply).not.toMatch(/微信|WeChat/i);
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
    expect(investment.reply).toContain("有空闲时间继续开户注册");
    expect(investment.reply).not.toContain("我先简单介绍一下");
    expect(investment.nextFlowStep).toBe("registration_intent");

    const missedQuestion = reply("你没有回答我的疑问", { language: "zh", flowStep: "wait_registration" });
    expect(missedQuestion.reply).toContain("刚才没接住您的问题");
    expect(missedQuestion.reply).toContain("如果已经注册完成");
    expect(missedQuestion.nextFlowStep).toBe("wait_registration");
  });

  it("answers Telegram questions according to whether the phone was already collected", () => {
    const beforePhone = reply("Telegram是什么", { language: "zh", flowStep: "wait_registration" });
    expect(beforePhone.reply).toContain("Telegram 是个聊天工具");
    expect(beforePhone.reply).toContain("先完成平台注册");
    expect(beforePhone.reply).toContain("注册手机号");
    expect(beforePhone.reply).not.toMatch(/微信|WeChat/i);
    expect(beforePhone.nextFlowStep).toBe("wait_registration");

    const afterPhone = reply("Telegram是什么，怎么下载", { language: "zh", flowStep: "collect_telegram", extractedPhone: "654387654" });
    expect(afterPhone.reply).toContain("任务指导");
    expect(afterPhone.reply).toContain("应用商店");
    expect(afterPhone.reply).not.toMatch(/微信|WeChat/i);
    expect(afterPhone.reply).not.toContain("先完成平台注册");
    expect(afterPhone.nextFlowStep).toBe("telegram_download");

    const phoneAlreadySent = reply("手机号我已经发给你了", { language: "zh", flowStep: "collect_telegram", extractedPhone: "654387654" });
    expect(phoneAlreadySent.reply).toContain("老师");
    expect(phoneAlreadySent.reply).not.toContain("注册手机号");
    expect(phoneAlreadySent.nextFlowStep).toBe("collect_telegram");
  });

  it("removes regional chat app comparisons from naturalized Telegram explanations", () => {
    const cleaned = sanitizeNaturalizedText(
      "Telegram 就像微信一样，是个聊天工具。我们后续的沟通和指导都会通过它进行，方便您随时提问。",
      "Telegram 是个聊天工具，我们后续的沟通和指导都会通过它进行，方便您随时提问。",
      false
    );

    expect(cleaned).toContain("Telegram 是个聊天工具");
    expect(cleaned).toContain("后续的沟通和指导都会通过它进行");
    expect(cleaned).not.toMatch(/微信|WeChat/i);
  });

  it("uses context to understand short Telegram-stage replies", () => {
    const noTelegram = reply("我没有", { language: "zh", flowStep: "telegram_confirm", extractedPhone: "9876789" });
    expect(noTelegram.nextFlowStep).toBe("telegram_download");
    expect(noTelegram.reply).toContain("应用商店");
    expect(noTelegram.reply).not.toContain("不继续打扰");
    expect(noTelegram.contextualIntent?.intent).toBe("no_telegram");

    const installed = reply("装好了", { language: "zh", flowStep: "telegram_download", extractedPhone: "9876789" });
    expect(installed.nextFlowStep).toBe("human_handoff");
    expect(installed.reply).toContain("https://t.me/teacher");
    expect(installed.reply).toContain("老师");
    expect(installed.contextualIntent?.intent).toBe("telegram_installed");

    const tgQuestion = reply("为什么要使用Telegram呢", { language: "zh", flowStep: "collect_telegram", extractedPhone: "9876789" });
    expect(tgQuestion.nextFlowStep).toBe("collect_telegram");
    expect(tgQuestion.reply).toContain("Telegram");
    expect(tgQuestion.reply).toContain("导师");
    expect(tgQuestion.reply).toContain("任务指导");
    expect(tgQuestion.reply).not.toContain("https://t.me/teacher");
    expect(tgQuestion.reply).not.toMatch(/微信|WeChat/i);

    const acknowledgement = reply("ok", { language: "zh", flowStep: "collect_telegram", extractedPhone: "9876789" });
    expect(acknowledgement.nextFlowStep).toBe("collect_telegram");
    expect(acknowledgement.reply).toContain("老师");
    expect(acknowledgement.contextualIntent?.intent).toBe("acknowledgement");
  });

  it("waits for the actual question instead of pushing registration", () => {
    const result = reply("我可以问你一个问题吗", {
      language: "zh",
      flowStep: "registration_intent"
    });

    expect(result.nextFlowStep).toBe("registration_intent");
    expect(result.reply).toContain("直接说您的问题");
    expect(result.reply).not.toMatch(/有空|方便.*注册|继续.*注册/);
  });

  it("recognizes natural Portuguese requests to ask a question before continuing", () => {
    const result = reply("Ok, posso fazer uma pergunta antes?", {
      language: "pt-BR",
      flowStep: "registration_intent"
    });

    expect(result.nextFlowStep).toBe("registration_intent");
    expect(result.awaitingCustomerQuestion).toBe(true);
    expect(result.needsInviteCode).toBe(false);
    expect(result.reply).toMatch(/pergunta|diga/i);
    expect(result.reply).not.toMatch(/https?:\/\/|código de convite|cadastro agora/i);
  });

  it("lets a question request override an acknowledgement and keeps waiting through customer corrections", () => {
    const conv = conversation({
      language: "zh",
      flowStep: "registration_intent",
      awaitingCustomerQuestion: false
    });
    const firstText = "ok，在此之前我可以问你一个问题吗";
    const firstAnalysis = analyzeMessage(firstText, "zh");
    const firstContext = buildRuleContextualIntent({
      conversation: conv,
      analysis: firstAnalysis,
      customerText: firstText,
      inferredIntent: "positive_confirmation"
    });
    const first = buildStrictFlowReply({
      merchant,
      country,
      conversation: conv,
      analysis: firstAnalysis,
      customerText: firstText,
      inviteCode,
      config,
      inferredIntent: "positive_confirmation",
      contextualIntent: firstContext
    });

    expect(first.nextFlowStep).toBe("registration_intent");
    expect(first.needsInviteCode).toBe(false);
    expect(first.tutorialImageRequested).not.toBe(true);
    expect(first.awaitingCustomerQuestion).toBe(true);
    expect(first.replyPurpose).toBe("await_customer_question");
    expect(first.reply).toContain("直接说您的问题");
    expect(first.reply).not.toMatch(/https?:\/\/|邀请码|注册步骤/);

    conv.awaitingCustomerQuestion = true;
    const correction = reply("我说，我要问你问题！", conv);
    expect(correction.nextFlowStep).toBe("registration_intent");
    expect(correction.awaitingCustomerQuestion).toBe(true);
    expect(correction.replyPurpose).toBe("await_customer_question");
    expect(correction.reply).toMatch(/先.*问题|直接问|说完/);
    expect(correction.reply).not.toMatch(/手机号|注册步骤|https?:\/\//);

    const comprehension = reply("你能听懂吗？", conv);
    expect(comprehension.nextFlowStep).toBe("registration_intent");
    expect(comprehension.awaitingCustomerQuestion).toBe(true);
    expect(comprehension.reply).toMatch(/听懂|问题/);
    expect(comprehension.reply).not.toMatch(/手机号|注册步骤|https?:\/\//);
  });

  it("answers the pending concrete question without a registration push, then resumes only on an explicit request", () => {
    const pending = conversation({
      language: "zh",
      flowStep: "registration_intent",
      awaitingCustomerQuestion: true
    });
    const question = reply("你们是正规公司吗？", pending);

    expect(question.nextFlowStep).toBe("registration_intent");
    expect(question.awaitingCustomerQuestion).toBe(true);
    expect(question.replyPurpose).toBe("answer_customer_question");
    expect(question.controlledQuestionType).toBe("trust");
    expect(question.reply).toMatch(/风险|规则|核实|确认/);
    expect(question.reply).not.toMatch(/有空|继续.*注册|开户链接|邀请码/);

    const acknowledgement = reply("ok", pending);
    expect(acknowledgement.nextFlowStep).toBe("registration_intent");
    expect(acknowledgement.awaitingCustomerQuestion).toBe(true);
    expect(acknowledgement.reply).toContain("还有疑问");
    expect(acknowledgement.reply).not.toMatch(/开户链接|邀请码|注册步骤/);

    const resume = reply("问题问完了，继续注册", pending);
    expect(resume.nextFlowStep).toBe("wait_registration");
    expect(resume.needsInviteCode).toBe(true);
    expect(resume.reply).toContain("ABC123");

    const naturalResume = reply("好的，没问题了，我们继续吧", pending);
    expect(naturalResume.nextFlowStep).toBe("wait_registration");
    expect(naturalResume.reply).toContain("ABC123");
  });

  it("lets a temporary pause request override a stale pending-question state", () => {
    const result = reply("我现在暂时没空，可以等我一下吗", {
      language: "zh",
      flowStep: "registration_intent",
      awaitingCustomerQuestion: true
    });

    expect(result.nextFlowStep).toBe("registration_intent");
    expect(result.flowHoldReason).toBe("temporary_pause");
    expect(result.awaitingCustomerQuestion).not.toBe(true);
    expect(result.controlledQuestionType).toBe("none");
    expect(result.reply).toMatch(/先忙|有空|方便|继续/);
    expect(result.reply).not.toMatch(/项目|工作|佣金|邀请码|现在有时间继续/);
  });

  it("resumes from a temporary pause without mistaking colloquial availability for registration completion", () => {
    const result = reply("好了，我现在有空了", {
      language: "zh",
      flowStep: "registration_intent",
      flowHoldReason: "temporary_pause"
    });

    expect(result.flowHoldReason).toBe("");
    expect(result.nextFlowStep).toBe("wait_registration");
    expect(result.needsInviteCode).toBe(true);
    expect(result.reply).toContain("https://register.example/?code=ABC123");
    expect(result.reply).toContain("ABC123");
    expect(result.reply).not.toMatch(/注册时使用的手机号|注册手机号/);
  });

  it.each([
    "interest_screening",
    "project_intro",
    "registration_intent",
    "send_register_link",
    "wait_registration",
    "telegram_confirm",
    "telegram_download",
    "collect_telegram"
  ] as const)("pauses %s while the customer is preparing to ask a question", (flowStep) => {
    const result = reply("在继续之前，我要先问一个问题", {
      language: "zh",
      flowStep,
      extractedPhone: flowStep.startsWith("telegram") || flowStep === "collect_telegram" ? "987654321" : ""
    });

    expect(result.nextFlowStep).toBe(flowStep);
    expect(result.awaitingCustomerQuestion).toBe(true);
    expect(result.needsInviteCode).toBe(false);
    expect(result.tutorialImageRequested).not.toBe(true);
    expect(result.reply).toContain("直接说您的问题");
    expect(result.reply).not.toMatch(/https?:\/\/|邀请码|注册步骤|注册手机号/);
  });

  it("answers distinct Telegram purpose and necessity questions without changing the node", () => {
    const purpose = reply("为什么要使用这个软件呢", {
      language: "zh",
      flowStep: "telegram_download",
      extractedPhone: "9876789"
    });
    expect(purpose.nextFlowStep).toBe("telegram_download");
    expect(purpose.reply).toContain("导师");
    expect(purpose.reply).toContain("任务指导");
    expect(purpose.reply).not.toContain("下载后告诉我");

    const optional = reply("我可以不使用这个软件吗", {
      language: "zh",
      flowStep: "telegram_download",
      extractedPhone: "9876789"
    });
    expect(optional.nextFlowStep).toBe("telegram_download");
    expect(optional.reply).toContain("需要使用 Telegram");
    expect(optional.reply).toContain("不会要求");
    expect(optional.reply).not.toMatch(/^当然可以/);

    const required = reply("为什么这个软件是必须的呢", {
      language: "zh",
      flowStep: "telegram_download",
      extractedPhone: "9876789"
    });
    expect(required.nextFlowStep).toBe("telegram_download");
    expect(required.reply).toContain("后续指导");
    expect(required.reply).toContain("Telegram");
    expect(required.reply).not.toBe(purpose.reply);
    expect(required.reply).not.toBe(optional.reply);
  });

  it("classifies a missing app from the Telegram download context", () => {
    const result = reply("我没有这个应用", {
      language: "zh",
      flowStep: "telegram_download",
      extractedPhone: "9876789"
    });

    expect(result.nextFlowStep).toBe("telegram_download");
    expect(result.contextualIntent?.intent).toBe("no_telegram");
    expect(result.reply).toContain("应用商店");
  });

  it("sends the teacher Telegram link when Spanish customer confirms Telegram is available", () => {
    const result = replyWithRuntime(
      "Sí",
      { language: "es", flowStep: "telegram_confirm", extractedPhone: "65432345" },
      { inviteCode, teacherTelegramLink: "https://t.me/profesora_bo" }
    );

    expect(result.nextFlowStep).toBe("human_handoff");
    expect(result.reply).toContain("https://t.me/profesora_bo");
    expect(result.reply).toContain("profesora");
    expect(result.reply).not.toContain("¿Tiene la aplicación Telegram?");
    expect(result.reply).not.toContain("¿usted ya cuenta con una cuenta de Telegram");
  });

  it("does not skip Telegram download when Spanish customer says they do not have Telegram", () => {
    const result = replyWithRuntime(
      "No lo tengo, ¿por qué tengo que usar este software?",
      { language: "es", flowStep: "telegram_confirm", extractedPhone: "37639628" },
      { inviteCode, teacherTelegramLink: "https://t.me/profesora_bo" }
    );

    expect(result.nextFlowStep).toBe("telegram_download");
    expect(result.stage).toBe("need_tg_register");
    expect(result.reply).toContain("Telegram");
    expect(result.reply).toMatch(/Play Store|App Store/i);
    expect(result.reply).not.toContain("https://t.me/profesora_bo");
    expect(result.reply).not.toContain("salario neto");
  });

  it("returns from Telegram steps to registration when customer says registration is not complete", () => {
    const result = replyWithRuntime(
      "Todavía no he logrado registrarme.",
      { language: "es", flowStep: "telegram_confirm", extractedPhone: "37639628" },
      { inviteCode, teacherTelegramLink: "https://t.me/profesora_bo" }
    );

    expect(result.nextFlowStep).toBe("wait_registration");
    expect(result.stage).toBe("need_platform_register");
    expect(result.contextualIntent?.intent).toBe("not_registered");
    expect(result.reply).toMatch(/registro|registr/i);
    expect(result.reply).not.toContain("Telegram");
    expect(result.reply).not.toContain("https://t.me/profesora_bo");
  });

  it("answers Spanish registration-step questions without advancing to Telegram", () => {
    const result = replyWithRuntime(
      "Ya pude abrirlo. ¿Cómo debo registrarme?",
      { language: "es", flowStep: "wait_registration" },
      { inviteCode }
    );

    expect(result.nextFlowStep).toBe("wait_registration");
    expect(result.stage).toBe("need_platform_register");
    expect(result.reply).toContain("Pasos para registrarse");
    expect(result.reply).toContain("Código de invitación");
    expect(result.reply).not.toContain("¿Tiene la aplicación Telegram");
  });

  it("does not move to wait registration when the invite code pool is empty", () => {
    const result = replyWithRuntime("Sí", { language: "es", flowStep: "registration_intent" });

    expect(result.nextFlowStep).toBe("registration_intent");
    expect(result.reply).toContain("código de invitación");
    expect(result.reply).toContain("Espere un momento");
    expect(result.reply).not.toContain("Enlace de registro");
    expect(result.reply).not.toContain("¿ya completó el registro?");
  });

  it("does not leak blank invite variables or built-in registration steps for active script flows", () => {
    const customSpanishFlow: ScriptFlowRuntime = {
      ...scriptFlow,
      steps: [
        {
          ...scriptFlow.steps[0],
          flowCode: "4",
          flowName: "确认意向",
          flowStep: "registration_intent",
          standardReply: "¿Tiene tiempo libre ahora para continuar con el registro?",
          nextFlowCode: "5",
          nextFlowStep: "send_register_link"
        },
        {
          ...scriptFlow.steps[1],
          flowCode: "5",
          flowName: "发送链接",
          flowStep: "send_register_link",
          standardReply: "Perfecto, ahora le enviaré el enlace y el código de invitación.\n\nEnlace de registro: {{REGISTER_URL}}\nCódigo de invitación: {{INVITE_CODE}}\n\nPasos para registrarse:\n1. Abra el enlace en el navegador.\n2. Ingrese su número de teléfono.",
          sendLink: true,
          sendInvite: true,
          nextFlowCode: "6",
          nextFlowStep: "wait_registration"
        }
      ]
    };
    const result = buildStrictFlowReply({
      merchant,
      country: { ...country, defaultLanguage: "es" },
      conversation: conversation({ language: "es", flowStep: "registration_intent" }),
      analysis: analyzeMessage("Sí", "es"),
      customerText: "Sí",
      config,
      scriptFlow: customSpanishFlow
    });

    expect(result.nextFlowStep).toBe("registration_intent");
    expect(result.fallback).toBe(false);
    expect(result.reply).toContain("código de invitación");
    expect(result.reply).not.toContain("Código de invitación:");
    expect(result.reply).not.toContain("Pasos para registrarse");
    expect(result.reply).not.toContain("Abra el enlace");
    expect(result.reply).not.toContain("¿Me lo puede facilitar");
    expect(result.reply).not.toContain("a mano");
  });

  it("treats Spanish completed-registration words as done and asks for the registered phone", () => {
    const result = replyWithRuntime("finalizado", { language: "es", flowStep: "registration_intent" }, { inviteCode });

    expect(result.nextFlowStep).toBe("wait_registration");
    expect(result.reply).toMatch(/tel[eé]fono|n[uú]mero/i);
    expect(result.reply).not.toContain("Enlace de registro");
    expect(result.reply).not.toContain("Código de invitación");
  });

  it("does not treat short numeric fragments as contextual registration phones", () => {
    expect(detectContextualRegistrationPhone("6543234", "wait_registration")).toBe("");
    expect(detectContextualRegistrationPhone("65432345", "wait_registration")).toBe("65432345");
  });

  it("guides customers to find or set a Telegram username", () => {
    const findUsername = reply("怎么找用户名", { language: "zh", flowStep: "collect_telegram", extractedPhone: "9876789" });
    expect(findUsername.nextFlowStep).toBe("collect_telegram");
    expect(findUsername.reply).toContain("打开 Telegram");
    expect(findUsername.reply).toContain("设置");
    expect(findUsername.reply).toContain("Username");
    expect(findUsername.reply).toContain("@ 开头");
    expect(findUsername.contextualIntent?.intent).toBe("telegram_username_help");
    expect(findUsername.contextualIntent?.nextAction).toBe("guide telegram username setup");

    const noAt = reply("我没有@", { language: "zh", flowStep: "collect_telegram", extractedPhone: "9876789" });
    expect(noAt.nextFlowStep).toBe("collect_telegram");
    expect(noAt.reply).toContain("用户名");
    expect(noAt.reply).toContain("保存后");
    expect(noAt.reply).not.toContain("不继续打扰");

    const installedButLost = reply("装好了，但不知道用户名在哪", { language: "zh", flowStep: "telegram_download", extractedPhone: "9876789" });
    expect(installedButLost.nextFlowStep).toBe("collect_telegram");
    expect(installedButLost.reply).toContain("Username");
    expect(installedButLost.reply).toContain("@ 开头");

    const englishLostUsername = reply("I've downloaded it, but I couldn't find a username starting with @.", { language: "en", flowStep: "telegram_download", extractedPhone: "456789098" });
    expect(englishLostUsername.nextFlowStep).toBe("collect_telegram");
    expect(englishLostUsername.contextualIntent?.intent).toBe("telegram_username_help");
    expect(englishLostUsername.reply).toContain("Open Telegram");
    expect(englishLostUsername.reply).toContain("Settings");
    expect(englishLostUsername.reply).toContain("Username");
    expect(englishLostUsername.reply).toContain("@");

    const plainNoInUsernameStep = reply("没有", { language: "zh", flowStep: "collect_telegram", extractedPhone: "9876789" });
    expect(plainNoInUsernameStep.nextFlowStep).toBe("collect_telegram");
    expect(plainNoInUsernameStep.reply).toContain("用户名");
    expect(plainNoInUsernameStep.reply).toContain("设置");
    expect(plainNoInUsernameStep.reply).not.toContain("先不继续打扰");

    const needsSetup = reply("是需要设置吗", { language: "zh", flowStep: "collect_telegram", extractedPhone: "9876789" });
    expect(needsSetup.nextFlowStep).toBe("collect_telegram");
    expect(needsSetup.reply).toContain("设置");
    expect(needsSetup.reply).toContain("@ 开头");

    const android = reply("我的安卓手机", { language: "zh", flowStep: "collect_telegram", extractedPhone: "9876789" });
    expect(android.nextFlowStep).toBe("collect_telegram");
    expect(android.reply).toContain("安卓手机");
    expect(android.reply).toContain("左上角");
    expect(android.reply).toContain("设置");

    const registeredButNoUsername = reply("注册好了，但是没找到@开头的用户名", { language: "zh", flowStep: "collect_telegram", extractedPhone: "9876789" });
    expect(registeredButNoUsername.nextFlowStep).toBe("collect_telegram");
    expect(registeredButNoUsername.reply).toContain("用户名");
    expect(registeredButNoUsername.reply).toContain("设置");

    const anotherQuestion = reply("我还有一个问题", { language: "zh", flowStep: "collect_telegram", extractedPhone: "9876789" });
    expect(anotherQuestion.nextFlowStep).toBe("collect_telegram");
    expect(anotherQuestion.reply).toContain("直接说您的问题");
    expect(anotherQuestion.reply).not.toContain("老师的 Telegram 链接");
    expect(anotherQuestion.reply).not.toContain("充值");
  });

  it("does not resend the full registration package for a plain ok while waiting for registration", () => {
    const result = reply("ok", { language: "en", flowStep: "wait_registration" });
    expect(result.nextFlowStep).toBe("wait_registration");
    expect(result.contextualIntent?.intent).toBe("acknowledgement");
    expect(result.reply).toContain("After registration");
    expect(result.reply).toContain("If you get stuck");
    expect(result.reply).not.toContain("Registration link");
    expect(result.reply).not.toContain("Invitation code");
    expect(result.reply).not.toContain("Registration steps");
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

  it("keeps wait-registration replies natural and does not repeat the same phone prompt", () => {
    const ack = reply("好的", { language: "zh", flowStep: "wait_registration" });
    expect(ack.nextFlowStep).toBe("wait_registration");
    expect(ack.reply).toContain("先按页面操作");
    expect(ack.reply).toContain("卡在哪一步");
    expect(ack.reply).not.toBe("请告知我您是否已完成注册。完成后，请将您注册的手机号码发送给我，以便我们进行验证。");
    expect(ack.contextualIntent?.intent).toBe("acknowledgement");

    const help = reply("教我怎么注册", { language: "zh", flowStep: "wait_registration" });
    expect(help.nextFlowStep).toBe("wait_registration");
    expect(help.reply).toContain("开户链接");
    expect(help.reply).toContain("邀请码");
    expect(help.reply).toContain("注册步骤");
  });

  it("does not send registration details when the customer asks for more job information", () => {
    const result = reply("你能为我提供更多的信息么", { language: "zh", flowStep: "registration_intent" });

    expect(result.nextFlowStep).toBe("registration_intent");
    expect(result.reply).toContain("具体任务细节");
    expect(result.reply).toContain("方便继续注册");
    expect(result.reply).not.toContain("开户链接");
    expect(result.reply).not.toContain("邀请码");
  });

  it("does not prematurely send link or invite when registration help is requested before the customer is ready", () => {
    const result = reply("我不太会注册，你可以教我吗", { language: "zh", flowStep: "registration_intent" });

    expect(result.nextFlowStep).toBe("registration_intent");
    expect(result.reply).toContain("现在方便操作");
    expect(result.reply).not.toContain("开户链接");
    expect(result.reply).not.toContain("邀请码");
    expect(result.needsInviteCode).toBe(false);
  });

  it("resends full registration steps while waiting for registration", () => {
    const stepQuestion = reply("注册流程是什么", { language: "zh", flowStep: "wait_registration" });
    expect(stepQuestion.nextFlowStep).toBe("wait_registration");
    expect(stepQuestion.reply).toContain("开户链接");
    expect(stepQuestion.reply).toContain("邀请码");
    expect(stepQuestion.reply).toContain("注册步骤");
    expect(stepQuestion.reply).toContain("填写手机号码");

    const resend = reply("请把注册步骤发给我", { language: "zh", flowStep: "wait_registration" });
    expect(resend.reply).toContain("开户链接");
    expect(resend.reply).toContain("邀请码");
    expect(resend.reply).toContain("注册步骤");

    const walkthrough = reply("再走一遍流程", { language: "zh", flowStep: "wait_registration" });
    expect(walkthrough.reply).toContain("开户链接");
    expect(walkthrough.reply).toContain("邀请码");
    expect(walkthrough.reply).toContain("注册步骤");
  });

  it("answers registration blockers before pushing the customer to the next flow step", () => {
    const linkProblem = reply("链接打不开怎么办", { language: "zh", flowStep: "wait_registration" });
    expect(linkProblem.nextFlowStep).toBe("wait_registration");
    expect(linkProblem.reply).toContain("浏览器");
    expect(linkProblem.reply).toContain("完整链接");
    expect(linkProblem.reply).not.toContain("请告知我您是否已完成注册");

    const codeProblem = reply("验证码收不到", { language: "zh", flowStep: "wait_registration" });
    expect(codeProblem.nextFlowStep).toBe("wait_registration");
    expect(codeProblem.reply).toContain("验证码");
    expect(codeProblem.reply).toContain("截图");
    expect(codeProblem.reply).not.toContain("开户注册");

    const pageProblem = reply("页面报错提交不了", { language: "zh", flowStep: "wait_registration" });
    expect(pageProblem.nextFlowStep).toBe("wait_registration");
    expect(pageProblem.reply).toContain("页面提示");
    expect(pageProblem.reply).toContain("不要乱点");
    expect(pageProblem.reply).not.toContain("Telegram");
  });

  it("resends the same full registration package when invite code or steps are missing to the customer", () => {
    const missingInvite = reply("我没看到邀请码哦", { language: "zh", flowStep: "wait_registration" });
    expect(missingInvite.nextFlowStep).toBe("wait_registration");
    expect(missingInvite.reply).toContain("开户链接");
    expect(missingInvite.reply).toContain("邀请码");
    expect(missingInvite.reply).toContain("ABC123");
    expect(missingInvite.reply).toContain("注册步骤");
    expect(missingInvite.reply).not.toContain("正在确认");

    const missingSteps = reply("也没看到注册流程", { language: "zh", flowStep: "wait_registration" });
    expect(missingSteps.reply).toContain("开户链接");
    expect(missingSteps.reply).toContain("邀请码");
    expect(missingSteps.reply).toContain("注册步骤");
    expect(missingSteps.reply).toContain("填写手机号码");
    expect(missingSteps.reply).not.toContain("正在确认");
  });

  it("guides the first registration action when the customer is ready in wait-registration", () => {
    const result = reply("方便", { language: "zh", flowStep: "wait_registration" });

    expect(result.nextFlowStep).toBe("wait_registration");
    expect(result.reply).toContain("第一步");
    expect(result.reply).toContain("打开");
    expect(result.reply).toContain("开户链接");
    expect(result.reply).toContain("邀请码");
  });

  it("keeps waiting for phone when registration is done without a phone number", () => {
    const result = reply("注册好了", { language: "zh", flowStep: "wait_registration" });

    expect(result.nextFlowStep).toBe("wait_registration");
    expect(result.reply).toContain("注册的手机号码");
    expect(result.reply).not.toContain("Telegram");
  });

  it("answers registration field questions without resending link or invite", () => {
    const username = reply("用户名需要我真实的名字吗", { language: "zh", flowStep: "wait_registration" });
    expect(username.nextFlowStep).toBe("wait_registration");
    expect(username.reply).toContain("用户名");
    expect(username.reply).toContain("不一定");
    expect(username.reply).toContain("真实姓名");
    expect(username.reply).not.toContain("开户链接");
    expect(username.reply).not.toContain("邀请码");
    expect(username.contextualIntent?.intent).toBe("registration_field_question");

    const phone = reply("注册流程中填写的手机号要我真实的手机号吗", { language: "zh", flowStep: "wait_registration" });
    expect(phone.nextFlowStep).toBe("wait_registration");
    expect(phone.reply).toContain("手机号");
    expect(phone.reply).toContain("正常使用");
    expect(phone.reply).toContain("核对");
    expect(phone.reply).not.toContain("注册步骤");
    expect(phone.reply).not.toContain("邀请码");

    const combined = reply("用户名需要我真实的名字吗\n注册流程中填写的手机号要我真实的手机号吗", { language: "zh", flowStep: "wait_registration" });
    expect(combined.reply).toContain("用户名");
    expect(combined.reply).toContain("手机号");
    expect(combined.reply).not.toContain("开户链接");
    expect(combined.reply).not.toContain("邀请码");
  });

  it("recovers from customer complaint that a registration field question was not answered", () => {
    const result = reply("回答我的问题", { language: "zh", flowStep: "wait_registration" });

    expect(result.nextFlowStep).toBe("wait_registration");
    expect(result.reply).toContain("刚才没有回答清楚");
    expect(result.reply).toContain("用户名");
    expect(result.reply).toContain("手机号");
    expect(result.reply).not.toContain("开户链接");
    expect(result.reply).not.toContain("邀请码");
  });

  it("does not advance to Telegram when registration message contains an incomplete phone", () => {
    const incomplete = reply("4567890 注册好了", { language: "zh", flowStep: "wait_registration" });
    expect(incomplete.nextFlowStep).toBe("wait_registration");
    expect(incomplete.reply).toContain("手机号好像不完整");
    expect(incomplete.reply).toContain("完整手机号");
    expect(incomplete.contextualIntent?.intent).toBe("incomplete_phone");

    const complete = reply("918273718271 注册好了", { language: "zh", flowStep: "wait_registration" });
    expect(complete.nextFlowStep).toBe("telegram_confirm");
    expect(complete.reply).toContain("Telegram");
  });

  it.each([
    "如何注册",
    "我不会，有教程吗",
    "怎么注册",
    "我打开了不懂怎么注册",
    "请把注册步骤发给我",
    "注册流程是什么",
    "再走一遍流程"
  ])("requests the configured registration tutorial image for registration help: %s", (text) => {
    const analysis = analyzeMessage(text, "zh");
    const conv = conversation({ language: "zh", flowStep: "wait_registration" });
    const result = buildStrictFlowReply({
      merchant,
      country,
      conversation: conv,
      analysis,
      customerText: text,
      inviteCode,
      config: { ...config, REGISTRATION_TUTORIAL_IMAGE_URL: "https://cdn.example/tutorial.jpg" } as AppConfig,
      contextualIntent: buildRuleContextualIntent({ conversation: conv, analysis, customerText: text })
    });

    expect(result.nextFlowStep).toBe("wait_registration");
    expect(result.reply).toContain("注册步骤");
    expect(result.reply).toContain("邀请码");
    expect(result.reply).not.toContain("教程图片");
    expect(result.tutorialImageRequested).toBe(true);
  });

  it("treats analyzed image messages as registration screenshots instead of invite-code fallback", () => {
    const result = reply("[图片] 客户发送了注册页面截图，页面提示链接无法打开", { language: "zh", flowStep: "wait_registration" });

    expect(result.nextFlowStep).toBe("wait_registration");
    expect(result.reply).toContain("截图");
    expect(result.reply).toContain("打开或加载");
    expect(result.reply).not.toContain("正在确认您的专属邀请码");
  });

  it("answers whether it can read an image in the registration step", () => {
    const result = reply("你能识别我发送的图片是什么意思吗", { language: "zh", flowStep: "wait_registration" });

    expect(result.nextFlowStep).toBe("wait_registration");
    expect(result.reply).toContain("图片");
    expect(result.reply).toContain("提示文字");
    expect(result.reply).not.toContain("看不到");
  });
});
