import { describe, expect, it, vi } from "vitest";
import type { A2CWebhookPayload } from "../src/services/inboundMessage.js";
import { recordInboundTurn } from "../src/services/inboundTurnRecorder.js";
import type { Conversation, Repositories } from "../src/repositories.js";
import type { MessageAnalysis } from "../src/domain/analyzer.js";

function payload(): A2CWebhookPayload {
  return {
    id: "payload-1",
    timestamp: 1783010000,
    type: "CUSTOMER_MESSAGE",
    data: {
      messageId: "message-1",
      content: "手机号 13800138000",
      from: "customer-1",
      to: "agent-1",
      msgType: "text",
      timestamp: 1783010000,
      fileName: ""
    }
  };
}

function conversation(): Conversation {
  return {
    id: "conversation-1",
    merchantId: "merchant-1",
    countryId: "country-1",
    countryCode: "BR",
    countryName: "巴西",
    customerPhone: "customer-1",
    a2cAccountPhone: "agent-1",
    nickname: "客户",
    language: "zh",
    stage: "need_platform_register",
    flowStep: "wait_registration",
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
    intent: "provide_phone",
    language: "zh",
    stage: "need_phone_or_tg",
    phone: "13800138000",
    telegram: "",
    whatsapp: "",
    ...overrides
  };
}

function contextualIntent() {
  return {
    intent: "phone_submission",
    answeredPreviousQuestion: true,
    isSubmission: true,
    isQuestion: false,
    shouldPause: false,
    questionType: "none",
    nextAction: "continue",
    reason: "rule",
    source: "rule"
  } as const;
}

describe("inboundTurnRecorder", () => {
  it("records an inbound message, learning candidate, conversation facts, and memory together", () => {
    const conv = conversation();
    const insertedMessage = { inserted: true, id: 42 };
    const repos = {
      insertMessage: vi.fn(() => insertedMessage),
      recordIntentLearningEvent: vi.fn(),
      markInviteCodeUsedForConversation: vi.fn(),
      upsertCustomerFromConversation: vi.fn(),
      updateCustomerMemoryFromMessage: vi.fn(() => ({ id: 7 }))
    } as unknown as Repositories;
    const event = payload();
    const content = event.data.content || "";

    const result = recordInboundTurn({
      repos,
      conversation: conv,
      payload: event,
      data: event.data,
      content,
      msgType: "text",
      mediaUrl: "",
      fileName: "",
      imageAnalysis: { text: "", status: "skipped" },
      simulation: false,
      analysis: analysis(),
      customerTextForAi: content,
      inboundTranslation: {
        originalText: content,
        translatedText: "手机号 13800138000",
        targetLanguage: "zh-CN",
        status: "skipped",
        error: ""
      },
      inferredIntent: "unknown",
      contextualIntent: contextualIntent(),
      learnedIntentDebug: { id: 1, suggestedIntent: "provide_phone", displayName: "提供手机号", score: 0.9 },
      strictFlowEnabled: true,
      strictFlowStepBefore: "wait_registration",
      intentLearningCandidate: {
        candidateKey: "phone:wait_registration",
        suggestedIntent: "provide_phone",
        displayName: "提供手机号",
        description: "客户提供手机号"
      }
    });

    expect(result).toEqual({ inserted: true, messageId: 42, inboundMemory: { id: 7 } });
    expect(repos.insertMessage).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: conv.id,
      direction: "inbound",
      externalId: "message-1",
      phoneDetected: "13800138000",
      rawPayload: expect.objectContaining({
        contextualIntent: contextualIntent(),
        strictFlowEnabled: true,
        strictFlowStepBefore: "wait_registration",
        learnedIntent: expect.objectContaining({ suggestedIntent: "provide_phone" })
      })
    }));
    expect(repos.recordIntentLearningEvent).toHaveBeenCalledWith(expect.objectContaining({
      merchantId: "merchant-1",
      countryId: "country-1",
      conversationId: "conversation-1",
      messageId: 42,
      suggestedIntent: "provide_phone"
    }));
    expect(conv.language).toBe("zh");
    expect(conv.stage).toBe("need_phone_or_tg");
    expect(conv.extractedPhone).toBe("13800138000");
    expect(repos.upsertCustomerFromConversation).toHaveBeenCalledWith(conv);
    expect(repos.updateCustomerMemoryFromMessage).toHaveBeenCalledWith(conv, {
      intent: "provide_phone",
      content,
      direction: "inbound"
    });
  });

  it("does not update memory or learning when inbound insertion is a duplicate", () => {
    const conv = conversation();
    const repos = {
      insertMessage: vi.fn(() => ({ inserted: false })),
      recordIntentLearningEvent: vi.fn(),
      markInviteCodeUsedForConversation: vi.fn(),
      upsertCustomerFromConversation: vi.fn(),
      updateCustomerMemoryFromMessage: vi.fn()
    } as unknown as Repositories;
    const event = payload();
    const content = event.data.content || "";

    const result = recordInboundTurn({
      repos,
      conversation: conv,
      payload: event,
      data: event.data,
      content,
      msgType: "text",
      mediaUrl: "",
      fileName: "",
      imageAnalysis: { text: "", status: "skipped" },
      simulation: true,
      analysis: analysis({ phone: "13800138000" }),
      customerTextForAi: content,
      inboundTranslation: { originalText: content, translatedText: "", targetLanguage: "zh-CN", status: "skipped" },
      inferredIntent: "unknown",
      contextualIntent: contextualIntent(),
      learnedIntentDebug: null,
      strictFlowEnabled: true,
      strictFlowStepBefore: "wait_registration",
      intentLearningCandidate: {
        candidateKey: "phone:wait_registration",
        suggestedIntent: "provide_phone",
        displayName: "提供手机号",
        description: "客户提供手机号"
      }
    });

    expect(result).toEqual({ inserted: false });
    expect(conv.extractedPhone).toBe("");
    expect(repos.recordIntentLearningEvent).not.toHaveBeenCalled();
    expect(repos.upsertCustomerFromConversation).not.toHaveBeenCalled();
    expect(repos.updateCustomerMemoryFromMessage).not.toHaveBeenCalled();
  });
});
