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
    repos.recordAiCall({ merchantId: merchant.id, provider: "minimax", model: "MiniMax-M3", taskType: "translation", status: "error", durationMs: 300, error: "rate limit", httpStatus: 429, requestSummary: "{\"maxOutputTokens\":1200}", responseSummary: "{\"providerError\":\"rate limit\"}" });
    repos.recordAiCall({ merchantId: merchant.id, provider: "deepseek", model: "deepseek-chat", taskType: "intent_classification", status: "success", durationMs: 80 });

    const stats = getMerchantAiCallStats(repos, merchant.id, {});

    expect(stats).toMatchObject({ totalCalls: 3, successCalls: 2, errorCalls: 1, successRate: 66.7 });
    expect(stats.availableProviders).toEqual(["deepseek", "minimax"]);
    expect(stats.availableTaskTypes).toEqual(["intent_classification", "translation"]);
    expect(stats.byType.find((row) => row.taskType === "translation")).toMatchObject({ totalCalls: 2, successCalls: 1, errorCalls: 1, successRate: 50 });
    expect(stats.byProvider.find((row) => row.provider === "minimax")).toMatchObject({ totalCalls: 2, successRate: 50 });
    expect(stats.byTypeDetails.find((row) => row.taskType === "translation" && row.provider === "minimax")).toMatchObject({
      model: "MiniMax-M3",
      totalCalls: 2,
      successCalls: 1,
      errorCalls: 1,
      successRate: 50
    });
    expect(stats.byError).toEqual([{
      taskType: "translation",
      provider: "minimax",
      model: "MiniMax-M3",
      errorMessage: "rate limit",
      httpStatus: 429,
      requestSummary: "{\"maxOutputTokens\":1200}",
      responseSummary: "{\"providerError\":\"rate limit\"}",
      errorCalls: 1,
      lastFailedAt: expect.any(String)
    }]);
  });

  it("filters model calls by provider while keeping provider choices available", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("供应商筛选商户");
    repos.recordAiCall({ merchantId: merchant.id, provider: "minimax", model: "MiniMax-M3", taskType: "translation", status: "success", durationMs: 120 });
    repos.recordAiCall({ merchantId: merchant.id, provider: "deepseek", model: "deepseek-chat", taskType: "intent_classification", status: "success", durationMs: 80 });
    repos.recordAiCall({ merchantId: merchant.id, provider: "deepseek", model: "deepseek-chat", taskType: "contextual_intent", status: "error", durationMs: 15000, error: "DeepSeek 返回内容为空", httpStatus: 200, requestSummary: "{\"maxOutputTokens\":260}", responseSummary: "{\"choicesCount\":1,\"contentLength\":0}" });

    const stats = getMerchantAiCallStats(repos, merchant.id, { provider: "deepseek" });

    expect(stats).toMatchObject({ totalCalls: 2, successCalls: 1, errorCalls: 1, successRate: 50 });
    expect(stats.availableProviders).toEqual(["deepseek", "minimax"]);
    expect(stats.availableTaskTypes).toEqual(["contextual_intent", "intent_classification"]);
    expect(stats.byProvider).toEqual([{ provider: "deepseek", totalCalls: 2, successCalls: 1, errorCalls: 1, successRate: 50, averageDurationMs: 7540 }]);
    expect(stats.byTypeDetails).toEqual(expect.arrayContaining([{
      taskType: "intent_classification",
      provider: "deepseek",
      model: "deepseek-chat",
      totalCalls: 1,
      successCalls: 1,
      errorCalls: 0,
      successRate: 100,
      averageDurationMs: 80,
      lastCalledAt: expect.any(String)
    }]));
    expect(stats.byError).toEqual([{
      taskType: "contextual_intent",
      provider: "deepseek",
      model: "deepseek-chat",
      errorMessage: "DeepSeek 返回内容为空",
      httpStatus: 200,
      requestSummary: "{\"maxOutputTokens\":260}",
      responseSummary: "{\"choicesCount\":1,\"contentLength\":0}",
      errorCalls: 1,
      lastFailedAt: expect.any(String)
    }]);
  });

  it("filters model calls by task type while keeping task type choices available", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("调用类型筛选商户");
    repos.recordAiCall({ merchantId: merchant.id, provider: "deepseek", model: "deepseek-chat", taskType: "translation", status: "success", durationMs: 100 });
    repos.recordAiCall({ merchantId: merchant.id, provider: "deepseek", model: "deepseek-chat", taskType: "intent_classification", status: "error", durationMs: 200, error: "DeepSeek 返回内容为空" });
    repos.recordAiCall({ merchantId: merchant.id, provider: "minimax", model: "MiniMax-M3", taskType: "intent_classification", status: "success", durationMs: 300 });

    const stats = getMerchantAiCallStats(repos, merchant.id, { taskType: "intent_classification" });

    expect(stats).toMatchObject({ totalCalls: 2, successCalls: 1, errorCalls: 1, successRate: 50 });
    expect(stats.availableTaskTypes).toEqual(["intent_classification", "translation"]);
    expect(stats.byType).toEqual([{ taskType: "intent_classification", totalCalls: 2, successCalls: 1, errorCalls: 1, successRate: 50, averageDurationMs: 250 }]);
    expect(stats.byProvider).toEqual(expect.arrayContaining([
      { provider: "deepseek", totalCalls: 1, successCalls: 0, errorCalls: 1, successRate: 0, averageDurationMs: 200 },
      { provider: "minimax", totalCalls: 1, successCalls: 1, errorCalls: 0, successRate: 100, averageDurationMs: 300 }
    ]));
    expect(stats.byError).toEqual([{
      taskType: "intent_classification",
      provider: "deepseek",
      model: "deepseek-chat",
      errorMessage: "DeepSeek 返回内容为空",
      httpStatus: null,
      requestSummary: "",
      responseSummary: "",
      errorCalls: 1,
      lastFailedAt: expect.any(String)
    }]);
  });

  it("filters model calls by success or failure status", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("调用状态筛选商户");
    repos.recordAiCall({ merchantId: merchant.id, provider: "deepseek", model: "deepseek-chat", taskType: "translation", status: "success", durationMs: 100 });
    repos.recordAiCall({ merchantId: merchant.id, provider: "deepseek", model: "deepseek-chat", taskType: "contextual_intent", status: "error", durationMs: 400, error: "DeepSeek 返回内容为空", requestSummary: "{\"maxOutputTokens\":260}", responseSummary: "{\"finishReason\":\"length\"}" });
    repos.recordAiCall({ merchantId: merchant.id, provider: "minimax", model: "MiniMax-M3", taskType: "translation", status: "success", durationMs: 200 });

    const failedStats = getMerchantAiCallStats(repos, merchant.id, { status: "error" });
    const successStats = getMerchantAiCallStats(repos, merchant.id, { status: "success" });

    expect(failedStats).toMatchObject({ totalCalls: 1, successCalls: 0, errorCalls: 1, successRate: 0, averageDurationMs: 400 });
    expect(failedStats.byError).toEqual([{
      taskType: "contextual_intent",
      provider: "deepseek",
      model: "deepseek-chat",
      errorMessage: "DeepSeek 返回内容为空",
      httpStatus: null,
      requestSummary: "{\"maxOutputTokens\":260}",
      responseSummary: "{\"finishReason\":\"length\"}",
      errorCalls: 1,
      lastFailedAt: expect.any(String)
    }]);
    expect(successStats).toMatchObject({ totalCalls: 2, successCalls: 2, errorCalls: 0, successRate: 100, averageDurationMs: 150 });
    expect(successStats.byError).toEqual([]);
  });

  it("filters datetime-local ranges using the selected timezone", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("模型调用时区商户");
    repos.recordAiCall({ merchantId: merchant.id, provider: "deepseek", model: "deepseek-chat", taskType: "translation", status: "success", durationMs: 100 });
    repos.recordAiCall({ merchantId: merchant.id, provider: "deepseek", model: "deepseek-chat", taskType: "translation", status: "success", durationMs: 100 });
    const rows = db.sqlite.prepare("SELECT id FROM ai_call_logs ORDER BY id ASC").all() as Array<{ id: number }>;
    db.sqlite.prepare("UPDATE ai_call_logs SET created_at = ? WHERE id = ?").run("2026-07-04 02:30:00", rows[0].id);
    db.sqlite.prepare("UPDATE ai_call_logs SET created_at = ? WHERE id = ?").run("2026-07-04 14:30:00", rows[1].id);

    const beijingStats = getMerchantAiCallStats(repos, merchant.id, { startAt: "2026-07-04T10:00:00", endAt: "2026-07-04T11:00:00", timeZone: "Asia/Shanghai" });
    const boliviaStats = getMerchantAiCallStats(repos, merchant.id, { startAt: "2026-07-04T10:00:00", endAt: "2026-07-04T11:00:00", timeZone: "America/La_Paz" });

    expect(beijingStats.totalCalls).toBe(1);
    expect(boliviaStats.totalCalls).toBe(1);
    expect(beijingStats.byTypeDetails[0].lastCalledAt).toBe("2026-07-04 02:30:00");
    expect(boliviaStats.byTypeDetails[0].lastCalledAt).toBe("2026-07-04 14:30:00");
  });
});
