import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { openDb } from "../src/db.js";
import { analyzeMessage } from "../src/domain/analyzer.js";
import { buildRuleContextualIntent } from "../src/domain/strictFlow.js";
import type { StrictFlowRuntimeContext, StrictFlowRuntimeEngine } from "../src/domain/strictFlowRuntime.js";
import { Repositories } from "../src/repositories.js";
import { createBuiltInStrictScriptFlow } from "../src/services/scriptFlows.js";
import { buildStrictFlowTurn } from "../src/services/strictFlowTurnBuilder.js";

function runtimeConfig() {
  return loadConfig({
    DATABASE_URL: ":memory:",
    PLATFORM_REGISTER_URL: "https://fallback.example"
  });
}

function setupConversation(flowStep = "registration_intent") {
  const repos = new Repositories(openDb(":memory:"));
  const merchant = repos.createMerchant("严格流程 Turn 商户");
  const country = repos.createMerchantCountry(merchant.id, {
    name: "巴西",
    defaultLanguage: "zh",
    platformRegisterUrl: "https://register.example",
    requirePlatformAccount: true,
    requirePhone: true,
    requireTelegram: true
  });
  const account = repos.syncMerchantA2CAccounts(merchant.id, [{
    apiPhone: "agent-turn",
    verifiedName: "客服号"
  }])[0];
  repos.createInviteCodeForA2CAccount(account.id, {
    code: "INV-TURN",
    registerUrl: "https://register.example/?code={code}",
    status: "available"
  }, merchant.id);
  const conversation = repos.getOrCreateConversation("customer-turn", "agent-turn", "客户", merchant.id, country.id);
  conversation.language = "zh";
  conversation.stage = "need_platform_register";
  conversation.flowStep = flowStep;
  repos.updateConversation(conversation);
  return { repos, merchant, country, conversation };
}

