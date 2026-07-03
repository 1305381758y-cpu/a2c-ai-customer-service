import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";
import { deleteMerchantCustomer, listMerchantCustomers } from "../src/services/merchantCustomers.js";

describe("merchantCustomers service", () => {
  it("lists customers within the merchant scope", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchantA = repos.createMerchant("客户商户A");
    const merchantB = repos.createMerchant("客户商户B");
    const conversationA = repos.getOrCreateConversation("customer-a", "a2c-a", "客户A", merchantA.id);
    const conversationB = repos.getOrCreateConversation("customer-b", "a2c-b", "客户B", merchantB.id);
    repos.upsertCustomerFromConversation(conversationA);
    repos.upsertCustomerFromConversation(conversationB);

    const result = listMerchantCustomers(repos, merchantA.id, {});

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ merchantId: merchantA.id, customerKey: "customer-a" });
  });

  it("filters customers by their latest activity time", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("客户时间筛选商户");
    const todayConversation = repos.getOrCreateConversation("today-customer", "a2c-a", "今日客户", merchant.id);
    const oldConversation = repos.getOrCreateConversation("old-customer", "a2c-a", "历史客户", merchant.id);
    repos.upsertCustomerFromConversation(todayConversation);
    repos.upsertCustomerFromConversation(oldConversation);
    db.sqlite.prepare("UPDATE customers SET last_seen_at = ? WHERE customer_key = ?").run("2026-07-03 01:20:00", "today-customer");
    db.sqlite.prepare("UPDATE customers SET last_seen_at = ? WHERE customer_key = ?").run("2026-07-01 23:59:00", "old-customer");

    const result = listMerchantCustomers(repos, merchant.id, { startAt: "2026-07-03T00:00:00Z", endAt: "2026-07-04T00:00:00Z" });

    expect(result.rows.map((row) => row.customerKey)).toEqual(["today-customer"]);
    expect(result.total).toBe(1);
  });

  it("searches customers and returns a count independent of the list limit", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("客户搜索商户");
    for (let i = 0; i < 3; i += 1) {
      const conversation = repos.getOrCreateConversation(`search-target-${i}`, "a2c-a", `搜索客户${i}`, merchant.id);
      repos.upsertCustomerFromConversation({ ...conversation, extractedTelegram: `@target_${i}` });
    }

    const result = listMerchantCustomers(repos, merchant.id, { q: "target", limit: "1" });

    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(3);
  });

  it("hard deletes a merchant customer and all of their conversations", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("客户删除服务商户");
    const firstConversation = repos.getOrCreateConversation("delete-customer", "a2c-1", "待删客户", merchant.id);
    const secondConversation = repos.getOrCreateConversation("delete-customer", "a2c-2", "待删客户", merchant.id);
    repos.insertMessage({
      conversationId: firstConversation.id,
      direction: "inbound",
      externalId: "message-1",
      content: "hello",
      msgType: "text",
      language: "zh",
      intent: "greeting"
    });
    repos.insertMessage({
      conversationId: secondConversation.id,
      direction: "inbound",
      externalId: "message-2",
      content: "你好",
      msgType: "text",
      language: "zh",
      intent: "greeting"
    });
    repos.upsertCustomerFromConversation(firstConversation);
    repos.upsertCustomerFromConversation(secondConversation);

    const result = deleteMerchantCustomer(repos, merchant.id, "delete-customer");

    expect(result).toEqual({
      ok: true,
      value: {
        ok: true,
        deleted: true,
        conversationsDeleted: 2,
        messagesDeleted: 2
      }
    });
    expect(listMerchantCustomers(repos, merchant.id, {}).rows).toHaveLength(0);
    expect(repos.listConversations({ merchantId: merchant.id })).toHaveLength(0);
  });

  it("returns not found when deleting a missing customer", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("客户删除服务商户");

    expect(deleteMerchantCustomer(repos, merchant.id, "missing")).toEqual({
      ok: false,
      statusCode: 404,
      error: "customer not found"
    });
  });
});
