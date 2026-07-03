import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { checkAiAvailability } from "../src/clients/aiAvailabilityTask.js";

describe("AI availability task", () => {
  it("checks the configured provider with a lightweight text request", async () => {
    const generateText = vi.fn(async () => "OK");
    const config = loadConfig({ MINIMAX_API_KEY: "sk-test" });

    await checkAiAvailability(config, { generateText });

    expect(generateText).toHaveBeenCalledWith(config, "Reply with OK only.", { taskType: "availability_check" });
  });

  it("lets provider errors bubble up to the config check caller", async () => {
    const generateText = vi.fn(async () => {
      throw new Error("invalid api key");
    });

    await expect(checkAiAvailability(loadConfig({ MINIMAX_API_KEY: "bad-key" }), { generateText }))
      .rejects
      .toThrow("invalid api key");
  });
});
