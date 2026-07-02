import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAiJson, selectedAiProvider } from "../src/clients/aiProviderRuntime.js";
import { loadConfig } from "../src/config.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AI provider runtime", () => {
  it("chooses the explicitly configured provider before key fallback", () => {
    expect(selectedAiProvider(loadConfig({
      AI_PROVIDER: "deepseek",
      MINIMAX_API_KEY: "sk-minimax",
      DEEPSEEK_API_KEY: "sk-deepseek"
    }))).toBe("deepseek");
  });

  it("parses fenced JSON returned by the selected provider", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "```json\n{\"ok\":true,\"provider\":\"minimax\"}\n```"
            }
          }
        ]
      })
    } as Response);

    const parsed = await generateAiJson<{ ok: boolean; provider: string }>(loadConfig({
      AI_PROVIDER: "minimax",
      MINIMAX_API_KEY: "sk-test",
      MINIMAX_MODEL: "MiniMax-M3"
    }), "return json");

    expect(parsed).toEqual({ ok: true, provider: "minimax" });
  });
});
