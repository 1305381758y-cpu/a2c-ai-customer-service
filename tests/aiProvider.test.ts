import { afterEach, describe, expect, it, vi } from "vitest";
import { detectAiLanguage, generateAiText } from "../src/clients/aiProvider.js";
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

describe("MiniMax request queue", () => {
  it("serializes concurrent MiniMax calls to avoid token plan rate limits", async () => {
    const callTimes: number[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callTimes.push(Date.now());
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "OK"
              }
            }
          ]
        })
      } as Response;
    });

    const startedAt = Date.now();
    const [first, second] = await Promise.all([
      generateAiText(config(), "first"),
      generateAiText(config(), "second")
    ]);

    expect(first).toBe("OK");
    expect(second).toBe("OK");
    expect(callTimes).toHaveLength(2);
    expect(callTimes[1] - callTimes[0]).toBeGreaterThanOrEqual(850);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(850);
  });
});
