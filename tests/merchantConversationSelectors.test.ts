import { describe, expect, it } from "vitest";

import type { A2CAccount, UnreadSummary } from "../frontend/src/types.js";
import { buildMerchantConversationsUrl, filterA2CAccounts, findAccountUnread, findConversationUnread } from "../frontend/src/conversations/merchantConversationSelectors.js";

const makeAccount = (overrides: Partial<A2CAccount>): A2CAccount => ({
  id: 1,
  merchantId: "merchant-1",
  countryId: "country-1",
  countryCode: "BR",
  countryName: "巴西",
  defaultLanguage: "pt",
  apiPhone: "551100000000",
  wabaId: "waba-1",
  status: 1,
  numberStatus: 1,
  qualityRating: 1,
  messagingLimit: 1000,
  verifiedName: "客服账号",
  enabled: true,
  syncedAt: "2026-07-03T00:00:00.000Z",
  ...overrides
});

describe("merchantConversationSelectors", () => {
  it("builds merchant conversation url for the selected A2C account", () => {
    const account = makeAccount({ apiPhone: "59170000000" });

    expect(buildMerchantConversationsUrl(account, { status: "active", language: "", limit: "100" }))
      .toBe("/api/merchant/conversations?status=active&limit=100&a2cAccountPhone=59170000000");
    expect(buildMerchantConversationsUrl(null, { status: "active" })).toBe("");
  });

  it("filters accounts by text and enabled state without hiding valid matches", () => {
    const accounts = [
      makeAccount({ id: 1, apiPhone: "551111", verifiedName: "巴西客服", countryName: "巴西", enabled: true }),
      makeAccount({ id: 2, apiPhone: "591222", verifiedName: "玻利维亚客服", countryName: "玻利维亚", enabled: false }),
      makeAccount({ id: 3, apiPhone: "639333", verifiedName: "菲律宾客服", countryName: "菲律宾", enabled: true })
    ];

    expect(filterA2CAccounts(accounts, "", "")).toHaveLength(3);
    expect(filterA2CAccounts(accounts, "591", "")).toEqual([accounts[1]]);
    expect(filterA2CAccounts(accounts, "客服", "enabled")).toEqual([accounts[0], accounts[2]]);
    expect(filterA2CAccounts(accounts, "玻利维亚", "disabled")).toEqual([accounts[1]]);
  });

  it("finds unread counts by account and conversation", () => {
    const unread: UnreadSummary[] = [
      { a2cAccountPhone: "551111", unreadCount: 5, conversations: [{ conversationId: "c1", customerPhone: "u1", unreadCount: 2 }] },
      { a2cAccountPhone: "591222", unreadCount: 3, conversations: [{ conversationId: "c2", customerPhone: "u2", unreadCount: 3 }] }
    ];

    expect(findAccountUnread(unread, "551111")).toBe(5);
    expect(findAccountUnread(unread, "missing")).toBe(0);
    expect(findConversationUnread(unread, "c2")).toBe(3);
    expect(findConversationUnread(unread, "missing")).toBe(0);
  });
});
