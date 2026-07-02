import { hashPassword } from "../auth.js";
import type { MerchantCountryRecord, MerchantRecord, Repositories, UserRecord } from "../repositories.js";

export type CreateAdminMerchantInput = {
  name: string;
  country?: Record<string, unknown>;
  adminUser?: {
    email: string;
    name: string;
    password: string;
  };
};

export type CreateAdminMerchantResult =
  | { ok: true; merchant: MerchantRecord; country?: MerchantCountryRecord; adminUser?: UserRecord }
  | { ok: false; statusCode: 400; error: string };

export type DeleteAdminMerchantResult =
  | { ok: true }
  | { ok: false; statusCode: 400 | 404; error: string };

export function listAdminMerchants(repos: Repositories): MerchantRecord[] {
  return repos.listMerchants();
}

export function createAdminMerchant(repos: Repositories, input: CreateAdminMerchantInput): CreateAdminMerchantResult {
  if (input.adminUser && repos.getUserByEmail(input.adminUser.email)) {
    return { ok: false, statusCode: 400, error: "登录邮箱已存在" };
  }

  const merchant = repos.createMerchant(input.name);
  if (!input.country && !input.adminUser) return { ok: true, merchant };

  const country = input.country ? repos.createMerchantCountry(merchant.id, input.country) : undefined;
  const adminUser = input.adminUser
    ? repos.createUser({
        merchantId: merchant.id,
        email: input.adminUser.email,
        name: input.adminUser.name,
        passwordHash: hashPassword(input.adminUser.password),
        role: "merchant_admin"
      })
    : undefined;

  return { ok: true, merchant, country, adminUser };
}

export function patchAdminMerchant(repos: Repositories, id: string, patch: Record<string, unknown>): MerchantRecord | undefined {
  return repos.patchMerchant(id, patch);
}

export function deleteAdminMerchant(repos: Repositories, id: string): DeleteAdminMerchantResult {
  if (id === "default") return { ok: false, statusCode: 400, error: "默认商户不能删除" };
  const deleted = repos.deleteMerchant(id);
  if (!deleted) return { ok: false, statusCode: 404, error: "merchant not found" };
  return { ok: true };
}
