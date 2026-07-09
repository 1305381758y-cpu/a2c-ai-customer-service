import type { Filters, MerchantCountry } from "../types.js";
import { countryLabel, timeDisplayModeLabel, timeZoneForCountry, type TimeDisplayMode } from "../ui/formatters.js";

export function todayBeijingDateRange() {
  const now = new Date();
  const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const today = `${beijing.getUTCFullYear()}-${pad(beijing.getUTCMonth() + 1)}-${pad(beijing.getUTCDate())}`;
  beijing.setUTCDate(beijing.getUTCDate() + 1);
  const tomorrow = `${beijing.getUTCFullYear()}-${pad(beijing.getUTCMonth() + 1)}-${pad(beijing.getUTCDate())}`;
  return { startAt: `${today}T00:00:00`, endAt: `${tomorrow}T00:00:00` };
}

export function customerActiveCountry(countries: MerchantCountry[], countryId: string) {
  if (countryId) return countries.find((country) => country.id === countryId);
  return countries.find((country) => country.status === "active") || countries[0];
}

export function customerTimeZoneFor(platform: boolean, timeMode: TimeDisplayMode, activeCountry?: MerchantCountry) {
  if (!platform && timeMode === "country" && activeCountry) return timeZoneForCountry(activeCountry);
  return "Asia/Shanghai";
}

export function customerTimeLabelFor(platform: boolean, timeMode: TimeDisplayMode, activeCountry?: MerchantCountry) {
  if (!platform && timeMode === "country" && activeCountry) return `${countryLabel(activeCountry.name)}时间`;
  return timeDisplayModeLabel("beijing");
}

export function customerQueryFilters(platform: boolean, filters: Filters, timeZone: string, page: number, pageSize: number) {
  const paging = { limit: String(pageSize), offset: String((page - 1) * pageSize) };
  if (platform) return { ...filters, timeZone: "Asia/Shanghai", ...paging };
  return {
    countryId: filters.countryId,
    status: filters.status,
    language: filters.language,
    q: filters.q,
    startAt: filters.startAt,
    endAt: filters.endAt,
    timeZone,
    ...paging
  };
}

export function customerExportFilters(platform: boolean, filters: Filters, timeZone: string) {
  if (platform) {
    return {
      merchantId: filters.merchantId,
      countryId: filters.countryId,
      status: filters.status,
      language: filters.language,
      startAt: filters.startAt,
      endAt: filters.endAt,
      timeZone: "Asia/Shanghai",
      limit: "50000"
    };
  }
  return {
    countryId: filters.countryId,
    status: filters.status,
    language: filters.language,
    startAt: filters.startAt,
    endAt: filters.endAt,
    timeZone,
    limit: "50000"
  };
}

export function customerColumns(platform: boolean, selected: boolean) {
  const compact = platform
    ? ["merchantId", "countryName", "customerKey", "lastA2CAccountPhone", "stage", "conversationCount", "lastSeenAt"]
    : ["countryName", "customerKey", "lastA2CAccountPhone", "stage", "conversationCount", "lastSeenAt"];
  const full = platform
    ? ["merchantId", "countryName", "customerKey", "nickname", "lastA2CAccountPhone", "language", "stage", "extractedPhone", "extractedTelegram", "extractedWhatsApp", "status", "conversationCount", "lastSeenAt"]
    : ["countryName", "customerKey", "nickname", "lastA2CAccountPhone", "language", "stage", "extractedPhone", "extractedTelegram", "extractedWhatsApp", "status", "conversationCount", "lastSeenAt"];
  return selected ? compact : full;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
