import { describe, expect, it } from "vitest";
import { normalizeA2CWebhookPayload, normalizeMessageType, type A2CWebhookPayload } from "../src/services/inboundMessage.js";

function payload(data: Partial<A2CWebhookPayload["data"]>): A2CWebhookPayload {
  return {
    id: "payload-1",
    timestamp: 1,
    type: "CUSTOMER_MESSAGE",
    data: {
      messageId: "message-1",
      content: "",
      from: "customer",
      to: "agent",
      msgType: "text",
      timestamp: 1,
      ...data
    }
  };
}

describe("inbound message normalization", () => {
  it("normalizes numeric A2C message types", () => {
    expect(normalizeMessageType("1")).toBe("text");
    expect(normalizeMessageType("2")).toBe("image");
    expect(normalizeMessageType("3")).toBe("video");
    expect(normalizeMessageType("4")).toBe("audio");
    expect(normalizeMessageType("5")).toBe("document");
  });

  it("keeps media URLs out of text analysis content", () => {
    const normalized = normalizeA2CWebhookPayload(payload({
      msgType: "2",
      content: "https://bucket.example.com/1226109357673717760.jpg?Expires=1782043661",
      url: "https://bucket.example.com/1226109357673717760.jpg?Expires=1782043661"
    }));

    expect(normalized.msgType).toBe("image");
    expect(normalized.mediaUrl).toContain("1226109357673717760.jpg");
    expect(normalized.analysisText).toBe("");
    expect(normalized.content).toBe("[图片]");
    expect(normalized.shouldAnalyzeImage).toBe(true);
  });

  it("uses captions as analyzable text for media messages", () => {
    const normalized = normalizeA2CWebhookPayload(payload({
      msgType: "image",
      url: "https://bucket.example.com/screenshot.jpg",
      caption: "页面打不开"
    }));

    expect(normalized.content).toBe("页面打不开");
    expect(normalized.analysisText).toBe("页面打不开");
    expect(normalized.shouldAnalyzeImage).toBe(true);
  });
});
