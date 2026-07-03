import { describe, expect, it } from "vitest";
import { buildInboundTurnRawPayload } from "../src/services/inboundTurnPayload.js";
import type { A2CWebhookPayload } from "../src/services/inboundMessage.js";

const payload: A2CWebhookPayload = {
  id: "payload-1",
  timestamp: 1783010000,
  type: "CUSTOMER_MESSAGE",
  data: {
    messageId: "message-1",
    content: "Hola",
    from: "customer-1",
    to: "agent-1",
    msgType: "text",
    timestamp: 1783010000
  }
};

const contextualIntent = {
  intent: "unknown",
  answeredPreviousQuestion: false,
  isSubmission: false,
  isQuestion: false,
  shouldPause: false,
  questionType: "none",
  nextAction: "",
  reason: "rule",
  source: "rule"
} as const;

describe("buildInboundTurnRawPayload", () => {
  it("adds inbound analysis, translation, and simulation diagnostics", () => {
    expect(buildInboundTurnRawPayload({
      payload,
      inferredIntent: "unknown",
      contextualIntent,
      learnedIntentDebug: { id: 3, suggestedIntent: "greeting", displayName: "打招呼", score: 0.8 },
      strictFlowEnabled: true,
      strictFlowStepBefore: "interest_screening",
      inboundTranslation: {
        originalText: "Hola",
        translatedText: "你好",
        targetLanguage: "zh-CN",
        status: "translated",
        error: ""
      },
      mediaUrl: "",
      fileName: "",
      imageAnalysis: { text: "ignored", status: "ok" },
      msgType: "text",
      simulation: false
    })).toMatchObject({
      id: "payload-1",
      inferredIntent: "unknown",
      contextualIntent,
      learnedIntent: { suggestedIntent: "greeting" },
      strictFlowEnabled: true,
      strictFlowStepBefore: "interest_screening",
      originalContent: "Hola",
      translatedContent: "你好",
      targetLanguage: "zh-CN",
      translationStatus: "translated",
      translationError: "",
      imageAnalysis: null,
      simulation: false
    });
  });

  it("keeps image analysis for image inbound messages", () => {
    expect(buildInboundTurnRawPayload({
      payload,
      inferredIntent: "need_help",
      contextualIntent,
      learnedIntentDebug: null,
      strictFlowEnabled: true,
      strictFlowStepBefore: "wait_registration",
      inboundTranslation: {
        originalText: "[图片]",
        translatedText: "",
        targetLanguage: "zh-CN",
        status: "skipped"
      },
      mediaUrl: "https://example.test/image.jpg",
      fileName: "image.jpg",
      imageAnalysis: { text: "页面无法加载", status: "ok" },
      msgType: "image",
      simulation: true
    })).toMatchObject({
      inferredIntent: "need_help",
      learnedIntent: null,
      mediaUrl: "https://example.test/image.jpg",
      fileName: "image.jpg",
      imageAnalysis: { text: "页面无法加载", status: "ok" },
      simulation: true
    });
  });
});
