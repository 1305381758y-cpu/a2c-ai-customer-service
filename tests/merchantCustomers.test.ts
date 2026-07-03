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
