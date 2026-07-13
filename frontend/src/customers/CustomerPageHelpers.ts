import type { Filters, MerchantCountry } from "../types.js";
import { countryLabel, timeDisplayModeLabel, timeZoneForCountry, type TimeDisplayMode } from "../ui/formatters.js";
import { todayDateTimeRange } from "../ui/timeFilters.js";

export function todayBeijingDateRange() {
  return todayDateTimeRange("Asia/Shanghai");
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
