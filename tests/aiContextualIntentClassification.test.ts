import { describe, expect, it, vi } from "vitest";
import { classifyAiContextualIntent, normalizeContextualIntentResult, type AiContextualIntentRuntime } from "../src/clients/aiContextualIntentClassification.js";
import { loadConfig } from "../src/config.js";

const config = loadConfig({});

describe("AI contextual intent classification task", () => {
  it("normalizes provider JSON into a bounded contextual intent result", () => {
    const result = normalizeContextualIntentResult({
      intent: "telegram_username_help",
      answeredPreviousQuestion: 1 as unknown as boolean,
      isQuestion: true,
      shouldPause: false,
      questionType: "telegram",
      nextAction: "x".repeat(200),
      reason: "y".repeat(200)
    });

    expect(result.intent).toBe("telegram_username_help");
    expect(result.answeredPreviousQuestion).toBe(true);
    expect(result.questionType).toBe("telegram");
    expect(result.nextAction).toHaveLength(120);
    expect(result.reason).toHaveLength(120);
  });

  it("falls back to unknown for unsupported provider intent labels", () => {
    expect(normalizeContextualIntentResult({
      intent: "not-real" as never,
      questionType: 123 as unknown as string
    })).toEqual({
      intent: "unknown",
      answeredPreviousQuestion: false,
      isQuestion: false,
      shouldPause: false,
      questionType: "none",
      nextAction: "",
      reason: ""
    });
  });

  it("uses the injected runtime and limits context history", async () => {
    const generateJson = vi.fn(async () => ({
      intent: "no_telegram",
      answeredPreviousQuestion: true,
      isQuestion: false,
      shouldPause: false,
      questionType: "telegram",
      nextAction: "guide download",
      reason: "previous assistant asked about telegram"
    }));

    const result = await classifyAiContextualIntent(config, {
      customerText: "我没有",
      language: "zh",
      flowStep: "telegram_confirm",
      previousAssistantMessage: "您有 Telegram 应用吗？",
      knownPhone: "918273718271",
      knownTelegram: "",
      recentHistory: Array.from({ length: 12 }, (_, index) => ({
        direction: index % 2 ? "inbound" : "outbound",
        content: `message-${index}`,
        intent: "unknown",
        createdAt: ""
      }))
    }, { generateJson: generateJson as unknown as AiContextualIntentRuntime["generateJson"] });

    expect(result.intent).toBe("no_telegram");
    expect(result.answeredPreviousQuestion).toBe(true);
    expect(generateJson).toHaveBeenCalledWith(expect.any(Object), expect.stringContaining("我没有"), expect.objectContaining({
      maxOutputTokens: 260,
      temperature: 0
    }));
    const firstCall = generateJson.mock.calls[0] as unknown as [unknown, string, unknown];
    expect(firstCall[2] as Record<string, unknown>).toMatchObject({
      systemInstruction: expect.stringContaining("即使同时包含")
    });
    const payload = JSON.parse(firstCall[1]);
    expect(payload.recentHistory).toHaveLength(10);
    expect(payload.recentHistory[0].content).toBe("message-2");
  });

  it("falls back to unknown when provider JSON classification fails", async () => {
    const result = await classifyAiContextualIntent(config, {
      customerText: "好的",
      language: "zh",
      flowStep: "collect_telegram",
      previousAssistantMessage: "",
      knownPhone: "",
      knownTelegram: "",
      recentHistory: []
    }, {
      generateJson: vi.fn(async () => {
        throw new Error("provider failed");
      })
    });

    expect(result).toMatchObject({
      intent: "unknown",
      questionType: "none",
      nextAction: ""
    });
  });
});
