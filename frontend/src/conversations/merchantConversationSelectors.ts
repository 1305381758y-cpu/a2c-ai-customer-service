import { withQuery } from "../app/api.js";
import type { A2CAccount, Filters, UnreadSummary } from "../types.js";

export function buildMerchantConversationsUrl(selectedAccount: A2CAccount | null, filters: Filters) {
  return selectedAccount
    ? withQuery("/api/merchant/conversations", { ...filters, a2cAccountPhone: selectedAccount.apiPhone })
    : "";
}

export function filterA2CAccounts(accounts: A2CAccount[], keywordValue: string, status: string) {
  const keyword = keywordValue.trim().toLowerCase();
  return accounts.filter((account) => {
    const text = [account.verifiedName, account.apiPhone, account.countryName, account.countryCode, account.wabaId].join(" ").toLowerCase();
    if (keyword && !text.includes(keyword)) return false;
    if (status === "enabled" && !account.enabled) return false;
    if (status === "disabled" && account.enabled) return false;
    return true;
  });
}

export function findAccountUnread(unread: UnreadSummary[], apiPhone: string) {
  return unread.find((item) => item.a2cAccountPhone === apiPhone)?.unreadCount || 0;
}

export function findConversationUnread(unread: UnreadSummary[], conversationId: string) {
  return unread.flatMap((item) => item.conversations).find((item) => item.conversationId === conversationId)?.unreadCount || 0;
}
