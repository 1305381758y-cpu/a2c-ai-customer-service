import { describe, expect, it, vi } from "vitest";
import type { A2CClient } from "../src/clients/a2c.js";
import { loadConfig } from "../src/config.js";
import { openDb } from "../src/db.js";
import { analyzeMessage } from "../src/domain/analyzer.js";
import { buildRuleContextualIntent } from "../src/domain/strictFlow.js";
import type { StrictFlowRuntimeContext, StrictFlowRuntimeEngine } from "../src/domain/strictFlowRuntime.js";
import { Repositories } from "../src/repositories.js";
import { generateAndRecordStrictFlowReply } from "../src/services/strictFlowReply.js";

function runtimeConfig(overrides: Record<string, string> = {}) {
  return loadConfig({
    DATABASE_URL: ":memory:",
    A2C_BASE_URL: "https://a2c.test",
    A2C_APP_ID: "app",
    A2C_APP_SECRET: "secret",
    ...overrides
  });
}

function aiStub() {
  return {
    naturalizeStrictFlowText: vi.fn(async (_config, input) => ({
      text: input.draftReply,
      used: false,
      error: ""
    }))
  };
}

function setupConversation(flowStep = "registration_intent") {
  const repos = new Repositories(openDb(":memory:"));
  const merchant = repos.createMerchant("严格流程商户");
  const country = repos.createMerchantCountry(merchant.id, {
    name: "巴西",
    defaultLanguage: "zh",
    platformRegisterUrl: "https://register.example",
    requirePlatformAccount: true,
    requirePhone: true,
    requireTelegram: true
  });
  const account = repos.syncMerchantA2CAccounts(merchant.id, [{
    apiPhone: "agent-1",
    wabaId: "waba-1",
    status: 1,
    numberStatus: 1,
    qualityRating: 1,
    messagingLimit: 1000,
    verifiedName: "客服号"
  }])[0];
  repos.createInviteCodeForA2CAccount(account.id, {
    code: "INV-1",
    registerUrl: "https://register.example/?code={code}",
    status: "available"
  }, merchant.id);
  repos.patchMerchantConfig(merchant.id, { strictScriptFlowEnabled: true, smartReplyEnabled: true });
  const conversation = repos.getOrCreateConversation("customer-1", "agent-1", "客户", merchant.id, country.id);
  conversation.language = "zh";
  conversation.flowStep = flowStep;
  conversation.stage = "need_platform_register";
  repos.updateConversation(conversation);
  return {
    repos,
    merchant,
    merchantConfig: repos.getMerchantConfig(merchant.id),
    country,
    conversation,
    agentProfile: repos.getMerchantAgentProfile(merchant.id)
  };
}

