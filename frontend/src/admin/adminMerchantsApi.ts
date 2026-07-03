import { api, loadRows } from "../app/api.js";
import type { Merchant, MerchantCountry, User } from "../types.js";
import { coercePatch } from "../ui/form.js";
import type { MerchantCreateForm } from "./MerchantCreatePanel.js";
import type { AdminUserCreateInput } from "./adminUsersApi.js";
import { adminUsersUrl, createAdminUser, deleteAdminUser, updateAdminUser } from "./adminUsersApi.js";

export type MerchantCreatePayload = {
  name: string;
  country: {
    code: string;
    name: string;
    defaultLanguage: string;
    platformRegisterUrl: string;
    tgRegisterGuideUrl: string;
    requirePlatformAccount: boolean;
    requirePhone: boolean;
    requireTelegram: boolean;
    requireWhatsApp: boolean;
  };
  adminUser?: {
    email: string;
    name: string;
    password: string;
  };
};

export type MerchantCreateResult = {
  merchant: Merchant | null;
  loginMessage: string;
};

export type MerchantDetailData = {
  countries: MerchantCountry[];
  users: User[];
};

export function buildMerchantCreatePayload(form: MerchantCreateForm): MerchantCreatePayload {
  const merchantName = form.name.trim();
  const adminEmail = form.adminEmail.trim();
  return {
    name: merchantName,
    country: {
      code: form.countryCode.trim() || "default",
      name: form.countryName.trim() || "默认国家",
      defaultLanguage: form.defaultLanguage,
      platformRegisterUrl: form.platformRegisterUrl.trim(),
      tgRegisterGuideUrl: form.tgRegisterGuideUrl.trim(),
      requirePlatformAccount: form.requirePlatformAccount === "true",
      requirePhone: form.requirePhone === "true",
      requireTelegram: form.requireTelegram === "true",
      requireWhatsApp: form.requireWhatsApp === "true"
    },
    adminUser: adminEmail ? {
      email: adminEmail,
      name: form.adminName.trim() || `${merchantName}管理员`,
      password: form.adminPassword
    } : undefined
  };
}

export async function loadAdminMerchants(): Promise<Merchant[]> {
  return await loadRows<Merchant>("/api/admin/merchants");
}

export async function loadMerchantDetail(merchantId?: string): Promise<MerchantDetailData> {
  if (!merchantId) return { countries: [], users: [] };
  const [countries, users] = await Promise.all([
    loadRows<MerchantCountry>(`/api/admin/merchants/${merchantId}/countries`),
    loadRows<User>(adminUsersUrl({ merchantId }))
  ]);
  return { countries, users };
}

export async function createMerchantFromForm(form: MerchantCreateForm): Promise<MerchantCreateResult> {
  const payload = buildMerchantCreatePayload(form);
  const result = await api<{ merchant?: Merchant; adminUser?: User } | Merchant>("/api/admin/merchants", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  const resultWithMerchant = result as { merchant?: Merchant };
  const merchant = resultWithMerchant.merchant ?? result as Merchant;
  return {
    merchant,
    loginMessage: payload.adminUser
      ? `商户已创建。商户端登录邮箱：${payload.adminUser.email}；初始密码：${payload.adminUser.password}`
      : "商户已创建，暂未创建商户端登录账号。"
  };
}

export async function updateMerchant(merchantId: string, patch: Record<string, unknown>): Promise<Merchant> {
  return await api<Merchant>(`/api/admin/merchants/${merchantId}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
}

export async function deleteMerchant(merchantId: string): Promise<void> {
  await api(`/api/admin/merchants/${merchantId}`, { method: "DELETE" });
}

export async function updateMerchantCountry(merchantId: string, countryId: string, patch: Record<string, unknown>): Promise<MerchantCountry> {
  return await api<MerchantCountry>(`/api/admin/merchants/${merchantId}/countries/${countryId}`, {
    method: "PATCH",
    body: JSON.stringify(coercePatch(patch))
  });
}

export async function createMerchantUser(merchantId: string, form: Omit<AdminUserCreateInput, "merchantId">): Promise<void> {
  await createAdminUser({ ...form, merchantId });
}

export async function updateMerchantUser(merchantId: string, userId: string, patch: Record<string, unknown>): Promise<void> {
  await updateAdminUser(userId, { ...patch, merchantId });
}

export async function deleteMerchantUser(userId: string): Promise<void> {
  await deleteAdminUser(userId);
}
