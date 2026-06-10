import { describe, expect, it } from "vitest";
import { rankSamples } from "../src/domain/sampleRetrieval.js";

describe("sample retrieval", () => {
  it("prioritizes matching intent and language", () => {
    const samples = rankSamples(
      [
        {
          id: 1,
          customerMessage: "我要注册",
          standardReply: "中文回复",
          stage: "need_platform_register",
          intent: "ask_platform_register",
          language: "zh",
          keywords: "注册",
          priority: 1
        },
        {
          id: 2,
          customerMessage: "bonus",
          standardReply: "English reply",
          stage: "need_platform_register",
          intent: "ask_promotion",
          language: "en",
          keywords: "bonus",
          priority: 100
        }
      ],
      {
        text: "怎么注册",
        language: "zh",
        intent: "ask_platform_register",
        stage: "need_platform_register"
      }
    );
    expect(samples[0].id).toBe(1);
  });
});
