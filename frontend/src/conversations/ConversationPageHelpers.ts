import type { A2CAccount, Filters } from "../types.js";
import { timeZoneForCountry, type TimeDisplayMode } from "../ui/formatters.js";

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
