import { afterEach, describe, expect, it, vi } from "vitest";
import { detectAiLanguage, generateAiText } from "../src/clients/aiProvider.js";
import { deepSeekEffectiveMaxTokens } from "../src/clients/aiProviderTransport.js";
import { setAiCallRecorder, type AiCallTelemetryInput } from "../src/clients/aiProviderRuntime.js";
import { loadConfig } from "../src/config.js";

function config() {
  return loadConfig({
    AI_PROVIDER: "minimax",
    MINIMAX_API_KEY: "sk-test",
    MINIMAX_MODEL: "MiniMax-M3"
  });
}

afterEach(() => {
  setAiCallRecorder(undefined);
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
  it("allows limited concurrency while spacing MiniMax request starts", async () => {
    const callTimes: number[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callTimes.push(Date.now());
      await new Promise((resolve) => setTimeout(resolve, 500));
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
    expect(callTimes[1] - callTimes[0]).toBeGreaterThanOrEqual(200);
    expect(Date.now() - startedAt).toBeLessThan(1200);
  });
});

describe("DeepSeek provider", () => {
  it("uses one shared effective token policy for DeepSeek requests and telemetry", () => {
    expect(deepSeekEffectiveMaxTokens({ taskType: "intent_classification", maxOutputTokens: 80 })).toBe(512);
    expect(deepSeekEffectiveMaxTokens({ taskType: "contextual_intent", maxOutputTokens: 260 })).toBe(900);
    expect(deepSeekEffectiveMaxTokens({ taskType: "translation", maxOutputTokens: 80 })).toBe(80);
    expect(deepSeekEffectiveMaxTokens({})).toBe(1200);
  });

  it("calls the DeepSeek chat completions endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "DeepSeek OK"
            }
          }
        ]
      })
    } as Response);

    const text = await generateAiText(loadConfig({
      AI_PROVIDER: "deepseek",
      DEEPSEEK_API_KEY: "sk-deepseek-test",
      DEEPSEEK_MODEL: "deepseek-chat"
    }), "hello", { systemInstruction: "reply briefly", maxOutputTokens: 32 });

    expect(text).toBe("DeepSeek OK");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.deepseek.com/chat/completions");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer sk-deepseek-test" });
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.model).toBe("deepseek-chat");
    expect(body.messages).toEqual([
      { role: "system", content: "reply briefly" },
      { role: "user", content: "hello" }
    ]);
    expect(body.max_tokens).toBe(32);
  });

  it("raises DeepSeek token budget for short classification tasks that may emit reasoning content", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: "positive_confirmation"
            }
          }
        ]
      })
    } as Response);

    await generateAiText(loadConfig({
      AI_PROVIDER: "deepseek",
      DEEPSEEK_API_KEY: "sk-deepseek-test",
      DEEPSEEK_MODEL: "deepseek-v4-flash"
    }), "classify", { taskType: "intent_classification", maxOutputTokens: 80 });

    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.max_tokens).toBe(512);
  });

  it("raises DeepSeek token budget for contextual intent JSON classification", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: "{\"intent\":\"unknown\"}"
            }
          }
        ]
      })
    } as Response);

    await generateAiText(loadConfig({
      AI_PROVIDER: "deepseek",
      DEEPSEEK_API_KEY: "sk-deepseek-test",
      DEEPSEEK_MODEL: "deepseek-v4-flash"
    }), "classify context", { taskType: "contextual_intent", maxOutputTokens: 260 });

    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.max_tokens).toBe(900);
  });

  it("does not treat top-level OK message as a provider error when choices exist", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        message: "OK",
        choices: [
          {
            message: {
              content: "positive_confirmation"
            }
          }
        ]
      })
    } as Response);

    const text = await generateAiText(loadConfig({
      AI_PROVIDER: "deepseek",
      DEEPSEEK_API_KEY: "sk-deepseek-test",
      DEEPSEEK_MODEL: "deepseek-chat"
    }), "classify", { taskType: "intent_classification", maxOutputTokens: 32 });

    expect(text).toBe("positive_confirmation");
  });

  it("records a response summary when DeepSeek returns an empty message", async () => {
    const calls: AiCallTelemetryInput[] = [];
    setAiCallRecorder((input) => calls.push(input));
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "chatcmpl-empty",
        choices: [
          {
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: ""
            }
          }
        ]
      })
    } as Response);

    await expect(generateAiText(loadConfig({
      AI_PROVIDER: "deepseek",
      DEEPSEEK_API_KEY: "sk-deepseek-test",
      DEEPSEEK_MODEL: "deepseek-chat"
    }), "classify", { taskType: "intent_classification", maxOutputTokens: 32 })).rejects.toThrow("DeepSeek 返回内容为空");

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      provider: "deepseek",
      model: "deepseek-chat",
      taskType: "intent_classification",
      status: "error",
      httpStatus: 200
    });
    expect(JSON.parse(calls[0].requestSummary || "{}")).toMatchObject({
      taskType: "intent_classification",
      maxOutputTokens: 32,
      effectiveMaxOutputTokens: 512,
      userContentLength: 8
    });
    expect(JSON.parse(calls[0].responseSummary || "{}")).toMatchObject({
      choicesCount: 1,
      finishReason: "stop",
      contentType: "string",
      contentLength: 0,
      reasoningContentLength: 0
    });
  });
});
