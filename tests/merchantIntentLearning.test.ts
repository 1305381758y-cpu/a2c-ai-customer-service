import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";
import { listMerchantIntentLearningEvents, patchMerchantIntentLearningEvent } from "../src/services/merchantIntentLearning.js";

function recordEvent(repos: Repositories, input: { merchantId: string; countryId: string; customerText: string; candidateKey: string; suggestedIntent?: string }) {
  return repos.recordIntentLearningEvent({
    merchantId: input.merchantId,
    countryId: input.countryId,
    conversationId: `${input.merchantId}:conversation`,
    customerText: input.customerText,
    language: "zh",
    detectedIntent: "unknown",
    inferredIntent: "unknown",
    contextualIntent: input.suggestedIntent ?? "workflow_question",
    flowStep: "wait_registration",
    candidateKey: input.candidateKey,
    suggestedIntent: input.suggestedIntent ?? "workflow_question",
    displayName: "流程问题",
    description: "客户需要开户注册帮助"
  });
}

describe("merchantIntentLearning service", () => {
  it("lists intent learning events within the merchant scope", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchantA = repos.createMerchant("意图学习商户A");
    const merchantB = repos.createMerchant("意图学习商户B");
    const countryA = repos.ensurePrimaryCountry(merchantA.id);
    const countryB = repos.ensurePrimaryCountry(merchantB.id);
    recordEvent(repos, { merchantId: merchantA.id, countryId: countryA.id, customerText: "怎么注册", candidateKey: "a:workflow" });
    recordEvent(repos, { merchantId: merchantB.id, countryId: countryB.id, customerText: "链接打不开", candidateKey: "b:workflow" });

    const result = listMerchantIntentLearningEvents(repos, merchantA.id, {});

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ merchantId: merchantA.id, customerText: "怎么注册" });
  });

  it("filters by status and suggested intent", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("意图筛选商户");
    const country = repos.ensurePrimaryCountry(merchant.id);
    const workflow = recordEvent(repos, { merchantId: merchant.id, countryId: country.id, customerText: "怎么注册", candidateKey: "workflow", suggestedIntent: "workflow_question" });
    const trust = recordEvent(repos, { merchantId: merchant.id, countryId: country.id, customerText: "安全吗", candidateKey: "trust", suggestedIntent: "trust_concern" });
    repos.patchIntentLearningEvent(workflow.id, { status: "promoted" }, merchant.id);
    repos.patchIntentLearningEvent(trust.id, { status: "ignored" }, merchant.id);

    const result = listMerchantIntentLearningEvents(repos, merchant.id, { status: "promoted", suggestedIntent: "workflow_question" });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ id: workflow.id, status: "promoted", suggestedIntent: "workflow_question" });
  });

  it("searches event text and returns total independent of the list limit", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("意图搜索商户");
    const country = repos.ensurePrimaryCountry(merchant.id);
    recordEvent(repos, { merchantId: merchant.id, countryId: country.id, customerText: "链接打不开", candidateKey: "link-1", suggestedIntent: "need_help" });
    recordEvent(repos, { merchantId: merchant.id, countryId: country.id, customerText: "还是链接打不开", candidateKey: "link-2", suggestedIntent: "need_help" });

    const result = listMerchantIntentLearningEvents(repos, merchant.id, { q: "链接", limit: "1" });

    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(2);
  });

  it("uses server offsets and returns status metrics for the full filtered range", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("意图分页商户");
    const country = repos.ensurePrimaryCountry(merchant.id);
    const first = recordEvent(repos, { merchantId: merchant.id, countryId: country.id, customerText: "问题一", candidateKey: "page-1" });
    recordEvent(repos, { merchantId: merchant.id, countryId: country.id, customerText: "问题二", candidateKey: "page-2" });
    repos.patchIntentLearningEvent(first.id, { status: "reviewed" }, merchant.id);

    const result = listMerchantIntentLearningEvents(repos, merchant.id, { limit: "1", offset: "1" });

    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(2);
    expect(result.metrics).toMatchObject({ candidate: 1, reviewed: 1, promoted: 0, ignored: 0 });
  });

  it("filters by the last seen time range", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("意图时间筛选商户");
    const country = repos.ensurePrimaryCountry(merchant.id);
    const oldEvent = recordEvent(repos, { merchantId: merchant.id, countryId: country.id, customerText: "昨天链接打不开", candidateKey: "old-link", suggestedIntent: "need_help" });
    const newEvent = recordEvent(repos, { merchantId: merchant.id, countryId: country.id, customerText: "今天链接打不开", candidateKey: "new-link", suggestedIntent: "need_help" });
    db.sqlite.prepare("UPDATE intent_learning_events SET last_seen_at = ? WHERE id = ?").run("2026-07-03 10:00:00", oldEvent.id);
    db.sqlite.prepare("UPDATE intent_learning_events SET last_seen_at = ? WHERE id = ?").run("2026-07-04 10:00:00", newEvent.id);

    const result = listMerchantIntentLearningEvents(repos, merchant.id, {
      startAt: "2026-07-04T00:00:00+08:00",
      endAt: "2026-07-05T00:00:00+08:00"
    });

    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.rows[0].id).toBe(newEvent.id);
  });

  it("patches only events that belong to the merchant", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchantA = repos.createMerchant("意图修改商户A");
    const merchantB = repos.createMerchant("意图修改商户B");
    const countryA = repos.ensurePrimaryCountry(merchantA.id);
    const event = recordEvent(repos, { merchantId: merchantA.id, countryId: countryA.id, customerText: "我不会注册", candidateKey: "need-help" });

    expect(patchMerchantIntentLearningEvent(repos, merchantB.id, String(event.id), { status: "promoted" })).toEqual({
      ok: false,
      statusCode: 404,
      error: "intent learning event not found"
    });
    expect(patchMerchantIntentLearningEvent(repos, merchantA.id, String(event.id), { status: "promoted", displayName: "注册帮助" })).toMatchObject({
      ok: true,
      value: { id: event.id, status: "promoted", displayName: "注册帮助" }
    });
  });

  it("rejects invalid ids before reaching the repository", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("意图非法ID商户");

    expect(patchMerchantIntentLearningEvent(repos, merchant.id, "not-a-number", { status: "promoted" })).toEqual({
      ok: false,
      statusCode: 400,
      error: "invalid id"
    });
  });
});
