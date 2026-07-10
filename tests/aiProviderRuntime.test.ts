import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAiJson, generateAiText, selectedAiProvider } from "../src/clients/aiProviderRuntime.js";
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

  it("retries DeepSeek when reasoning consumes the first output budget", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ finish_reason: "length", message: { content: "", reasoning_content: "long reasoning" } }] })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ finish_reason: "stop", message: { content: "{\"intent\":\"unknown\"}" } }] })
      } as Response);

    await expect(generateAiText(loadConfig({
      AI_PROVIDER: "deepseek",
      DEEPSEEK_API_KEY: "sk-test",
      DEEPSEEK_MODEL: "deepseek-chat"
    }), "classify", { taskType: "contextual_intent", maxOutputTokens: 260 })).resolves.toContain("unknown");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(secondBody.max_tokens).toBeGreaterThan(firstBody.max_tokens);
  });
});
