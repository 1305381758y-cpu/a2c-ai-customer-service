import { describe, expect, it, vi } from "vitest";
import type { A2CClient } from "../src/clients/a2c.js";
import { loadConfig } from "../src/config.js";
import type { StrictFlowReply } from "../src/domain/strictFlow.js";
import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";
import { sendStrictFlowTextOutbound } from "../src/services/strictFlowTextOutbound.js";

function runtimeConfig() {
  return loadConfig({
    DATABASE_URL: ":memory:",
    A2C_BASE_URL: "https://a2c.test",
    A2C_APP_ID: "app",
    A2C_APP_SECRET: "secret"
  });
}

function aiStub() {
  return {
    naturalizeStrictFlowText: vi.fn(async (_config, input) => ({
      text: `${input.draftReply}（自然表达）`,
      used: true,
      error: ""
    }))
  };
}

function setupConversation() {
  const repos = new Repositories(openDb(":memory:"));
  const merchant = repos.createMerchant("严格流程文本出站商户");
  const country = repos.createMerchantCountry(merchant.id, {
    name: "巴西",
    defaultLanguage: "zh",
    platformRegisterUrl: "https://register.example",
    requirePlatformAccount: true,
    requirePhone: true,
    requireTelegram: true
  });
  const account = repos.syncMerchantA2CAccounts(merchant.id, [{
    apiPhone: "agent-text",
    verifiedName: "客服号"
  }])[0];
  const inviteCode = repos.createInviteCodeForA2CAccount(account.id, {
    code: "INV-TEXT",
    registerUrl: "https://register.example/?code={code}",
    status: "reserved"
  }, merchant.id);
  const conversation = repos.getOrCreateConversation("customer-text", "agent-text", "客户", merchant.id, country.id);
  conversation.language = "zh";
  conversation.stage = "need_platform_register";
  conversation.flowStep = "wait_registration";
  repos.updateConversation(conversation);
  return {
    repos,
    merchant,
    country,
    inviteCode,
    conversation,
    agentProfile: repos.getMerchantAgentProfile(merchant.id)
  };
}

