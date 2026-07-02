import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import type { MessageAnalysis } from "../src/domain/analyzer.js";
import type { Conversation, Repositories } from "../src/repositories.js";
import type { A2CWebhookPayload } from "../src/services/inboundMessage.js";
import { persistAnalyzedInboundTurn } from "../src/services/inboundTurnPersistence.js";

function runtimeConfig() {
  return loadConfig({ DATABASE_URL: ":memory:" });
}

function payload(content = "Hola"): A2CWebhookPayload {
  return {
    id: "payload-persist",
    timestamp: 1783010000,
    type: "CUSTOMER_MESSAGE",
    data: {
      messageId: "message-persist",
      content,
      from: "customer-persist",
      to: "agent-persist",
      msgType: "text",
      timestamp: 1783010000
    }
  };
}

function conversation(): Conversation {
  return {
    id: "conversation-persist",
    merchantId: "merchant-persist",
    countryId: "country-persist",
    countryCode: "BO",
    countryName: "玻利维亚",
    customerPhone: "customer-persist",
    a2cAccountPhone: "agent-persist",
    nickname: "客户",
    language: "es",
    stage: "need_platform_register",
    flowStep: "interest_screening",
    extractedPhone: "",
    extractedTelegram: "",
    extractedWhatsApp: "",
    status: "active",
    handoffStatus: "pending",
    handoffNotified: 0,
    unreadCount: 0
  };
}

function analysis(overrides: Partial<MessageAnalysis> = {}): MessageAnalysis {
  return {
    intent: "unknown",
    language: "es",
    stage: "need_platform_register",
    phone: "",
    telegram: "",
    whatsapp: "",
    ...overrides
  };
}

function contextualIntent() {
  return {
    intent: "unknown",
    answeredPreviousQuestion: false,
    isSubmission: false,
    isQuestion: false,
    shouldPause: false,
    questionType: "none",
    nextAction: "interest_screening",
    reason: "rule",
    source: "rule"
  } as const;
}

describe("inbound turn persistence", () => {
  it("translates operator text and records the analyzed inbound turn together", async () => {
    const conv = conversation();
    const event = payload("Hola");
    const repos = {
      insertMessage: vi.fn(() => ({ inserted: true, id: 123 })),
      recordIntentLearningEvent: vi.fn(),
      markInviteCodeUsedForConversation: vi.fn(),
      upsertCustomerFromConversation: vi.fn(),
      updateCustomerMemoryFromMessage: vi.fn(() => ({ id: 9 }))
    } as unknown as Repositories;

    const result = await persistAnalyzedInboundTurn({
      repos,
      runtimeConfig: runtimeConfig(),
      conversation: conv,
      payload: event,
      data: event.data,
      content: "Hola",
      msgType: "text",
      mediaUrl: "",
      fileName: "",
      imageAnalysis: { text: "", status: "skipped" },
      simulation: false,
      analysis: analysis(),
      analysisText: "Hola",
      customerTextForAi: "Hola",
      inferredIntent: "unknown",
      contextualIntent: contextualIntent(),
      learnedIntentDebug: null,
      strictFlowEnabled: true,
      strictFlowStepBefore: "interest_screening"
    });

    expect(result).toEqual({ inserted: true, messageId: 123, inboundMemory: { id: 9 } });
    expect(repos.insertMessage).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: "conversation-persist",
      rawPayload: expect.objectContaining({
        originalContent: "Hola",
        translatedContent: "你好",
        targetLanguage: "zh-CN",
        translationStatus: "translated"
      })
    }));
    expect(repos.updateCustomerMemoryFromMessage).toHaveBeenCalledWith(conv, {
      intent: "unknown",
      content: "Hola",
      direction: "inbound"
    });
  });
});
