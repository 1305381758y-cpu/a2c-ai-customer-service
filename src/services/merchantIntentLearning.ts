import type { IntentLearningEventRecord, Repositories } from "../repositories.js";
import { normalizeSqlTimeRange } from "./beijingTime.js";

export type MerchantIntentLearningResult<T> =
  | { ok: true; value: T }
  | { ok: false; statusCode: 400 | 404; error: string };

export type MerchantIntentLearningListQuery = {
  countryId?: string;
  status?: string;
  suggestedIntent?: string;
  q?: string;
  startAt?: string;
  endAt?: string;
  timeZone?: string;
  limit?: string;
  offset?: string;
};

export function listMerchantIntentLearningEvents(
  repos: Repositories,
  merchantId: string,
  query: MerchantIntentLearningListQuery
): { rows: IntentLearningEventRecord[]; total: number; metrics: Record<"candidate" | "reviewed" | "promoted" | "ignored", number> } {
  const range = normalizeSqlTimeRange({ startAt: query.startAt, endAt: query.endAt, timeZone: query.timeZone });
  const filters = {
    merchantId,
    countryId: query.countryId,
    status: query.status,
    suggestedIntent: query.suggestedIntent,
    q: query.q,
    startAt: range.startAt,
    endAt: range.endAt
  };
  return {
    rows: repos.listIntentLearningEvents({
      ...filters,
      limit: query.limit ? Number(query.limit) : undefined,
      offset: query.offset ? Number(query.offset) : undefined
    }),
    total: repos.countIntentLearningEvents(filters),
    metrics: intentStatusMetrics(repos, { ...filters, status: undefined })
  };
}

function intentStatusMetrics(repos: Repositories, filters: Omit<Parameters<Repositories["countIntentLearningEvents"]>[0], "status">) {
  return Object.fromEntries(["candidate", "reviewed", "promoted", "ignored"].map((status) => [status, repos.countIntentLearningEvents({ ...filters, status })])) as Record<"candidate" | "reviewed" | "promoted" | "ignored", number>;
}

export function patchMerchantIntentLearningEvent(
  repos: Repositories,
  merchantId: string,
  idParam: string,
  body: Record<string, unknown>
): MerchantIntentLearningResult<IntentLearningEventRecord> {
  const id = Number(idParam);
  if (!Number.isInteger(id)) return { ok: false, statusCode: 400, error: "invalid id" };
  const row = repos.patchIntentLearningEvent(id, body, merchantId);
  if (!row) return { ok: false, statusCode: 404, error: "intent learning event not found" };
  return { ok: true, value: row };
}
