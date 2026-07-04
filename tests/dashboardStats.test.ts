import { afterEach, describe, expect, it, vi } from "vitest";
import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";
import { buildMerchantDashboard } from "../src/services/merchantDashboard.js";

describe("dashboard stats", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("splits today's conversations into new and repeat customer conversations", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("新增重复会话统计商户");
    const oldConversation = repos.getOrCreateConversation("repeat-customer", "a2c-a", "", merchant.id);
    db.sqlite.prepare("UPDATE conversations SET created_at = '2020-01-01 00:00:00' WHERE id = ?").run(oldConversation.id);

    repos.getOrCreateConversation("repeat-customer", "a2c-b", "", merchant.id);
    repos.getOrCreateConversation("new-customer", "a2c-a", "", merchant.id);

    const dashboard = buildMerchantDashboard(repos, merchant.id);

    expect(dashboard.todayConversations).toBe(2);
    expect(dashboard.todayNewConversations).toBe(1);
    expect(dashboard.todayRepeatConversations).toBe(1);
  });

  it("uses the requested timezone for today's dashboard range", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T12:00:00Z"));
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("玻利维亚统计商户");
    const conversation = repos.getOrCreateConversation("bolivia-boundary-customer", "a2c-a", "", merchant.id);
    db.sqlite.prepare("UPDATE conversations SET created_at = '2026-07-04 02:00:00', updated_at = '2026-07-04 02:00:00' WHERE id = ?").run(conversation.id);

    const beijingDashboard = buildMerchantDashboard(repos, merchant.id, { timeZone: "Asia/Shanghai" });
    const boliviaDashboard = buildMerchantDashboard(repos, merchant.id, { timeZone: "America/La_Paz" });

    expect(beijingDashboard.todayConversations).toBe(1);
    expect(boliviaDashboard.todayConversations).toBe(0);
  });

  it("counts new customers by customer creation time instead of activity time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T12:00:00Z"));
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("新增客户统计商户");
    const oldCustomerConversation = repos.getOrCreateConversation("old-active-customer", "a2c-a", "", merchant.id);
    repos.upsertCustomerFromConversation(oldCustomerConversation);
    db.sqlite.prepare("UPDATE customers SET created_at = '2026-07-01 00:00:00', last_seen_at = '2026-07-04 06:00:00' WHERE customer_key = ?").run("old-active-customer");

    const newCustomerConversation = repos.getOrCreateConversation("new-customer", "a2c-a", "", merchant.id);
    repos.upsertCustomerFromConversation(newCustomerConversation);
    db.sqlite.prepare("UPDATE customers SET created_at = '2026-07-04 06:00:00', last_seen_at = '2026-07-04 06:00:00' WHERE customer_key = ?").run("new-customer");

    const dashboard = buildMerchantDashboard(repos, merchant.id, { timeZone: "Asia/Shanghai" });

    expect(dashboard.customers).toBe(2);
    expect(dashboard.todayCustomers).toBe(1);
  });
});
