import { describe, expect, it } from "vitest";

import { accountUnreadCount, conversationRowsQuery, conversationTimeZoneFor, conversationUnreadCount, filterConversationAccounts } from "../frontend/src/conversations/ConversationPageHelpers.js";
import type { A2CAccount, UnreadSummary } from "../frontend/src/types.js";

describe("frontend conversation page helpers", () => {
  it("filters A2C accounts by keyword and enabled status", () => {
    const accounts = [
      account({ apiPhone: "1001", verifiedName: "Star Dental", countryName: "玻利维亚", enabled: true }),
      account({ apiPhone: "2002", verifiedName: "Other", countryName: "巴西", enabled: false })
    ];

    expect(filterConversationAccounts(accounts, { keyword: "star", status: "" }).map((item) => item.apiPhone)).toEqual(["1001"]);
    expect(filterConversationAccounts(accounts, { keyword: "", status: "enabled" }).map((item) => item.apiPhone)).toEqual(["1001"]);
    expect(filterConversationAccounts(accounts, { keyword: "", status: "disabled" }).map((item) => item.apiPhone)).toEqual(["2002"]);
  });

  it("builds conversation rows query with account and time zone", () => {
    expect(conversationRowsQuery({ status: "active", limit: "100" }, "America/La_Paz", account({ apiPhone: "591" }))).toBe(
      "/api/merchant/conversations?status=active&limit=100&timeZone=America%2FLa_Paz&a2cAccountPhone=591"
    );
    expect(conversationRowsQuery({}, "Asia/Shanghai", null)).toBe("");
  });

  it("derives account and conversation unread counts", () => {
    const unread: UnreadSummary[] = [
      {
        a2cAccountPhone: "1001",
        unreadCount: 5,
        conversations: [
          { conversationId: "c1", customerPhone: "p1", unreadCount: 2 },
          { conversationId: "c2", customerPhone: "p2", unreadCount: 3 }
        ]
      }
    ];

    expect(accountUnreadCount(unread, "1001")).toBe(5);
    expect(accountUnreadCount(unread, "none")).toBe(0);
    expect(conversationUnreadCount(unread, "c2")).toBe(3);
    expect(conversationUnreadCount(unread, "none")).toBe(0);
  });

  it("uses country time zone only when the page is set to country time", () => {
    expect(conversationTimeZoneFor(account({ countryCode: "bo" }), "country")).toBe("America/La_Paz");
    expect(conversationTimeZoneFor(account({ countryCode: "bo" }), "beijing")).toBe("Asia/Shanghai");
    expect(conversationTimeZoneFor(null, "country")).toBe("Asia/Shanghai");
  });
});

function account(patch: Partial<A2CAccount> = {}): A2CAccount {
  return {
    id: 1,
    merchantId: "merchant-1",
    countryId: "country-1",
    countryCode: "br",
    countryName: "巴西",
    defaultLanguage: "pt-BR",
    apiPhone: "1001",
    wabaId: "",
    status: 1,
    numberStatus: 1,
    qualityRating: 1,
    messagingLimit: 1000,
    verifiedName: "Account",
    enabled: true,
    syncedAt: "2026-07-01 00:00:00",
    ...patch
  };
}
