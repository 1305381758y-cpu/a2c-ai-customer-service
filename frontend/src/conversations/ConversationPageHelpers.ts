import type { A2CAccount, Conversation, Filters, UnreadSummary } from "../types.js";
import { timeZoneForCountry, type TimeDisplayMode } from "../ui/formatters.js";
import { withQuery } from "../app/api.js";

export function filterConversationAccounts(accounts: A2CAccount[], filters: { keyword: string; status: string }) {
  const keyword = filters.keyword.trim().toLowerCase();
  return accounts.filter((account) => {
    const text = [account.verifiedName, account.apiPhone, account.countryName, account.countryCode, account.wabaId].join(" ").toLowerCase();
    if (keyword && !text.includes(keyword)) return false;
    if (filters.status === "enabled" && !account.enabled) return false;
    if (filters.status === "disabled" && account.enabled) return false;
    return true;
  });
}

export function conversationTimeZoneFor(account: A2CAccount | null, timeMode: TimeDisplayMode) {
  if (timeMode !== "country" || !account) return "Asia/Shanghai";
  return timeZoneForCountry(account.countryCode || account.countryName);
}

export function conversationExportFilters(filters: Filters, timeZone: string, account: A2CAccount | null) {
  if (!account) return undefined;
  return { ...filters, timeZone, a2cAccountPhone: account.apiPhone, limit: "50000" };
}

export function conversationRowsQuery(filters: Filters, timeZone: string, account: A2CAccount | null) {
  if (!account) return "";
  return withQuery("/api/merchant/conversations", { ...filters, timeZone, a2cAccountPhone: account.apiPhone });
}

export function accountUnreadCount(unread: UnreadSummary[], apiPhone: string) {
  return unread.find((item) => item.a2cAccountPhone === apiPhone)?.unreadCount || 0;
}

export function conversationUnreadCount(unread: UnreadSummary[], conversationId: string) {
  return unread
    .flatMap((item) => item.conversations)
    .find((item) => item.conversationId === conversationId)?.unreadCount || 0;
}

export function normalizeConversationFilters(filters: Filters, handoffs: boolean): Filters {
  return handoffs ? { ...filters, status: "human_handoff", handoffStatus: "pending" } : filters;
}

export function selectedConversationAfterReload(current: Conversation | null, rows: Conversation[]) {
  return current ? rows.find((row) => row.id === current.id) || current : current;
}

export function proactiveCustomerDraft(input: { customerPhone: string; nickname: string }) {
  const customerPhone = input.customerPhone.trim();
  if (!customerPhone) return { error: "请先填写客户号码。", draft: null };
  return { error: "", draft: { customerPhone, nickname: input.nickname.trim() } };
}
