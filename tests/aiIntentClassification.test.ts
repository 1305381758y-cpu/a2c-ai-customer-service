import { describe, expect, it, vi } from "vitest";
import { classifyAiIntent, normalizeInternalIntentLabel } from "../src/clients/aiIntentClassification.js";
import { loadConfig } from "../src/config.js";

const config = loadConfig({});

describe("AI intent classification task", () => {
  it("normalizes provider output into supported internal intent labels", () => {
    expect(normalizeInternalIntentLabel(" positive_confirmation\n")).toBe("positive_confirmation");
    expect(normalizeInternalIntentLabel("`trust_concern`")).toBe("trust_concern");
    expect(normalizeInternalIntentLabel("not-a-real-label")).toBe("unknown");
  });

  it("uses the injected runtime and limits history before classification", async () => {
    const generateText = vi.fn(async () => "payment_concern");

    const result = await classifyAiIntent(config, {
      customerText: "需要我充值吗",
      language: "zh",
      flowStep: "wait_registration",
      recentHistory: Array.from({ length: 8 }, (_, index) => ({
        direction: index % 2 ? "inbound" : "outbound",
        content: `message-${index}`,
        intent: "unknown",
        createdAt: ""
      }))
    }, { generateText });

    expect(result).toBe("payment_concern");
    expect(generateText).toHaveBeenCalledWith(expect.any(Object), expect.stringContaining("需要我充值吗"), expect.objectContaining({
      maxOutputTokens: 80,
      temperature: 0
    }));
    const firstCall = generateText.mock.calls[0] as unknown as [unknown, string, unknown];
    const payload = JSON.parse(firstCall[1]);
    expect(payload.recentHistory).toHaveLength(6);
    expect(payload.recentHistory[0].content).toBe("message-2");
  });

  it("falls back to unknown when the provider call fails", async () => {
    const result = await classifyAiIntent(config, {
      customerText: "???",
      language: "unknown",
      flowStep: "interest_screening",
      recentHistory: []
    }, {
      generateText: vi.fn(async () => {
        throw new Error("provider failed");
      })
    });

    expect(result).toBe("unknown");
  });
});
