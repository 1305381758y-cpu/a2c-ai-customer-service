import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";
import { getMerchantAiCallStats } from "../src/services/aiCallStats.js";

describe("AI call stats", () => {
  it("counts model calls by status, type and provider", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("模型调用统计商户");
    repos.recordAiCall({ merchantId: merchant.id, provider: "minimax", model: "MiniMax-M3", taskType: "translation", status: "success", durationMs: 120 });
    repos.recordAiCall({ merchantId: merchant.id, provider: "minimax", model: "MiniMax-M3", taskType: "translation", status: "error", durationMs: 300, error: "rate limit" });
    repos.recordAiCall({ merchantId: merchant.id, provider: "deepseek", model: "deepseek-chat", taskType: "intent_classification", status: "success", durationMs: 80 });

    const stats = getMerchantAiCallStats(repos, merchant.id, {});

    expect(stats).toMatchObject({ totalCalls: 3, successCalls: 2, errorCalls: 1 });
    expect(stats.byType.find((row) => row.taskType === "translation")).toMatchObject({ totalCalls: 2, successCalls: 1, errorCalls: 1 });
    expect(stats.byProvider.find((row) => row.provider === "minimax")).toMatchObject({ totalCalls: 2 });
  });
});