describe("strict flow turn builder", () => {
  it("reserves an invite code and builds the registration turn when the flow reaches registration", () => {
    const context = setupConversation("registration_intent");
    const analysis = analyzeMessage("是的", "zh");
    const contextualIntent = buildRuleContextualIntent({
      conversation: context.conversation,
      analysis,
      customerText: "是的",
      inferredIntent: "positive_confirmation"
    });

    const result = buildStrictFlowTurn({
      ...context,
      runtimeConfig: runtimeConfig(),
      analysis,
      customerText: "是的",
      strictFlowEnabled: true,
      inferredIntent: "positive_confirmation",
      contextualIntent
    });

    expect(result.needsInviteCode).toBe(true);
    expect(result.inviteCode).toMatchObject({ code: "INV-TURN", status: "reserved" });
    expect(result.strictReply).toMatchObject({
      enabled: true,
      nextFlowStep: "wait_registration",
      needsInviteCode: true
    });
    expect(result.strictReply.reply).toContain("邀请码：INV-TURN");
  });

  it("uses the current客服分组 invite code and its bound teacher throughout the strict flow", () => {
    const context = setupConversation("registration_intent");
    const account = context.repos.listMerchantA2CAccounts({ merchantId: context.merchant.id })[0]!;
    const group = context.repos.createA2CAccountGroup(context.merchant.id, {
      name: "巴西客服组",
      countryId: context.country.id
    });
    context.repos.setA2CAccountGroupMembers(group.id, context.merchant.id, [account.id]);
    const invite = context.repos.createGroupInviteCode(group.id, context.merchant.id, {
      code: "BR-REUSABLE",
      registerUrl: "https://register.example/?invite={code}",
      reusable: true
    });
    const allowedTeacher = context.repos.createTeacherTgLink(context.merchant.id, context.country.id, {
      label: "绑定导师",
      url: "https://t.me/bound_teacher",
      priority: 1,
      rotationCount: 1
    });
    context.repos.createTeacherTgLink(context.merchant.id, context.country.id, {
      label: "未绑定导师",
      url: "https://t.me/unbound_teacher",
      priority: 99,
      rotationCount: 99
    });
    context.repos.replaceInviteTeacherBindings("group", invite.id, context.merchant.id, [allowedTeacher.id]);

    const registrationText = "sim, o que preciso fazer?";
    const registrationAnalysis = analyzeMessage(registrationText, "pt-BR");
    const registrationIntent = buildRuleContextualIntent({
      conversation: context.conversation,
      analysis: registrationAnalysis,
      customerText: registrationText,
      inferredIntent: "positive_confirmation"
    });
    const registrationTurn = buildStrictFlowTurn({
      ...context,
      runtimeConfig: runtimeConfig(),
      analysis: registrationAnalysis,
      customerText: registrationText,
      strictFlowEnabled: true,
      inferredIntent: "positive_confirmation",
      contextualIntent: registrationIntent
    });

    expect(registrationTurn.inviteCode).toMatchObject({ source: "group", code: "BR-REUSABLE", reusable: true });
    expect(registrationTurn.strictReply.reply).toContain("BR-REUSABLE");
    expect(registrationTurn.strictReply.reply).not.toContain("正在确认");

    context.conversation.flowStep = "telegram_confirm";
    context.conversation.extractedPhone = "5511999999999";
    context.repos.updateConversation(context.conversation);
    const telegramText = "sim, já tenho Telegram";
    const telegramAnalysis = analyzeMessage(telegramText, "pt-BR");
    const telegramIntent = buildRuleContextualIntent({
      conversation: context.conversation,
      analysis: telegramAnalysis,
      customerText: telegramText,
      inferredIntent: "positive_confirmation"
    });
    const telegramTurn = buildStrictFlowTurn({
      ...context,
      runtimeConfig: runtimeConfig(),
      analysis: telegramAnalysis,
      customerText: telegramText,
      strictFlowEnabled: true,
      inferredIntent: "positive_confirmation",
      contextualIntent: telegramIntent
    });

    expect(telegramTurn.strictReply.reply).toContain("https://t.me/bound_teacher");
    expect(telegramTurn.strictReply.reply).not.toContain("https://t.me/unbound_teacher");
    expect(telegramTurn.strictReply.nextFlowStep).toBe("human_handoff");
  });

  it("does not reserve invite codes before the registration step needs them", () => {
    const context = setupConversation("interest_screening");
    const analysis = analyzeMessage("你好", "zh");
    const contextualIntent = buildRuleContextualIntent({
      conversation: context.conversation,
      analysis,
      customerText: "你好",
      inferredIntent: "unknown"
    });

    const result = buildStrictFlowTurn({
      ...context,
      runtimeConfig: runtimeConfig(),
      analysis,
      customerText: "你好",
      strictFlowEnabled: true,
      inferredIntent: "unknown",
      contextualIntent
    });

    expect(result.needsInviteCode).toBe(false);
    expect(result.inviteCode).toBeUndefined();
    expect(result.strictReply.needsInviteCode).toBe(false);
  });

  it("does not reserve an invite code when acknowledgement text also asks to ask a question first", () => {
    const context = setupConversation("registration_intent");
    const customerText = "ok，在此之前我可以问你一个问题吗";
    const analysis = analyzeMessage(customerText, "zh");
    const contextualIntent = buildRuleContextualIntent({
      conversation: context.conversation,
      analysis,
      customerText,
      inferredIntent: "positive_confirmation"
    });

    const result = buildStrictFlowTurn({
      ...context,
      runtimeConfig: runtimeConfig(),
      analysis,
      customerText,
      strictFlowEnabled: true,
      inferredIntent: "positive_confirmation",
      contextualIntent
    });

    expect(result.needsInviteCode).toBe(false);
    expect(result.inviteCode).toBeUndefined();
    expect(result.strictReply.nextFlowStep).toBe("registration_intent");
    expect(result.strictReply.awaitingCustomerQuestion).toBe(true);
    expect(result.strictReply.reply).not.toMatch(/https?:\/\/|邀请码|注册步骤/);
  });

  it("assigns and sends the teacher link when the customer naturally confirms Telegram is available", () => {
    const context = setupConversation("telegram_confirm");
    context.conversation.extractedPhone = "5511999999999";
    context.repos.updateConversation(context.conversation);
    context.repos.createTeacherTgLink(context.merchant.id, context.country.id, {
      label: "导师一",
      url: "https://t.me/teacher_one",
      priority: 1,
      rotationCount: 1,
      status: "active"
    });
    const customerText = "sim, já tenho Telegram";
    const analysis = analyzeMessage(customerText, "pt-BR");
    const contextualIntent = buildRuleContextualIntent({
      conversation: context.conversation,
      analysis,
      customerText,
      inferredIntent: "unknown"
    });

    const result = buildStrictFlowTurn({
      ...context,
      runtimeConfig: runtimeConfig(),
      analysis,
      customerText,
      strictFlowEnabled: true,
      inferredIntent: "unknown",
      contextualIntent
    });

    expect(result.strictReply.nextFlowStep).toBe("human_handoff");
    expect(result.strictReply.reply).toContain("https://t.me/teacher_one");
    expect(context.repos.getConversation(context.conversation.id)?.assignedTeacherTgLinkUrl).toBe("https://t.me/teacher_one");
  });

  it("does not enable question control when strict flow is disabled", () => {
    const context = setupConversation("registration_intent");
    const customerText = "我可以先问一个问题吗";
    const analysis = analyzeMessage(customerText, "zh");
    const contextualIntent = buildRuleContextualIntent({
      conversation: context.conversation,
      analysis,
      customerText,
      inferredIntent: "chat"
    });

    const result = buildStrictFlowTurn({
      ...context,
      runtimeConfig: runtimeConfig(),
      analysis,
      customerText,
      strictFlowEnabled: false,
      inferredIntent: "chat",
      contextualIntent
    });

    expect(result.needsInviteCode).toBe(false);
    expect(result.inviteCode).toBeUndefined();
    expect(result.strictReply.enabled).toBe(false);
  });

  it("can delegate the state transition to an injected strict-flow runtime", () => {
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
      reply: `runtime saw invite ${input.inviteCode?.code}`,
      language: "zh",
      nextFlowStep: "wait_registration" as const,
      stage: "need_platform_register" as const,
      needsInviteCode: Boolean(input.inviteCode)
    }));
    const strictFlowRuntime: StrictFlowRuntimeEngine = {
      nextTurn
    };

    const result = buildStrictFlowTurn({
      ...context,
      runtimeConfig: runtimeConfig(),
      analysis,
      customerText: "可以",
      strictFlowEnabled: true,
      inferredIntent: "positive_confirmation",
      contextualIntent,
      strictFlowRuntime
    });

    expect(nextTurn).toHaveBeenCalledOnce();
    expect(nextTurn.mock.calls[0]?.[0].inviteCode?.code).toBe("INV-TURN");
    expect(result.strictReply.reply).toBe("runtime saw invite INV-TURN");
  });

  it("keeps built-in editable script flow copies as smart as the strict fallback", () => {
    const context = setupConversation("registration_intent");
    const flow = createBuiltInStrictScriptFlow(context.repos, context.merchant.id, {
      countryId: context.country.id,
      name: "商户编辑副本"
    }, "运营");
    if (!flow.ok) throw new Error(flow.error);
    context.repos.enableScriptFlow(flow.value.flow.id, context.merchant.id, "运营");

    const activeFlow = context.repos.getActiveScriptFlow(context.merchant.id, context.country.id);
    const analysis = analyzeMessage("Sí", "es");
    const contextualIntent = buildRuleContextualIntent({
      conversation: context.conversation,
      analysis,
      customerText: "Sí",
      inferredIntent: "positive_confirmation"
    });

    const result = buildStrictFlowTurn({
      ...context,
      runtimeConfig: runtimeConfig(),
      analysis,
      customerText: "Sí",
      strictFlowEnabled: true,
      inferredIntent: "positive_confirmation",
      contextualIntent,
      scriptFlow: activeFlow
    });

    expect(result.needsInviteCode).toBe(true);
    expect(result.inviteCode?.code).toBe("INV-TURN");
    expect(result.strictReply.nextFlowStep).toBe("wait_registration");
    expect(result.strictReply.reply).toContain("INV-TURN");
    expect(result.strictReply.reply).toContain("https://register.example/?code=INV-TURN");
    expect(result.strictReply.reply).not.toContain("正在确认");
  });

  it("uses the completion-aware phone prompt after registration confirmation", () => {
    const context = setupConversation("wait_registration");
    const flow = createBuiltInStrictScriptFlow(context.repos, context.merchant.id, {
      countryId: context.country.id,
      name: "完整话本副本"
    }, "运营");
    if (!flow.ok) throw new Error(flow.error);
    const waitStep = flow.value.steps.find((step) => step.flowStep === "wait_registration");
    if (!waitStep) throw new Error("missing wait registration step");
    context.repos.patchScriptFlowStep(waitStep.id, context.merchant.id, { standardReply: "注册好后把手机号发给我，我再帮您核对。" }, "运营");
    context.repos.enableScriptFlow(flow.value.flow.id, context.merchant.id, "运营");
    const activeFlow = context.repos.getActiveScriptFlow(context.merchant.id, context.country.id);
    const analysis = analyzeMessage("注册好了", "zh");
    const contextualIntent = buildRuleContextualIntent({
      conversation: context.conversation,
      analysis,
      customerText: "注册好了",
      inferredIntent: "platform_register_done"
    });

    const result = buildStrictFlowTurn({
      ...context,
      runtimeConfig: runtimeConfig(),
      analysis,
      customerText: "注册好了",
      strictFlowEnabled: true,
      inferredIntent: "platform_register_done",
      contextualIntent,
      scriptFlow: activeFlow
    });

    expect(result.strictReply.nextFlowStep).toBe("wait_registration");
    expect(result.strictReply.reply).toContain("注册的手机号码");
    expect(result.strictReply.reply).not.toContain("注册好后");
    expect(result.strictReply.reply).not.toContain("是否已完成注册");
    expect(result.strictReply.reply).not.toContain("开户链接");
    expect(result.strictReply.reply).not.toContain("邀请码");
  });
});
