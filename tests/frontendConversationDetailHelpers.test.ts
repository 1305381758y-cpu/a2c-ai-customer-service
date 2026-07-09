import { describe, expect, it } from "vitest";

import { conversationDetailEndpoints, detailFlowStep, lastOutboundPayload, resetSentDraft, textSuggestionDraft } from "../frontend/src/conversations/ConversationDetailHelpers.js";
import type { ChatMessage, Conversation } from "../frontend/src/types.js";

describe("frontend conversation detail helpers", () => {
  it("builds merchant and platform conversation endpoints", () => {
    expect(conversationDetailEndpoints(false, "c-1")).toEqual({
      base: "/api/merchant/conversations/c-1",
      messages: "/api/merchant/conversations/c-1/messages?limit=100",
      read: "/api/merchant/conversations/c-1/read",
      memory: "/api/merchant/conversations/c-1/memory",
      review: "/api/merchant/conversations/c-1/review",
      send: "/api/merchant/conversations/c-1/send"
    });
    expect(conversationDetailEndpoints(true, "c-2").memory).toBe("/api/admin/conversations/c-2/memory");
  });

  it("uses the latest outbound raw payload and resolves the flow step", () => {
    const messages: ChatMessage[] = [
      message("outbound", { strictFlowStep: "interest_screening" }),
      message("inbound", {}),
      message("outbound", { strictFlowStep: "wait_registration", strictFlowEnabled: true })
    ];

    const payload = lastOutboundPayload(messages);
    expect(payload.strictFlowStep).toBe("wait_registration");
    expect(detailFlowStep(conversation({ flowStep: "" }), payload)).toBe("wait_registration");
    expect(detailFlowStep(conversation({ flowStep: "collect_tg" }), payload)).toBe("collect_tg");
    expect(detailFlowStep(conversation({ flowStep: "" }), {})).toBe("未识别");
  });

  it("resets sent drafts and builds text suggestion drafts", () => {
    const draft = { type: "image", content: "hello", url: "https://example.com/a.png", caption: "caption", fileName: "a.png" };

    expect(resetSentDraft(draft)).toEqual({ type: "image", content: "", url: "", caption: "", fileName: "a.png" });
    expect(textSuggestionDraft(draft, "建议回复")).toEqual({ type: "text", content: "建议回复", url: "", caption: "智能建议", fileName: "a.png" });
  });
});

function message(direction: string, rawPayload: ChatMessage["rawPayload"]): ChatMessage {
  return {
    id: Math.random(),
    direction,
    content: "",
    msgType: "text",
    language: "zh",
    intent: "unknown",
    createdAt: "2026-07-01 00:00:00",
    rawPayload
  };
}

function conversation(patch: Partial<Conversation> = {}): Conversation {
  return {
    id: "c-1",
    merchantId: "m-1",
    countryId: "country-1",
    countryCode: "bo",
    countryName: "玻利维亚",
    customerPhone: "591",
    a2cAccountPhone: "1001",
    nickname: "",
    language: "es",
    stage: "wait_registration",
    flowStep: "",
    extractedPhone: "",
    extractedTelegram: "",
    extractedWhatsApp: "",
    status: "active",
    handoffStatus: "pending",
    unreadCount: 0,
    ...patch
  };
}
