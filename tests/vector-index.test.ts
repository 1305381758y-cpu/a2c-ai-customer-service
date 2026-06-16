import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";
import { VectorIndexService } from "../src/services/vectorIndex.js";

const config = { GOOGLE_AI_API_KEY: "test-key", GOOGLE_AI_MODEL: "gemini-2.5-flash" };

function repos() {
  return new Repositories(openDb(":memory:"));
}

function embedFor(text: string) {
  const normalized = text.toLowerCase();
  if (normalized.includes("telegram") || normalized.includes("tg")) return [1, 0, 0];
  if (normalized.includes("pix") || normalized.includes("提现")) return [0, 1, 0];
  return [0, 0, 1];
}

describe("vector index", () => {
  it("queues and embeds customer messages, samples, and knowledge", async () => {
    const r = repos();
    const merchant = r.createMerchant("向量测试商户");
    const country = r.ensurePrimaryCountry(merchant.id);
    const conversation = r.getOrCreateConversation("55110001", "18500001", "", merchant.id, country.id);
    r.insertMessage({
      conversationId: conversation.id,
      direction: "inbound",
      externalId: "msg-1",
      content: "How do I register Telegram?",
      msgType: "text",
      language: "en",
      intent: "ask_tg_register"
    });
    r.createTrainingSample(merchant.id, {
      customerMessage: "I do not have Telegram",
      standardReply: "Please download Telegram and send your @ username.",
      stage: "need_phone_or_tg",
      intent: "ask_tg_register",
      language: "en",
      keywords: "telegram",
      priority: 1,
      enabled: true
    }, country.id);
    r.createKnowledgeItem(merchant.id, {
      countryId: country.id,
      type: "faq",
      title: "Telegram 指引",
      content: "客户没有 Telegram 时，引导下载并发送 @ 用户名。",
      language: "zh"
    });

    const service = new VectorIndexService(r, async (_cfg, text) => ({ embedding: embedFor(text), model: "fake-embedding" }));
    const processed = await service.embedPending({ config, merchantId: merchant.id, countryId: country.id, limit: 10 });

    expect(processed.embedded).toBe(3);
    expect(r.vectorIndexStatus({ merchantId: merchant.id, countryId: country.id })).toContainEqual({ status: "embedded", sourceType: "message", count: 1 });
    expect(r.vectorIndexStatus({ merchantId: merchant.id, countryId: country.id })).toContainEqual({ status: "embedded", sourceType: "sample", count: 1 });
    expect(r.vectorIndexStatus({ merchantId: merchant.id, countryId: country.id })).toContainEqual({ status: "embedded", sourceType: "knowledge", count: 1 });
  });

  it("does not vectorize image URLs or media placeholders", () => {
    const r = repos();
    const merchant = r.createMerchant("图片商户");
    const country = r.ensurePrimaryCountry(merchant.id);
    const conversation = r.getOrCreateConversation("55110002", "18500002", "", merchant.id, country.id);
    r.insertMessage({
      conversationId: conversation.id,
      direction: "inbound",
      externalId: "image-1",
      content: "[图片]",
      msgType: "image",
      language: "unknown",
      intent: "unknown",
      rawPayload: { mediaUrl: "https://bucket-chatapp-file-internal.oss-ap-southeast-1.aliyuncs.com/1226109357673717760.jpg" }
    });
    r.upsertVectorDocument({
      merchantId: merchant.id,
      countryId: country.id,
      sourceType: "message",
      sourceId: "raw-url",
      content: "https://bucket-chatapp-file-internal.oss-ap-southeast-1.aliyuncs.com/1226109357673717760.jpg"
    });

    expect(r.vectorIndexStatus({ merchantId: merchant.id, countryId: country.id })).toEqual([]);
  });

  it("searches only within the same merchant and country", async () => {
    const r = repos();
    const merchantA = r.createMerchant("商户 A");
    const merchantB = r.createMerchant("商户 B");
    const countryA = r.ensurePrimaryCountry(merchantA.id);
    const countryB = r.ensurePrimaryCountry(merchantB.id);
    const conversationA = r.getOrCreateConversation("customer-a", "185-a", "", merchantA.id, countryA.id);
    const conversationB = r.getOrCreateConversation("customer-b", "185-b", "", merchantB.id, countryB.id);
    r.insertMessage({ conversationId: conversationA.id, direction: "inbound", externalId: "a", content: "Telegram help", msgType: "text", language: "en", intent: "ask_tg_register" });
    r.insertMessage({ conversationId: conversationB.id, direction: "inbound", externalId: "b", content: "Telegram competitor", msgType: "text", language: "en", intent: "ask_tg_register" });
    const service = new VectorIndexService(r, async (_cfg, text) => ({ embedding: embedFor(text), model: "fake-embedding" }));
    await service.embedPending({ config, limit: 10 });

    const hits = await service.retrieve({
      config,
      merchantId: merchantA.id,
      countryId: countryA.id,
      customerKey: "customer-a",
      conversationId: conversationA.id,
      query: "I need Telegram",
      limit: 10
    });

    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((hit) => hit.conversationId !== conversationB.id)).toBe(true);
  });

  it("marks embedding failures without blocking queued documents", async () => {
    const r = repos();
    const merchant = r.createMerchant("失败测试商户");
    const country = r.ensurePrimaryCountry(merchant.id);
    r.upsertVectorDocument({
      merchantId: merchant.id,
      countryId: country.id,
      sourceType: "knowledge",
      sourceId: "k1",
      content: "Telegram 指引"
    });
    const service = new VectorIndexService(r, async () => { throw new Error("quota exceeded"); });
    const processed = await service.embedPending({ config, merchantId: merchant.id, countryId: country.id });

    expect(processed.failed).toBe(1);
    expect(r.vectorIndexStatus({ merchantId: merchant.id, countryId: country.id })).toEqual([{ status: "failed", sourceType: "knowledge", count: 1 }]);
  });
});
