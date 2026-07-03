import type { IntentLearningEventRecord, Repositories } from "../repositories.js";

export type MerchantIntentLearningResult<T> =
  | { ok: true; value: T }
  | { ok: false; statusCode: 400 | 404; error: string };

export type MerchantIntentLearningListQuery = {
  countryId?: string;
  status?: string;
  suggestedIntent?: string;
  limit?: string;
};

export function listMerchantIntentLearningEvents(
  repos: Repositories,
  merchantId: string,
  query: MerchantIntentLearningListQuery
): { rows: IntentLearningEventRecord[] } {
  return {
    rows: repos.listIntentLearningEvents({
      merchantId,
      countryId: query.countryId,
      status: query.status,
      suggestedIntent: query.suggestedIntent,
      limit: query.limit ? Number(query.limit) : undefined
    })
  };
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
