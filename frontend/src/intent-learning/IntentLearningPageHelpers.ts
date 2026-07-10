import type { Filters, MerchantCountry } from "../types.js";
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

export function intentQueryFilters(platform: boolean, filters: Filters, timeZone: string, page = 1, pageSize = 20) {
  const paging = { limit: String(pageSize), offset: String((page - 1) * pageSize) };
  if (platform) return { ...filters, timeZone: "Asia/Shanghai", ...paging };
  return {
    countryId: filters.countryId,
    status: filters.status,
    suggestedIntent: filters.suggestedIntent,
    q: filters.q,
    startAt: filters.startAt,
    endAt: filters.endAt,
    timeZone,
    ...paging
  };
}
