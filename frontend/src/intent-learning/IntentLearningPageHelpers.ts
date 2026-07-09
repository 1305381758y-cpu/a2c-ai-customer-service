import type { Filters, IntentLearningEvent, MerchantCountry } from "../types.js";
import { countryLabel, timeDisplayModeLabel, timeZoneForCountry, type TimeDisplayMode } from "../ui/formatters.js";

export function intentActiveCountry(countries: MerchantCountry[], countryId: string) {
  if (countryId) return countries.find((country) => country.id === countryId);
  return countries.find((country) => country.status === "active") || countries[0];
}

export function intentTimeZoneFor(platform: boolean, timeMode: TimeDisplayMode, activeCountry?: MerchantCountry) {
  if (!platform && timeMode === "country" && activeCountry) return timeZoneForCountry(activeCountry);
  return "Asia/Shanghai";
}

export function intentTimeLabelFor(platform: boolean, timeMode: TimeDisplayMode, activeCountry?: MerchantCountry) {
  if (!platform && timeMode === "country" && activeCountry) return `${countryLabel(activeCountry.name)}时间`;
  return timeDisplayModeLabel("beijing");
}

export function intentQueryFilters(platform: boolean, filters: Filters, timeZone: string) {
  if (platform) return { ...filters, timeZone: "Asia/Shanghai" };
  return {
    countryId: filters.countryId,
    status: filters.status,
    suggestedIntent: filters.suggestedIntent,
    q: filters.q,
    startAt: filters.startAt,
    endAt: filters.endAt,
    timeZone,
    limit: filters.limit
  };
}

export function intentMetrics(rows: IntentLearningEvent[]) {
  return {
    candidate: rows.filter((item) => item.status === "candidate").length,
    reviewed: rows.filter((item) => item.status === "reviewed").length,
    promoted: rows.filter((item) => item.status === "promoted").length,
    ignored: rows.filter((item) => item.status === "ignored").length
  };
}