describe("strict flow text outbound module", () => {
  it("preserves the pending-question purpose when naturalization and translation fail", async () => {
    const context = setupConversation();
    context.conversation.language = "pt-BR";
    context.conversation.flowStep = "registration_intent";
    context.conversation.awaitingCustomerQuestion = true;
    context.repos.updateConversation(context.conversation);
    const scriptFlow = context.repos.createScriptFlow(context.merchant.id, {
      name: "启用话本",
      countryId: context.country.id,
      steps: [{
        flowCode: "A",
        flowName: "确认注册意向",
        flowStep: "registration_intent",
        standardReply: "话本节点",
        sortOrder: 1
      }]
    });
    scriptFlow.flow.active = true;
    const ai = {
      naturalizeStrictFlowText: vi.fn(async () => ({
        text: "好的，我简单介绍一下这份工作。您现在有空继续注册吗？",
        used: true,
        error: ""
      }))
    };
    const strictReply: StrictFlowReply = {
      enabled: true,
      reply: "Claro, pode dizer sua pergunta diretamente. Vou responder primeiro.",
      language: "pt-BR",
      nextFlowStep: "registration_intent",
      stage: "need_platform_register",
      needsInviteCode: false,
      controlledQuestionType: "chat",
      awaitingCustomerQuestion: true,
      replyPurpose: "await_customer_question"
    };

    const result = await sendStrictFlowTextOutbound({
      ...context,
      ai: ai as never,
      runtimeConfig: runtimeConfig(),
      a2c: { sendMessage: vi.fn() } as unknown as A2CClient,
      strictReply,
      customerText: "我可以先问你个问题吗",
      history: [],
      data: {
        messageId: "inbound-pending-question",
        content: "我可以先问你个问题吗",
        from: "customer-text",
        to: "agent-text",
        msgType: "text",
        timestamp: 1783010000
      },
      payloadId: "payload-pending-question",
      simulation: true,
      strictFlowEnabled: true,
      scriptFlow,
      learnedIntent: null
    });

    expect(result.refinedReply.reply).toMatch(/pergunta/i);
    expect(result.refinedReply.reply).not.toMatch(/explicar rapidamente|continuar o cadastro agora/i);
    expect(ai.naturalizeStrictFlowText).not.toHaveBeenCalled();
  });

  it("removes a registration push added while answering a pending customer question", async () => {
    const context = setupConversation();
    context.conversation.language = "pt-BR";
    context.conversation.flowStep = "registration_intent";
    context.conversation.awaitingCustomerQuestion = true;
    context.repos.updateConversation(context.conversation);
    const scriptFlow = context.repos.createScriptFlow(context.merchant.id, {
      name: "启用话本",
      countryId: context.country.id,
      steps: [{
        flowCode: "A",
        flowName: "确认注册意向",
        flowStep: "registration_intent",
        standardReply: "话本节点",
        sortOrder: 1
      }]
    });
    scriptFlow.flow.active = true;
    const ai = {
      naturalizeStrictFlowText: vi.fn(async () => ({
        text: "Nesta etapa, não é necessário fazer pagamento privado. Você tem tempo para continuar o cadastro agora?",
        used: true,
        error: ""
      }))
    };
    const strictReply: StrictFlowReply = {
      enabled: true,
      reply: "Nesta etapa, não é necessário fazer pagamento privado. As regras posteriores devem seguir a página.",
      language: "pt-BR",
      nextFlowStep: "registration_intent",
      stage: "need_platform_register",
      needsInviteCode: false,
      controlledQuestionType: "payment",
      awaitingCustomerQuestion: true,
      replyPurpose: "answer_customer_question"
    };

    const result = await sendStrictFlowTextOutbound({
      ...context,
      ai: ai as never,
      runtimeConfig: runtimeConfig(),
      a2c: { sendMessage: vi.fn() } as unknown as A2CClient,
      strictReply,
      customerText: "需要我付款吗",
      history: [],
      data: {
        messageId: "inbound-pending-answer",
        content: "需要我付款吗",
        from: "customer-text",
        to: "agent-text",
        msgType: "text",
        timestamp: 1783010001
      },
      payloadId: "payload-pending-answer",
      simulation: true,
      strictFlowEnabled: true,
      scriptFlow,
      learnedIntent: null
    });

    expect(ai.naturalizeStrictFlowText).toHaveBeenCalledOnce();
    expect(result.refinedReply.reply).toContain("pagamento privado");
    expect(result.refinedReply.reply).not.toMatch(/continuar o cadastro agora/i);
  });

  it("naturalizes, records, and annotates strict-flow text replies in simulation", async () => {
    const context = setupConversation();
    const a2c = { sendMessage: vi.fn(async () => "real-message-id") } as unknown as A2CClient;
    const strictReply: StrictFlowReply = {
      enabled: true,
      reply: "好的，现在我会把链接和邀请码发给您。",
      language: "zh",
      nextFlowStep: "wait_registration",
      stage: "need_platform_register",
      needsInviteCode: true
    };

    const result = await sendStrictFlowTextOutbound({
      ...context,
      ai: aiStub() as never,
      runtimeConfig: runtimeConfig(),
      a2c,
      strictReply,
      customerText: "我准备好了",
      history: [],
      data: {
        messageId: "inbound-text",
        content: "我准备好了",
        from: "customer-text",
        to: "agent-text",
        msgType: "text",
        timestamp: 1783010000
      },
      payloadId: "payload-text",
      simulation: true,
      strictFlowEnabled: true,
      learnedIntent: null
    });

    expect(a2c.sendMessage).not.toHaveBeenCalled();
    expect(result.outbound.sendResult.a2cSendStatus).toBe("simulated");
    expect(result.refinedReply.naturalized.used).toBe(true);
    expect(strictReply.reply).toContain("自然表达");

    const message = context.repos.listConversationMessages(context.conversation.id, 10)
      .find((row) => row.direction === "outbound");
    expect(message?.content).toContain("自然表达");
    expect(message?.rawPayload).toMatchObject({
      replyMode: "strict_flow",
      strictFlow: true,
      strictFlowStep: "wait_registration",
      usedAiNaturalizer: true,
      a2cSendStatus: "simulated",
      assignedInviteCode: expect.objectContaining({ code: "INV-TEXT" })
    });

    const memory = context.repos.getCustomerMemoryByConversation(context.conversation.id);
    const recentSignals = memory?.facts.recentSignals as Array<{ content: string }> | undefined;
    expect(recentSignals?.map((signal) => signal.content).join("\n")).toContain("自然表达");
  });
});
