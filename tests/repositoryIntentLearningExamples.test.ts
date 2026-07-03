import { describe, expect, it } from "vitest";
import { buildIntentLearningExample, mergeIntentLearningExamples } from "../src/repositoryIntentLearningExamples.js";

describe("repositoryIntentLearningExamples", () => {
  it("builds clipped examples with stable metadata", () => {
    const example = buildIntentLearningExample({
      merchantId: "m1",
      countryId: "m1:bo",
      conversationId: "c1",
      messageId: 9,
      candidateKey: "new-intent",
      suggestedIntent: "custom_unknown",
      displayName: "新意图",
      description: "desc",
      customerText: "x".repeat(400),
      language: "zh",
      detectedIntent: "unknown",
      inferredIntent: "unknown",
      contextualIntent: "need_help",
      flowStep: "wait_registration"
    }, new Date("2026-07-03T00:00:00.000Z"));

    expect(example).toMatchObject({
      conversationId: "c1",
      messageId: 9,
      detectedIntent: "unknown",
      contextualIntent: "need_help",
      flowStep: "wait_registration",
      at: "2026-07-03T00:00:00.000Z"
    });
    expect(example.text).toHaveLength(303);
    expect(example.text.endsWith("...")).toBe(true);
  });

  it("keeps the newest example first and removes duplicate text", () => {
    const merged = mergeIntentLearningExamples(
      {
        text: "怎么找 Telegram 用户名",
        conversationId: "c2",
        messageId: null,
        detectedIntent: "unknown",
        inferredIntent: "unknown",
        contextualIntent: "telegram_username_help",
        flowStep: "collect_telegram",
        at: "2026-07-03T00:00:00.000Z"
      },
      JSON.stringify([
        { text: "怎么找 Telegram 用户名", conversationId: "old" },
        { text: "链接打不开", conversationId: "c1" },
        { text: "", conversationId: "empty" }
      ])
    );

    expect(merged).toEqual([
      {
        text: "怎么找 Telegram 用户名",
        conversationId: "c2",
        messageId: null,
        detectedIntent: "unknown",
        inferredIntent: "unknown",
        contextualIntent: "telegram_username_help",
        flowStep: "collect_telegram",
        at: "2026-07-03T00:00:00.000Z"
      },
      { text: "链接打不开", conversationId: "c1" }
    ]);
  });
});