describe("strict flow reply module", () => {
  it("reserves the invite code, records strict-flow outbound state, and avoids real A2C in simulation", async () => {
    const context = setupConversation("registration_intent");
    const analysis = analyzeMessage("是的", "zh");
    const contextualIntent = buildRuleContextualIntent({
      conversation: context.conversation,
      analysis,
      customerText: "是的",
      inferredIntent: "positive_confirmation"
    });
    const a2c = { sendMessage: vi.fn(async () => "real-message-id") } as unknown as A2CClient;
    const telegram = { sendHandoffMessage: vi.fn<(text: string) => Promise<void>>(async () => undefined) };

    const result = await generateAndRecordStrictFlowReply({
      ...context,
      ai: aiStub() as never,
      runtimeConfig: runtimeConfig(),
      analysis,
      customerText: "是的",
      a2c,
      telegram,
      data: {
        messageId: "inbound-1",
        content: "是的",
        from: "customer-1",
        to: "agent-1",
        msgType: "text",
        timestamp: 1783010000
      },
      payloadId: "payload-1",
      simulation: true,
      strictFlowEnabled: true,
      inferredIntent: "positive_confirmation",
      contextualIntent,
      learnedIntent: null,
      history: []
    });

    expect(result).toEqual({ handled: true, status: "strict_flow_simulated", conversationId: context.conversation.id });
    expect(a2c.sendMessage).not.toHaveBeenCalled();
    const stored = context.repos.getConversation(context.conversation.id);
    expect(stored?.flowStep).toBe("wait_registration");
    const outbound = context.repos.listConversationMessages(context.conversation.id, 10).find((message) => message.direction === "outbound");
    expect(outbound?.content).toContain("邀请码：INV-1");
    expect(outbound?.rawPayload).toMatchObject({
      replyMode: "strict_flow",
      strictFlow: true,
      strictFlowStep: "wait_registration",
      a2cSendStatus: "simulated",
      assignedInviteCode: expect.objectContaining({ code: "INV-1", status: "reserved" })
    });
  });

  it("records the registration tutorial image in simulation without calling A2C", async () => {
    const context = setupConversation("wait_registration");
    context.repos.reserveInviteCodeForConversation(context.conversation);
    const analysis = analyzeMessage("我不会注册呀", "zh");
    const contextualIntent = buildRuleContextualIntent({
      conversation: context.conversation,
      analysis,
      customerText: "我不会注册呀",
      inferredIntent: "need_help"
    });
    const a2c = { sendMessage: vi.fn(async () => "real-message-id") } as unknown as A2CClient;
    const telegram = { sendHandoffMessage: vi.fn<(text: string) => Promise<void>>(async () => undefined) };

    const result = await generateAndRecordStrictFlowReply({
      ...context,
      ai: aiStub() as never,
      runtimeConfig: runtimeConfig({ REGISTRATION_TUTORIAL_IMAGE_URL: "https://cdn.example/tutorial.jpg" }),
      analysis,
      customerText: "我不会注册呀",
      a2c,
      telegram,
      data: {
        messageId: "inbound-help",
        content: "我不会注册呀",
        from: "customer-1",
        to: "agent-1",
        msgType: "text",
        timestamp: 1783010000
      },
      payloadId: "payload-help",
      simulation: true,
      strictFlowEnabled: true,
      inferredIntent: "need_help",
      contextualIntent,
      learnedIntent: null,
      history: []
    });

    expect(result.status).toBe("strict_flow_simulated");
    expect(a2c.sendMessage).not.toHaveBeenCalled();
    const messages = context.repos.listConversationMessages(context.conversation.id, 10).filter((message) => message.direction === "outbound");
    expect(messages).toHaveLength(2);
    expect(messages.some((message) => message.msgType === "image" && message.rawPayload?.registrationTutorialImage === true)).toBe(true);
  });

  it("uses an injected strict-flow runtime while preserving invite reservation and outbound recording", async () => {
    const context = setupConversation("registration_intent");
    const analysis = analyzeMessage("可以", "zh");
    const contextualIntent = buildRuleContextualIntent({
      conversation: context.conversation,
      analysis,
      customerText: "可以",
      inferredIntent: "positive_confirmation"
    });
    const nextTurn = vi.fn((input: StrictFlowRuntimeContext) => ({
      enabled: true,
      reply: `这是注入流程回复，邀请码 ${input.inviteCode?.code}`,
      language: "zh",
      nextFlowStep: "wait_registration" as const,
      stage: "need_platform_register" as const,
      needsInviteCode: true
    }));
    const strictFlowRuntime: StrictFlowRuntimeEngine = { nextTurn };
    const a2c = { sendMessage: vi.fn(async () => "real-message-id") } as unknown as A2CClient;
    const telegram = { sendHandoffMessage: vi.fn<(text: string) => Promise<void>>(async () => undefined) };

    const result = await generateAndRecordStrictFlowReply({
      ...context,
      ai: aiStub() as never,
      runtimeConfig: runtimeConfig(),
      analysis,
      customerText: "可以",
      a2c,
      telegram,
      data: {
        messageId: "inbound-runtime",
        content: "可以",
        from: "customer-1",
        to: "agent-1",
        msgType: "text",
        timestamp: 1783010000
      },
      payloadId: "payload-runtime",
      simulation: true,
      strictFlowEnabled: true,
      inferredIntent: "positive_confirmation",
      contextualIntent,
      strictFlowRuntime,
      learnedIntent: null,
      history: []
    });

    expect(result.status).toBe("strict_flow_simulated");
    expect(nextTurn).toHaveBeenCalledOnce();
    expect(nextTurn.mock.calls[0]?.[0].inviteCode?.code).toBe("INV-1");
    expect(a2c.sendMessage).not.toHaveBeenCalled();
    const outbound = context.repos.listConversationMessages(context.conversation.id, 10).find((message) => message.direction === "outbound");
    expect(outbound?.content).toContain("这是注入流程回复，邀请码 INV-1");
    expect(outbound?.rawPayload).toMatchObject({
      replyMode: "strict_flow",
      strictFlowStep: "wait_registration",
      a2cSendStatus: "simulated"
    });
  });

  it("marks the conversation as handoff after sending the teacher Telegram link", async () => {
    const context = setupConversation("telegram_confirm");
    context.conversation.stage = "need_tg_register";
    context.conversation.extractedPhone = "918273718271";
    context.country.tgRegisterGuideUrl = "https://t.me/teacher";
    context.repos.updateConversation(context.conversation);
    const analysis = analyzeMessage("有", "zh");
    const contextualIntent = buildRuleContextualIntent({
      conversation: context.conversation,
      analysis,
      customerText: "有",
      inferredIntent: "positive_confirmation"
    });
    const a2c = { sendMessage: vi.fn(async () => "real-message-id") } as unknown as A2CClient;
    const telegram = { sendHandoffMessage: vi.fn(async () => undefined) };

    const result = await generateAndRecordStrictFlowReply({
      ...context,
      ai: aiStub() as never,
      runtimeConfig: runtimeConfig(),
      analysis,
      customerText: "有",
      a2c,
      telegram,
      data: {
        messageId: "inbound-tg",
        content: "有",
        from: "customer-1",
        to: "agent-1",
        msgType: "text",
        timestamp: 1783010000
      },
      payloadId: "payload-tg",
      simulation: false,
      strictFlowEnabled: true,
      inferredIntent: "positive_confirmation",
      contextualIntent,
      learnedIntent: null,
      history: []
    });

    expect(result).toEqual({ handled: true, status: "strict_flow_handoff", conversationId: context.conversation.id });
    expect(telegram.sendHandoffMessage).toHaveBeenCalledOnce();
    const stored = context.repos.getConversation(context.conversation.id);
    expect(stored?.status).toBe("human_handoff");
    expect(stored?.flowStep).toBe("human_handoff");
    const outbound = context.repos.listConversationMessages(context.conversation.id, 10).find((message) => message.direction === "outbound");
    expect(outbound?.content).toContain("https://t.me/teacher");
    expect(outbound?.content).toContain("500 到 2800 BOB");
  });

  it("notifies Telegram with a reason after the second registration link load failure", async () => {
    const context = setupConversation("wait_registration");
    const analysis = analyzeMessage("链接还是打不开", "zh");
    const contextualIntent = buildRuleContextualIntent({
      conversation: context.conversation,
      analysis,
      customerText: "链接还是打不开"
    });
    const a2c = { sendMessage: vi.fn(async () => "real-message-id") } as unknown as A2CClient;
    const telegram = { sendHandoffMessage: vi.fn<(text: string) => Promise<void>>(async () => undefined) };

    const result = await generateAndRecordStrictFlowReply({
      ...context,
      ai: aiStub() as never,
      runtimeConfig: runtimeConfig(),
      analysis,
      customerText: "链接还是打不开",
      a2c,
      telegram,
      data: {
        messageId: "inbound-link-fail-2",
        content: "链接还是打不开",
        from: "customer-1",
        to: "agent-1",
        msgType: "text",
        timestamp: 1783010000
      },
      payloadId: "payload-link-fail-2",
      simulation: false,
      strictFlowEnabled: true,
      inferredIntent: "need_help",
      contextualIntent,
      learnedIntent: null,
      history: [
        { direction: "inbound", content: "链接打不开", intent: "ask_link", createdAt: "2026-07-08T10:00:00.000Z" },
        { direction: "outbound", content: "您可以先换浏览器打开。", intent: "unknown", createdAt: "2026-07-08T10:00:05.000Z" }
      ]
    });

    expect(result).toEqual({ handled: true, status: "strict_flow_handoff", conversationId: context.conversation.id });
    expect(telegram.sendHandoffMessage).toHaveBeenCalledOnce();
    expect(String(telegram.sendHandoffMessage.mock.calls[0][0])).toContain("接管理由：客户反馈无法打开注册链接");
    const stored = context.repos.getConversation(context.conversation.id);
    expect(stored?.status).toBe("human_handoff");
    expect(stored?.flowStep).toBe("human_handoff");
    const outbound = context.repos.listConversationMessages(context.conversation.id, 10).find((message) => message.direction === "outbound");
    expect(outbound?.rawPayload?.handoffReason).toBe("客户反馈无法打开注册链接");
  });

  it("notifies Telegram when Spanish link access failure is repeated with a short follow-up", async () => {
    const context = setupConversation("wait_registration");
    context.conversation.language = "es";
    context.repos.updateConversation(context.conversation);
    const analysis = analyzeMessage("No puedo acceder", "es");
    const contextualIntent = buildRuleContextualIntent({
      conversation: context.conversation,
      analysis,
      customerText: "No puedo acceder"
    });
    const a2c = { sendMessage: vi.fn(async () => "real-message-id") } as unknown as A2CClient;
    const telegram = { sendHandoffMessage: vi.fn<(text: string) => Promise<void>>(async () => undefined) };

    const result = await generateAndRecordStrictFlowReply({
      ...context,
      ai: aiStub() as never,
      runtimeConfig: runtimeConfig(),
      analysis,
      customerText: "No puedo acceder",
      a2c,
      telegram,
      data: {
        messageId: "inbound-link-fail-es-2",
        content: "No puedo acceder",
        from: "customer-1",
        to: "agent-1",
        msgType: "text",
        timestamp: 1783010000
      },
      payloadId: "payload-link-fail-es-2",
      simulation: false,
      strictFlowEnabled: true,
      inferredIntent: "need_help",
      contextualIntent,
      learnedIntent: null,
      history: [
        { direction: "inbound", content: "No puedo acceder al enlace.", intent: "need_help", createdAt: "2026-07-08T10:00:00.000Z" },
        { direction: "outbound", content: "Entiendo. ¿Le pasa que el enlace no abre?", intent: "unknown", createdAt: "2026-07-08T10:00:05.000Z" }
      ]
    });

    expect(result.status).toBe("strict_flow_handoff");
    expect(telegram.sendHandoffMessage).toHaveBeenCalledOnce();
    expect(String(telegram.sendHandoffMessage.mock.calls[0][0])).toContain("接管理由：客户反馈无法打开注册链接");
    const outbound = context.repos.listConversationMessages(context.conversation.id, 10).find((message) => message.direction === "outbound");
    expect(outbound?.content).toContain("Espere un momento");
    expect(outbound?.rawPayload?.handoffReason).toBe("客户反馈无法打开注册链接");
  });
});
