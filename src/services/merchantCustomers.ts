import type { CustomerRecord, Repositories } from "../repositories.js";
import { normalizeSqlTimeRange } from "./beijingTime.js";

export type MerchantCustomerResult<T> =
  | { ok: true; value: T }
  | { ok: false; statusCode: number; error: string };

export function listMerchantCustomers(
  repos: Repositories,
  merchantId: string,
  filters: {
    countryId?: string;
    status?: string;
    language?: string;
    q?: string;
    startAt?: string;
    endAt?: string;
    timeZone?: string;
    limit?: string;
  }
): { rows: CustomerRecord[]; total: number } {
  const range = normalizeSqlTimeRange({ startAt: filters.startAt, endAt: filters.endAt, timeZone: filters.timeZone });
  const scopedFilters = {
    merchantId,
    countryId: filters.countryId,
    status: filters.status,
    language: filters.language,
    q: filters.q,
    startAt: range.startAt,
    endAt: range.endAt
  };
  return {
    rows: repos.listCustomers({
      ...scopedFilters,
      limit: filters.limit ? Number(filters.limit) : undefined
    }),
    total: repos.countCustomers(scopedFilters)
  };
}

export function deleteMerchantCustomer(
  repos: Repositories,
  merchantId: string,
  customerKeyParam: string
): MerchantCustomerResult<{ ok: true; deleted: boolean; conversationsDeleted: number; messagesDeleted: number }> {
  const result = repos.deleteCustomer(merchantId, decodeURIComponent(customerKeyParam));
  if (!result.deleted) return { ok: false, statusCode: 404, error: "customer not found" };
  return { ok: true, value: { ok: true, ...result } };
}
