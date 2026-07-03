import { describe, expect, it } from "vitest";
import { buildOutboundConversationRawPayload } from "../src/services/outboundConversationPayload.js";

describe("buildOutboundConversationRawPayload", () => {
  it("adds send diagnostics and simulation flag to an outbound raw payload", () => {
    expect(buildOutboundConversationRawPayload({
      basePayload: { replyMode: "strict_flow", strictFlowStep: "wait_registration" },
      sendResult: {
        externalId: "message-id",
        a2cSendStatus: "sent",
        a2cSendError: ""
      },
      simulation: false
    })).toEqual({
      replyMode: "strict_flow",
      strictFlowStep: "wait_registration",
      a2cSendStatus: "sent",
      a2cSendError: "",
      simulation: false
    });
  });

  it("adds operator translation diagnostics when translation is available", () => {
    expect(buildOutboundConversationRawPayload({
      basePayload: { replyMode: "fallback" },
      operatorTranslation: {
        originalText: "Hello",
        translatedText: "你好",
        targetLanguage: "zh-CN",
        status: "translated",
        error: ""
      },
      sendResult: {
        externalId: "message-id",
        a2cSendStatus: "simulated",
        a2cSendError: ""
      },
      simulation: true
    })).toMatchObject({
      replyMode: "fallback",
      originalContent: "Hello",
      operatorTranslatedContent: "你好",
      operatorTranslationTargetLanguage: "zh-CN",
      operatorTranslationStatus: "translated",
      operatorTranslationError: "",
      a2cSendStatus: "simulated",
      simulation: true
    });
  });
});
