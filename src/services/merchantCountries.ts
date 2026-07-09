import type { MerchantCountryRecord, Repositories } from "../repositories.js";

export type MerchantCountryResult<T> =
  | { ok: true; value: T }
  | { ok: false; statusCode: 400 | 404; error: string };

export function listMerchantCountries(
  repos: Repositories,
  merchantId: string
): { rows: MerchantCountryRecord[] } {
  return { rows: repos.listMerchantCountries(merchantId) };
}

export function listAllMerchantCountries(repos: Repositories): { rows: MerchantCountryRecord[] } {
  return { rows: repos.listAllMerchantCountries() };
}

export function createMerchantCountry(
  repos: Repositories,
  merchantId: string,
  body: Record<string, unknown>
): MerchantCountryResult<MerchantCountryRecord> {
  try {
    return { ok: true, value: repos.createMerchantCountry(merchantId, body) };
  } catch (error) {
    return { ok: false, statusCode: 400, error: error instanceof Error ? error.message : "invalid country" };
  }
}

export function patchMerchantCountry(
  repos: Repositories,
  merchantId: string,
  countryId: string,
  body: Record<string, unknown>
): MerchantCountryResult<MerchantCountryRecord> {
  const row = repos.patchMerchantCountry(countryId, merchantId, body);
  if (!row) return { ok: false, statusCode: 404, error: "country not found" };
  return { ok: true, value: row };
}
