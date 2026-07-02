import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import type { AiTasks } from "../src/services/aiTasks.js";
import { analyzeInboundTurn, detectContextualRegistrationPhone } from "../src/services/inboundTurnAnalysis.js";
import type { Conversation, ConversationMessageRecord, MerchantConfigRecord, MerchantCountryRecord, MerchantRecord, Repositories } from "../src/repositories.js";

const runtimeConfig = loadConfig({});

const merchant: MerchantRecord = { id: "merchant-1", name: "测试商户", status: "active" };

const merchantConfig: MerchantConfigRecord = {
  merchantId: "merchant-1",
  a2cBaseUrl: "",
  a2cAppId: "",
  a2cAppSecret: "",
  a2cAccountPhone: "",
  openaiApiKey: "",
  openaiModel: "",
  aiProvider: "gemini",
  minimaxApiKey: "",
  minimaxModel: "",
  deepseekApiKey: "",
  deepseekModel: "",
  googleAiApiKey: "",
  googleAiModel: "",
  telegramBotToken: "",
  telegramHandoffChatId: "",
  telegramHandoffChatTitle: "",
  telegramHandoffChatStatus: "unbound",
  telegramHandoffChatError: "",
  a2cTokenCacheKey: "",
  a2cAccessToken: "",
  a2cTokenExpiresAt: 0,
  smartReplyEnabled: true,
  trainingSimulationEnabled: false,
  strictScriptFlowEnabled: true,
  platformRegisterUrl: "",
  tgRegisterGuideUrl: "",
  registrationTutorialImageUrl: ""
};

const country: MerchantCountryRecord = {
  id: "country-1",
  merchantId: "merchant-1",
  code: "BR",
  name: "巴西",
  defaultLanguage: "zh",
  platformRegisterUrl: "",
  tgRegisterGuideUrl: "",
  requirePlatformAccount: true,
  requirePhone: true,
  requireTelegram: true,
  requireWhatsApp: false,
  status: "active"
};

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "conversation-1",
    merchantId: "merchant-1",
    countryId: "country-1",
    countryCode: "BR",
    countryName: "巴西",
    customerPhone: "customer-1",
    a2cAccountPhone: "agent-1",
    nickname: "客户",
    flowStep: "wait_registration",
    language: "zh",
    stage: "need_platform_register",
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

function reposMock(overrides: Partial<Repositories> = {}): Repositories {
  return {
    getActiveScriptFlow: vi.fn(() => undefined),
    listPromotedIntentLearningEvents: vi.fn(() => []),
    ...overrides
  } as unknown as Repositories;
}

function aiMock(overrides: Partial<AiTasks> = {}): AiTasks {
  return {
    detectLanguage: vi.fn(async () => "unknown"),
    classifyIntent: vi.fn(async () => "unknown"),
    classifyContextualIntent: vi.fn(async () => ({
      intent: "workflow_question",
      answeredPreviousQuestion: false,
      isQuestion: true,
      shouldPause: false,
      questionType: "workflow",
      nextAction: "answer then continue",
      reason: "ai classified"
    })),
    ...overrides
  } as unknown as AiTasks;
}

function outbound(content: string, rawPayload: Record<string, unknown> = {}): ConversationMessageRecord {
  return {
    id: 1,
    direction: "outbound",
    content,
    msgType: "text",
    language: "zh",
    intent: "unknown",
    rawPayload,
    createdAt: "2026-07-03T00:00:00.000Z"
  };
}

describe("inboundTurnAnalysis", () => {
  it("detects bare registration phones only in registration-related steps", () => {
    expect(detectContextualRegistrationPhone("273773862", "wait_registration")).toBe("273773862");
    expect(detectContextualRegistrationPhone("273773862", "telegram_confirm")).toBe("273773862");
    expect(detectContextualRegistrationPhone("273773862", "collect_telegram")).toBe("");
    expect(detectContextualRegistrationPhone("abc 273773862", "wait_registration")).toBe("");
  });

  it("centralizes strict-flow language, intent, and contextual AI fallback", async () => {
    const ai = aiMock({ classifyIntent: vi.fn(async () => "positive_confirmation" as const) });
    const conv = conversation({ flowStep: "interest_screening" });

    const result = await analyzeInboundTurn({
      repos: reposMock(),
      ai,
      runtimeConfig,
      merchant,
      merchantConfig,
      country,
      conversation: conv,
      msgType: "text",
      analysisText: "可以啊",
      imageAnalysisText: "",
      customerTextForAi: "可以啊",
      history: [outbound("您是想了解一份兼职在线工作吗？", { strictFlowStep: "interest_screening" })]
    });

    expect(result.strictFlowEnabled).toBe(true);
    expect(result.effectiveStrictFlowStep).toBe("interest_screening");
    expect(result.inferredIntent).toBe("positive_confirmation");
    expect(result.analysis.intent).toBe("greeting");
    expect(result.contextualIntent.intent).toBe("positive_confirmation");
    expect(result.intentLearningCandidate?.suggestedIntent).toBe("positive_confirmation");
  });

  it("keeps incomplete registration phone detection inside the same analysis module", async () => {
    const result = await analyzeInboundTurn({
      repos: reposMock(),
      ai: aiMock(),
      runtimeConfig,
      merchant,
      merchantConfig,
      country,
      conversation: conversation({ flowStep: "wait_registration" }),
      msgType: "text",
      analysisText: "4567890 注册好了",
      imageAnalysisText: "",
      customerTextForAi: "4567890 注册好了",
      history: []
    });

    expect(result.contextualIntent.intent).toBe("incomplete_phone");
    expect(result.contextualIntent.nextAction).toBe("need_complete_phone");
    expect(result.analysis.phone).toBe("");
  });
});
