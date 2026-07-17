import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { analyzeMessage } from "../src/domain/analyzer.js";
import { buildRuleContextualIntent } from "../src/domain/strictFlow.js";
import { defaultStrictFlowRuntime, nextStrictFlowTurn } from "../src/domain/strictFlowRuntime.js";
import { flowScriptLine, flowScriptLines } from "../src/domain/strictFlowScriptRuntime.js";
import { buildInterestProgressReplyParts } from "../src/domain/strictFlowResponseBuilder.js";
import type { A2CInviteCodeRecord, Conversation, MerchantCountryRecord, MerchantRecord } from "../src/repositories.js";
import type { StrictFlowInput } from "../src/domain/strictFlowTypes.js";

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
    flowStep: "interest_screening",
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

function nextTurn(text: string, overrides: Partial<Conversation> = {}, withInvite = true) {
  const conv = conversation(overrides);
  const analysis = analyzeMessage(text, conv.language);
  return nextStrictFlowTurn({
    merchant,
    country,
    conversation: conv,
    analysis,
    customerText: text,
    inviteCode: withInvite ? inviteCode : undefined,
    config,
    strictFlowEnabled: true,
    inferredIntent: "unknown",
    contextualIntent: buildRuleContextualIntent({
      conversation: conv,
      analysis,
      customerText: text
    })
  });
}

describe("strict flow runtime", () => {
  it("keeps every configured project-intro part, including multiple intro nodes", () => {
    const step = (id: number, sortOrder: number, standardReply: string, replyParts?: string[]) => ({
      id,
      flowId: 1,
      merchantId: merchant.id,
      countryId: country.id,
      flowCode: String(sortOrder),
      flowName: "项目介绍",
      flowStep: "project_intro",
      goal: "介绍项目",
      triggerCondition: "客户有兴趣",
      customerExpressions: "是的",
      standardReply,
      replyParts,
      collectInfo: "",
      sendLink: false,
      sendInvite: false,
      sendTutorialImage: false,
      nextCondition: "介绍完成",
      nextFlowCode: "4",
      nextFlowStep: "registration_intent",
      forbidden: "",
      notes: "",
      sortOrder,
      enabled: true,
      createdAt: "",
      updatedAt: ""
    });
    const input: StrictFlowInput = {
      merchant,
      country,
      conversation: conversation(),
      analysis: analyzeMessage("yes", "pt"),
      customerText: "yes",
      config,
      scriptFlow: {
        flow: {
          id: 1,
          merchantId: merchant.id,
          countryId: country.id,
          countryCode: country.code,
          countryName: country.name,
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
          step(1, 1, "第一条", ["第一条", "第二条"]),
          step(2, 2, "Certo, vou explicar rapidamente: este trabalho online ajuda comerciantes a melhorar vendas e ranqueamento de produtos, e a comissão depende das tarefas. Os ganhos seguem as regras da plataforma. Você tem tempo para continuar o cadastro agora?")
        ]
      }
    };
    const lines = flowScriptLines(input, "project_intro", "pt");

    expect(lines).toEqual(["第一条", "第二条", "Certo, vou explicar rapidamente: este trabalho online ajuda comerciantes a melhorar vendas e ranqueamento de produtos, e a comissão depende das tarefas. Os ganhos seguem as regras da plataforma. Você tem tempo para continuar o cadastro agora?"]);
    expect(buildInterestProgressReplyParts(input, "interest_screening", "yes", "pt"))
      .toEqual(["第一条", "第二条", "Você tem tempo agora para continuar o cadastro da conta?"]);
  });

  it("advances an interested customer to the registration-intent step without sending a link", () => {
    const result = nextTurn("是的", { flowStep: "interest_screening" });

    expect(result.enabled).toBe(true);
    expect(result.nextFlowStep).toBe("registration_intent");
    expect(result.needsInviteCode).toBe(false);
    expect(result.reply).toContain("兼职");
    expect(result.reply).not.toContain("https://register.example");
    expect(result.reply).not.toContain("INV-001");
  });

  it("sends the preserved registration link and invite only after the customer is ready to register", () => {
    const result = nextTurn("方便", { flowStep: "registration_intent" });

    expect(result.nextFlowStep).toBe("wait_registration");
    expect(result.needsInviteCode).toBe(true);
    expect(result.reply).toContain("https://register.example/?code=INV-001");
    expect(result.reply).toContain("邀请码：INV-001");
  });

  it("asks only for the registered phone after completion instead of replaying the wait node", () => {
    const input: StrictFlowInput = {
      merchant,
      country,
      conversation: conversation({ flowStep: "wait_registration" }),
      analysis: analyzeMessage("我注册好了", "pt-BR"),
      customerText: "我注册好了",
      config,
      scriptFlow: {
        flow: {
          id: 9,
          merchantId: merchant.id,
          countryId: country.id,
          countryCode: country.code,
          countryName: country.name,
          name: "严格业务流程",
          status: "active",
          active: true,
          version: 11,
          sourceFilename: "",
          stepCount: 1,
          createdAt: "",
          updatedAt: ""
        },
        steps: [{
          id: 81,
          flowId: 9,
          merchantId: merchant.id,
          countryId: country.id,
          flowCode: "6",
          flowName: "等待注册",
          flowStep: "wait_registration",
          goal: "等待客户完成注册",
          triggerCondition: "已发送注册资料",
          customerExpressions: "注册好了",
          standardReply: "Por favor, informe-me se você concluiu o registro. Após a conclusão, envie-me o número de telefone que você registrou para que possamos realizar a verificação.",
          collectInfo: "注册手机号",
          sendLink: false,
          sendInvite: false,
          sendTutorialImage: false,
          nextCondition: "客户提交手机号",
          nextFlowCode: "7",
          nextFlowStep: "telegram_confirm",
          forbidden: "",
          notes: "",
          sortOrder: 6,
          enabled: true,
          createdAt: "",
          updatedAt: ""
        }]
      }
    };

    const line = flowScriptLine(input, "ask_registered_phone", "pt-BR");

    expect(line).toBe("Certo, envie o número de telefone usado no cadastro para fazermos a verificação.");
    expect(line).not.toContain("se você concluiu");
  });

  it("exposes a default runtime engine for application services", () => {
    const direct = nextTurn("是的", { flowStep: "interest_screening" });
    const viaEngine = defaultStrictFlowRuntime.nextTurn({
      merchant,
      country,
      conversation: conversation({ flowStep: "interest_screening" }),
      analysis: analyzeMessage("是的", "zh"),
      customerText: "是的",
      inviteCode,
      config,
      strictFlowEnabled: true
    });

    expect(viaEngine.nextFlowStep).toBe(direct.nextFlowStep);
    expect(viaEngine.stage).toBe(direct.stage);
    expect(viaEngine.needsInviteCode).toBe(direct.needsInviteCode);
  });
});
