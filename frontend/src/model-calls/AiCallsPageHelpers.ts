import type { AiCallStats, Filters, MerchantCountry } from "../types.js";
import { countryLabel, timeDisplayModeLabel, timeZoneForCountry, type TimeDisplayMode } from "../ui/formatters.js";

export const EMPTY_AI_CALL_STATS: AiCallStats = {
  totalCalls: 0,
  successCalls: 0,
  errorCalls: 0,
  successRate: 0,
  averageDurationMs: 0,
  availableProviders: [],
  availableTaskTypes: [],
  byType: [],
  byProvider: [],
  byTypeDetails: [],
  byError: []
};

export function aiCallActiveCountry(countries: MerchantCountry[]) {
  return countries.find((country) => country.status === "active") || countries[0];
}

export function aiCallTimeZoneFor(platform: boolean, timeMode: TimeDisplayMode, activeCountry?: MerchantCountry) {
  if (!platform && timeMode === "country" && activeCountry) return timeZoneForCountry(activeCountry);
  return "Asia/Shanghai";
}

export function aiCallTimeLabelFor(platform: boolean, timeMode: TimeDisplayMode, activeCountry?: MerchantCountry) {
  if (!platform && timeMode === "country" && activeCountry) return `${countryLabel(activeCountry.name)}时间`;
  return timeDisplayModeLabel("beijing");
}

export function aiCallStatsQuery(platform: boolean, filters: Filters, timeZone: string) {
  if (platform) return { ...filters, timeZone: "Asia/Shanghai" };
  return {
    provider: filters.provider,
    taskType: filters.taskType,
    status: filters.status,
    startAt: filters.startAt,
    endAt: filters.endAt,
    timeZone
  };
}

export function aiCallErrorKey(row: AiCallStats["byError"][number]) {
  return [row.taskType, row.provider, row.model, row.errorMessage, row.httpStatus ?? "", row.lastFailedAt].join("|");
}

export function formatAiCallSummary(value: string) {
  if (!value) return "暂无摘要";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}
