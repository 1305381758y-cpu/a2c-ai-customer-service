import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { translateTextWithAi } from "../src/clients/aiTranslationTask.js";

describe("AI translation task", () => {
  it("wraps translation text and target language for the provider adapter", async () => {
    const generateText = vi.fn(async () => "Hola");

    const result = await translateTextWithAi(loadConfig({ MINIMAX_API_KEY: "sk-test" }), {
      text: "你好",
      targetLanguage: "es",
      systemPrompt: "Translate to the target language."
    }, { generateText });

    expect(result).toBe("Hola");
    expect(generateText).toHaveBeenCalledWith(expect.any(Object), JSON.stringify({
      targetLanguage: "es",
      text: "你好"
    }), {
      systemInstruction: "Translate to the target language."
    });
  });
});
