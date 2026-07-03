import type { CustomerRecord, Repositories } from "../repositories.js";

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
    limit?: string;
  }
): { rows: CustomerRecord[] } {
  return {
    rows: repos.listCustomers({
      merchantId,
      countryId: filters.countryId,
      status: filters.status,
      language: filters.language,
      limit: filters.limit ? Number(filters.limit) : undefined
    })
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
