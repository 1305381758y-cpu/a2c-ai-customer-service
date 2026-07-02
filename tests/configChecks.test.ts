import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";
import { checkMerchantConfig } from "../src/services/configChecks.js";

function setup() {
  const repos = new Repositories(openDb(":memory:"));
  const merchant = repos.createMerchant("配置检测单元商户");
  return { repos, merchant };
}

describe("merchant config checks", () => {
  it("uses the AiTasks availability interface for AI provider checks", async () => {
    const { repos, merchant } = setup();
    repos.patchMerchantConfig(merchant.id, {
      aiProvider: "deepseek",
      deepseekApiKey: "deepseek-test",
      deepseekModel: "deepseek-chat"
    });
    const ai = {
      checkAvailability: vi.fn(async () => undefined)
    };

    const result = await checkMerchantConfig(repos, loadConfig({ DATABASE_URL: ":memory:" }), merchant.id, ai);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected config check to succeed");
    expect(ai.checkAvailability).toHaveBeenCalledWith(expect.objectContaining({
      AI_PROVIDER: "deepseek",
      DEEPSEEK_API_KEY: "deepseek-test",
      DEEPSEEK_MODEL: "deepseek-chat"
    }));
    expect(result.value.rows.find((row) => row.key === "ai")).toMatchObject({
      ok: true,
      status: "ok",
      detail: "DeepSeek 可用，当前模型 deepseek-chat；客户消息会优先调用 AI 回复"
    });
  });

  it("reports AiTasks availability errors without calling provider code directly", async () => {
    const { repos, merchant } = setup();
    repos.patchMerchantConfig(merchant.id, {
      aiProvider: "minimax",
      minimaxApiKey: "minimax-test",
      minimaxModel: "MiniMax-M3"
    });
    const ai = {
      checkAvailability: vi.fn(async () => {
        throw new Error("MiniMax 调用失败：额度不足");
      })
    };

    const result = await checkMerchantConfig(repos, loadConfig({ DATABASE_URL: ":memory:" }), merchant.id, ai);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected config check to succeed");
    expect(ai.checkAvailability).toHaveBeenCalledOnce();
    expect(result.value.rows.find((row) => row.key === "ai")).toMatchObject({
      ok: false,
      status: "error",
      detail: "MiniMax 调用失败：额度不足"
    });
  });
});
