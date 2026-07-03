import type { AiCallStats, Repositories } from "../repositories.js";
import { normalizeSqlTimeRange } from "./beijingTime.js";

export type AiCallStatsQuery = {
  merchantId?: string;
  startAt?: string;
  endAt?: string;
};

export function getMerchantAiCallStats(repos: Repositories, merchantId: string, query: AiCallStatsQuery): AiCallStats {
  const range = normalizeSqlTimeRange(query);
  return repos.aiCallStats({ merchantId, startAt: range.startAt, endAt: range.endAt });
}

export function getAdminAiCallStats(repos: Repositories, query: AiCallStatsQuery): AiCallStats {
  const range = normalizeSqlTimeRange(query);
  return repos.aiCallStats({ merchantId: query.merchantId, startAt: range.startAt, endAt: range.endAt });
}
