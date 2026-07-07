import { describe, expect, it } from "vitest";
import type { A2CInviteCodeRecord, MerchantAgentProfileRecord, MerchantCountryRecord, ScriptFlowRuntime } from "../src/repositories.js";
import type { StrictFlowReply } from "../src/domain/strictFlow.js";
import { buildStrictFlowOutboundRawPayload } from "../src/services/strictFlowOutboundPayload.js";

function strictReply(overrides: Partial<StrictFlowReply> = {}): StrictFlowReply {
  return {
    enabled: true,
    reply: "请继续注册",
    language: "zh",
    stage: "need_platform_register",
    nextFlowStep: "wait_registration",
    needsInviteCode: true,
    contextualIntent: {
      intent: "need_help",
      answeredPreviousQuestion: true,
      isQuestion: true,
      isSubmission: false,
      shouldPause: false,
      questionType: "help",
      nextAction: "send registration steps",
      reason: "customer needs help",
      source: "rule"
    },
    controlledQuestionType: "help",
    controlledQuestionFallback: false,
    fallback: false,
    ...overrides
  };
}

function agentProfile(): MerchantAgentProfileRecord {
  return {
    merchantId: "merchant-1",
    agentName: "注册专员",
    roleDefinition: "",
    toneStyle: "",
    coreGoal: "",
    mustFollow: "",
    forbidden: "",
    uncertaintyPolicy: "",
    handoffPolicy: "",
    enabled: true,
    createdAt: "",
    updatedAt: ""
  };
}

function country(overrides: Partial<MerchantCountryRecord> = {}): MerchantCountryRecord {
  return {
    id: "country-1",
    merchantId: "merchant-1",
    code: "BR",
    name: "巴西",
    defaultLanguage: "pt-BR",
    platformRegisterUrl: "https://register.example",
    tgRegisterGuideUrl: "",
    requirePlatformAccount: true,
    requirePhone: true,
    requireTelegram: true,
    requireWhatsApp: false,
    status: "active",
    ...overrides
  };
}

function inviteCode(): A2CInviteCodeRecord {
  return {
    id: 7,
    merchantId: "merchant-1",
    countryId: "country-1",
    countryCode: "BR",
    countryName: "巴西",
    a2cAccountId: 10,
    a2cAccountPhone: "agent-1",
    code: "INV-7",
    registerUrl: "https://register.example/?code=INV-7",
    status: "reserved",
    assignedCustomerKey: "customer-1",
    assignedConversationId: "conversation-1",
    platformAccount: "",
    assignedAt: "",
    usedAt: "",
    createdAt: "",
    updatedAt: ""
  };
}

function scriptFlow(): ScriptFlowRuntime {
  return {
    flow: {
      id: 12,
      merchantId: "merchant-1",
      countryId: "country-1",
      countryCode: "BR",
      countryName: "巴西",
      name: "测试2222",
      status: "active",
      active: true,
      version: 3,
      sourceFilename: "系统内置",
      stepCount: 11,
      createdAt: "",
      updatedAt: ""
    },
    steps: []
  };
}

describe("strict flow outbound payload builder", () => {
  it("centralizes strict-flow debug fields for recorded outbound messages", () => {
    const payload = buildStrictFlowOutboundRawPayload({
      strictReply: strictReply(),
      strictFlowEnabled: true,
      agentProfile: agentProfile(),
      learnedIntent: { id: 1, suggestedIntent: "need_help", displayName: "需要协助", score: 0.9 },
      naturalized: { used: true, error: "" },
      languageGuard: {
        reply: "请继续注册",
        targetLanguage: "zh",
        status: "matched",
        attempts: 0,
        fallbackUsed: false
      },
      country: country(),
      scriptFlow: scriptFlow(),
      inviteCode: inviteCode()
    });

    expect(payload).toMatchObject({
      replyMode: "strict_flow",
      strictFlow: true,
      strictFlowEnabled: true,
      strictFlowStep: "wait_registration",
      scriptFlowId: 12,
      scriptFlowName: "测试2222",
      scriptFlowVersion: 3,
      scriptFlowSource: "系统内置",
      controlledQuestionType: "help",
      agentProfileName: "注册专员",
      intentSource: "rule",
      answeredPreviousQuestion: true,
      questionType: "help",
      nextAction: "send registration steps",
      usedAiNaturalizer: true,
      languageGuardStatus: "matched",
      inviteCodeRequired: true,
      inviteCodeMissing: false,
      assignedInviteCode: {
        id: 7,
        code: "INV-7",
        registerUrl: "https://register.example/?code=INV-7",
        status: "reserved"
      }
    });
  });

  it("marks fallback replies and missing invite codes without leaking undefined values", () => {
    const payload = buildStrictFlowOutboundRawPayload({
      strictReply: strictReply({ fallback: true, needsInviteCode: true, contextualIntent: undefined }),
      strictFlowEnabled: true,
      agentProfile: agentProfile(),
      learnedIntent: null,
      naturalized: { used: false, error: "provider down" },
      languageGuard: {
        reply: "请继续注册",
        targetLanguage: "zh",
        status: "fallback",
        attempts: 2,
        fallbackUsed: true,
        error: "language mismatch"
      },
      country: country(),
      inviteCode: undefined
    });

    expect(payload).toMatchObject({
      replyMode: "fallback",
      intentSource: "none",
      answeredPreviousQuestion: false,
      questionType: "help",
      languageGuardFallbackUsed: true,
      languageGuardError: "language mismatch",
      inviteCodeMissing: true,
      assignedInviteCode: null
    });
  });
});
