import { describe, expect, it } from "vitest";
import { buildMarkAllReadQuery, groupUnreadSummaryRows } from "../src/repositoryConversationUnread.js";

describe("repository conversation unread helpers", () => {
  it("builds mark-all-read filters with optional A2C account scope", () => {
    expect(buildMarkAllReadQuery("merchant-1")).toEqual({
      where: "merchant_id = ? AND unread_count > 0",
      params: ["merchant-1"]
    });
    expect(buildMarkAllReadQuery("merchant-1", { a2cAccountPhone: "a2c-1" })).toEqual({
      where: "merchant_id = ? AND unread_count > 0 AND a2c_account_phone = ?",
      params: ["merchant-1", "a2c-1"]
    });
  });

  it("groups unread rows by A2C account and preserves conversation rows", () => {
    expect(groupUnreadSummaryRows([
      { a2c_account_phone: "a2c-1", conversation_id: "c1", customer_phone: "customer-1", unread_count: 2 },
      { a2c_account_phone: "a2c-1", conversation_id: "c2", customer_phone: "customer-2", unread_count: 3 },
      { a2c_account_phone: "a2c-2", conversation_id: "c3", customer_phone: "customer-3", unread_count: 1 }
    ])).toEqual([
      {
        a2cAccountPhone: "a2c-1",
        unreadCount: 5,
        conversations: [
          { conversationId: "c1", customerPhone: "customer-1", unreadCount: 2 },
          { conversationId: "c2", customerPhone: "customer-2", unreadCount: 3 }
        ]
      },
      {
        a2cAccountPhone: "a2c-2",
        unreadCount: 1,
        conversations: [
          { conversationId: "c3", customerPhone: "customer-3", unreadCount: 1 }
        ]
      }
    ]);
  });
});
