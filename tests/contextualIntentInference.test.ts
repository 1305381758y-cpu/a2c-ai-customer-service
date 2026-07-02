import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { analyzeMessage, type MessageAnalysis } from "../src/domain/analyzer.js";
import type { Conversation } from "../src/repositories.js";
import { applyInternalIntent, inferStrictFlowContextualIntent, inferStrictFlowIntent } from "../src/services/contextualIntentInference.js";
import type { AiTasks } from "../src/services/aiTasks.js";

const runtimeConfig = loadConfig({});

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

function aiTasksMock(overrides: Partial<AiTasks> = {}): AiTasks {
  return {
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

describe("contextual intent inference", () => {
  it("keeps high-confidence rule context without asking AI", async () => {
    const ai = aiTasksMock();

    const result = await inferStrictFlowContextualIntent({
      ai,
      runtimeConfig,
      conversation: conversation(),
      analysis: analyzeMessage("需要充值吗", "zh"),
      customerText: "需要充值吗",
      strictFlowEnabled: true,
      history: [],
      inferredIntent: "unknown"
    });

    expect(result.intent).toBe("payment_concern");
    expect(result.source).toBe("rule");
    expect(ai.classifyContextualIntent).not.toHaveBeenCalled();
  });

  it("asks AI for contextual classification when strict flow text is unclear", async () => {
    const ai = aiTasksMock();

    const result = await inferStrictFlowContextualIntent({
      ai,
      runtimeConfig,
      conversation: conversation(),
      analysis: { ...analyzeMessage("你能多说说吗", "zh"), intent: "unknown" },
      customerText: "你能多说说吗",
      strictFlowEnabled: true,
      history: [{ direction: "outbound", content: "您现在方便继续开户注册吗？", intent: "unknown", createdAt: "2026-07-03T00:00:00.000Z" }],
      inferredIntent: "unknown"
    });

    expect(result.intent).toBe("workflow_question");
    expect(result.source).toBe("ai");
    expect(result.questionType).toBe("help");
    expect(ai.classifyContextualIntent).toHaveBeenCalledOnce();
  });

  it("keeps internal intent classification behind the same service interface", async () => {
    const ai = aiTasksMock({ classifyIntent: vi.fn(async () => "positive_confirmation" as const) });

    await expect(inferStrictFlowIntent({
      ai,
      runtimeConfig,
      conversation: conversation({ flowStep: "interest_screening" }),
      analysis: { ...analyzeMessage("是", "zh"), intent: "unknown" },
      customerText: "是",
      strictFlowEnabled: true,
      history: []
    })).resolves.toBe("positive_confirmation");

    expect(ai.classifyIntent).toHaveBeenCalledOnce();
  });

  it("maps internal AI intent back to the public analysis shape", () => {
    const analysis: MessageAnalysis = {
      language: "zh",
      intent: "unknown",
      phone: "",
      telegram: "",
      whatsapp: "",
      stage: "need_platform_register"
    };

    expect(applyInternalIntent(analysis, "ask_tg_register")).toMatchObject({
      intent: "ask_tg_register",
      stage: "need_phone_or_tg"
    });
  });
});
