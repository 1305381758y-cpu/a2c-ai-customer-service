import { afterEach, describe, expect, it, vi } from "vitest";
import { detectAiLanguage } from "../src/clients/aiProvider.js";
import { loadConfig } from "../src/config.js";

function config() {
  return loadConfig({
    AI_PROVIDER: "minimax",
    MINIMAX_API_KEY: "sk-test",
    MINIMAX_MODEL: "MiniMax-M3"
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AI provider language detection", () => {
  it("returns the provider language code instead of re-parsing the customer text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "es"
            }
          }
        ]
      })
    } as Response);

    const language = await detectAiLanguage(config(), {
      customerText: "Si",
      previousLanguage: "en",
      countryDefaultLanguage: "es",
      recentHistory: []
    });

    expect(language).toBe("es");
  });
});
