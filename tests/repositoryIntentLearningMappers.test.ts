import { describe, expect, it } from "vitest";
import { mapIntentLearningEvent } from "../src/repositoryIntentLearningMappers.js";

describe("repositoryIntentLearningMappers", () => {
  it("maps intent learning events and parses stored examples", () => {
    expect(mapIntentLearningEvent({
      id: 12,
      merchant_id: "m1",
      country_id: "m1:bo",
      conversation_id: "c1",
      message_id: 99,
      candidate_key: "telegram_username_help",
      suggested_intent: "ask_tg_register",
      examples_json: "[{\"text\":\"用户名在哪里\"},\"skip\"]",
      occurrence_count: 4
    })).toMatchObject({
      id: 12,
      merchantId: "m1",
      countryId: "m1:bo",
      conversationId: "c1",
      messageId: 99,
      candidateKey: "telegram_username_help",
      suggestedIntent: "ask_tg_register",
      status: "candidate",
      occurrenceCount: 4,
      examples: [{ text: "用户名在哪里" }]
    });
  });
});
