import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";
import { buildMerchantDashboard } from "../src/services/merchantDashboard.js";

describe("dashboard stats", () => {
  it("counts all merchant customers without list limits", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("不限数量统计商户");
    for (let i = 0; i < 520; i += 1) {
      const conversation = repos.getOrCreateConversation(`customer-${i}`, "a2c-a", "", merchant.id);
      repos.upsertCustomerFromConversation(conversation);
    }

    const dashboard = buildMerchantDashboard(repos, merchant.id);

    expect(dashboard.customers).toBe(520);
  });

  it("counts today's outbound replies with the Beijing day range", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("今日回复统计商户");
    const conversation = repos.getOrCreateConversation("customer-1", "a2c-a", "", merchant.id);
    repos.insertMessage({
      conversationId: conversation.id,
      direction: "outbound",
      content: "今天回复",
      msgType: "text",
      language: "zh",
      intent: "unknown"
    });
    repos.insertMessage({
      conversationId: conversation.id,
      direction: "inbound",
      content: "客户消息",
      msgType: "text",
      language: "zh",
      intent: "unknown"
    });

    const dashboard = buildMerchantDashboard(repos, merchant.id);

    expect(dashboard.todayReplies).toBe(1);
    expect(dashboard.replies).toBe(1);
    expect(dashboard.customerMessages).toBe(1);
  });

  it("counts conversations and messages by an explicit filtered range without list limits", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("筛选统计商户");
    for (let i = 0; i < 105; i += 1) {
      const conversation = repos.getOrCreateConversation(`range-customer-${i}`, "a2c-a", "", merchant.id);
      repos.insertMessage({
        conversationId: conversation.id,
        direction: "inbound",
        content: "客户消息",
        msgType: "text",
        language: "zh",
        intent: "unknown"
      });
    }

    const dashboard = buildMerchantDashboard(repos, merchant.id, { startAt: "2026-01-01", endAt: "2027-01-01" });

    expect(dashboard.conversations).toBe(105);
    expect(dashboard.customerMessages).toBe(105);
    expect(dashboard.rangeConversations).toBe(105);
    expect(dashboard.rangeCustomerMessages).toBe(105);
  });

  it("calculates average messages per conversation from customer and reply messages", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("平均消息统计商户");
    const first = repos.getOrCreateConversation("avg-customer-1", "a2c-a", "", merchant.id);
    const second = repos.getOrCreateConversation("avg-customer-2", "a2c-a", "", merchant.id);
    for (const conversation of [first, first, second]) {
      repos.insertMessage({
        conversationId: conversation.id,
        direction: "inbound",
        content: "客户消息",
        msgType: "text",
        language: "zh",
        intent: "unknown"
      });
    }
    repos.insertMessage({
      conversationId: first.id,
      direction: "outbound",
      content: "客服回复",
      msgType: "text",
      language: "zh",
      intent: "unknown"
    });

    const dashboard = buildMerchantDashboard(repos, merchant.id, { startAt: "2026-01-01", endAt: "2027-01-01" });

    expect(dashboard.conversations).toBe(2);
    expect(dashboard.customerMessages).toBe(3);
    expect(dashboard.replies).toBe(1);
    expect(dashboard.averageMessagesPerConversation).toBe(2);
    expect(dashboard.rangeAverageMessagesPerConversation).toBe(2);
  });
});
