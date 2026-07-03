import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { InboundTurnPipeline } from "../src/services/inboundTurnPipeline.js";
import type { A2CWebhookPayload } from "../src/services/inboundMessage.js";

function payload(overrides: Partial<A2CWebhookPayload> = {}): A2CWebhookPayload {
  return {
    id: "payload-1",
    timestamp: 1783010000,
    type: "CUSTOMER_MESSAGE",
    data: {
      messageId: "incoming-1",
      content: "你好",
      from: "customer-1",
      to: "agent-1",
      msgType: "text",
      timestamp: 1783010000
    },
    ...overrides
  };
}

describe("InboundTurnPipeline", () => {
  it("ignores non-customer webhook events before loading context", async () => {
    const prepareContext = vi.fn();
    const pipeline = new InboundTurnPipeline({
      repos: { listConversationMessages: vi.fn() } as never,
      ai: {} as never,
      config: loadConfig({ DATABASE_URL: ":memory:" }),
      prepareContext: prepareContext as never
    });

    await expect(pipeline.process(payload({ type: "MESSAGE_STATUS" }))).resolves.toEqual({ status: "ignored" });
    expect(prepareContext).not.toHaveBeenCalled();
  });

  it("persists analyzed turns and stops duplicate messages before reply side effects", async () => {
    const conversation = {
      id: "conversation-1",
      flowStep: "interest_screening"
    };
    const historyReader = {
      recentMessages: vi.fn(() => [{ id: 1, direction: "outbound", content: "您好" }])
    };
    const repos = {};
    const prepareContext = vi.fn(async () => ({
      data: payload().data,
      msgType: "text",
      mediaUrl: "",
      analysisText: "你好",
      content: "你好",
      merchant: { id: "merchant-1", name: "商户" },
      merchantConfig: { merchantId: "merchant-1" },
      agentProfile: { agentName: "客服" },
      simulation: true,
      country: { id: "country-1", name: "巴西" },
      runtimeConfig: loadConfig({ DATABASE_URL: ":memory:" }),
      a2c: { sendMessage: vi.fn() },
      telegram: { sendHandoffMessage: vi.fn() },
      conversation,
      imageAnalysis: { text: "", status: "skipped" },
      customerTextForAi: "你好"
    }));
    const analyzeTurn = vi.fn(async () => ({
      analysis: { intent: "greeting", language: "zh", stage: "need_platform_register", phone: "", telegram: "", whatsapp: "" },
      scriptFlow: undefined,
      strictFlowEnabled: true,
      effectiveStrictFlowStep: "interest_screening",
      inferredIntent: "greeting",
      contextualIntent: {
        intent: "greeting",
        answeredPreviousQuestion: false,
        isSubmission: false,
        isQuestion: false,
        shouldPause: false,
        questionType: "none",
        nextAction: "continue",
        reason: "rule",
        source: "rule"
      },
      learnedIntent: null,
      learnedIntentDebug: null,
      intentLearningCandidate: undefined
    }));
    const persistTurn = vi.fn(async () => ({
      inserted: false,
      duplicate: true,
      inboundMemory: undefined
    }));
    const respondTurn = vi.fn();
    const pipeline = new InboundTurnPipeline({
      repos: repos as never,
      ai: {} as never,
      config: loadConfig({ DATABASE_URL: ":memory:" }),
      historyReader: historyReader as never,
      prepareContext: prepareContext as never,
      analyzeTurn: analyzeTurn as never,
      persistTurn: persistTurn as never,
      respondTurn: respondTurn as never
    });

    await expect(pipeline.process(payload(), "merchant-1", { simulation: true })).resolves.toEqual({
      status: "duplicate",
      conversationId: "conversation-1"
    });

    expect(prepareContext).toHaveBeenCalledWith(expect.objectContaining({
      merchantId: "merchant-1",
      simulation: true
    }));
    expect(historyReader.recentMessages).toHaveBeenCalledWith("conversation-1", 8);
    expect(analyzeTurn).toHaveBeenCalledWith(expect.objectContaining({
      history: [{ id: 1, direction: "outbound", content: "您好" }],
      customerTextForAi: "你好"
    }));
    expect(persistTurn).toHaveBeenCalledWith(expect.objectContaining({
      strictFlowEnabled: true,
      strictFlowStepBefore: "interest_screening"
    }));
    expect(respondTurn).not.toHaveBeenCalled();
  });
});
