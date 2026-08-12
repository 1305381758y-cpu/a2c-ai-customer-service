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

  it("keeps payment questions ahead of an incorrect positive AI label", async () => {
    const ai = aiTasksMock();

    const result = await inferStrictFlowContextualIntent({
      ai,
      runtimeConfig,
      conversation: conversation({ flowStep: "registration_intent" }),
      analysis: { ...analyzeMessage("请问下一步是否就是要我充值了？", "zh"), intent: "unknown" },
      customerText: "请问下一步是否就是要我充值了？",
      strictFlowEnabled: true,
      history: [],
      inferredIntent: "positive_confirmation"
    });

    expect(result.intent).toBe("payment_concern");
    expect(result.source).toBe("rule");
    expect(ai.classifyContextualIntent).not.toHaveBeenCalled();
  });

  it.each([
    { text: "Bom dia", step: "registration_intent", expected: "chat" },
    { text: "Fiz", step: "wait_registration", expected: "platform_register_done" },
    { text: "Não precisar", step: "wait_registration", expected: "negative_refusal" }
  ])("keeps high-confidence node semantics ahead of AI: $text", async ({ text, step, expected }) => {
    const ai = aiTasksMock({
      classifyContextualIntent: vi.fn(async () => ({
        intent: "positive_confirmation" as const,
        answeredPreviousQuestion: true,
        isQuestion: false,
        shouldPause: false,
        questionType: "none" as const,
        nextAction: "advance",
        reason: "incorrect AI result"
      }))
    });

    const result = await inferStrictFlowContextualIntent({
      ai,
      runtimeConfig,
      conversation: conversation({ flowStep: step as Conversation["flowStep"], language: "pt-BR" }),
      analysis: { ...analyzeMessage(text, "pt-BR"), intent: "unknown" },
      customerText: text,
      strictFlowEnabled: true,
      history: [{
        direction: "outbound",
        content: step === "wait_registration" ? "Quando terminar o cadastro, avise." : "Você tem tempo livre em casa?",
        intent: "unknown",
        createdAt: "2026-08-06T00:00:00.000Z"
      }],
      inferredIntent: "positive_confirmation"
    });

    expect(result.intent).toBe(expected);
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

  it("lets contextual AI correct a coarse positive label on an ambiguous long reply", async () => {
    const ai = aiTasksMock({
      classifyContextualIntent: vi.fn(async () => ({
        intent: "not_available" as const,
        answeredPreviousQuestion: true,
        isQuestion: false,
        shouldPause: true,
        questionType: "none" as const,
        nextAction: "pause politely",
        reason: "customer defers the action"
      }))
    });
    const customerText = "眼下不便展开，容后再议";

    const result = await inferStrictFlowContextualIntent({
      ai,
      runtimeConfig,
      conversation: conversation({ flowStep: "registration_intent" }),
      analysis: { ...analyzeMessage(customerText, "zh"), intent: "greeting" },
      customerText,
      strictFlowEnabled: true,
      history: [],
      inferredIntent: "positive_confirmation"
    });

    expect(result.intent).toBe("not_available");
    expect(result.shouldPause).toBe(true);
    expect(result.source).toBe("ai");
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
