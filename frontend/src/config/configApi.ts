import { api } from "../app/api.js";
import { loadRows } from "../app/api.js";
import type { A2CAccount, ConfigCheck, MerchantCountry } from "../types.js";
import { translateSystemMessage } from "../ui/formatters.js";
import type { ConfigForm } from "./types.js";

export type RegistrationTutorialUploadResult = {
  imageUrl: string;
  config: ConfigForm;
};

export async function uploadRegistrationTutorialImage(
  url: string,
  file: File,
  fetcher: typeof fetch = fetch
): Promise<RegistrationTutorialUploadResult> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetcher(url, { method: "POST", body });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(translateSystemMessage(payload.message || payload.error || "注册教程图片上传失败"));
  }
  return await response.json() as RegistrationTutorialUploadResult;
}

export async function checkConfig(url: string): Promise<{ rows: ConfigCheck[]; checkedAt: string }> {
  return await api<{ rows: ConfigCheck[]; checkedAt: string }>(url);
}

export async function loadConfig(url: string): Promise<ConfigForm> {
  return await api<ConfigForm>(url);
}

export async function loadCountries(url: string): Promise<MerchantCountry[]> {
  return await loadRows<MerchantCountry>(url);
}

export async function loadA2CAccounts(url: string): Promise<A2CAccount[]> {
  return await loadRows<A2CAccount>(url);
}

export async function saveConfig(url: string, form: ConfigForm): Promise<ConfigForm> {
  return await api<ConfigForm>(url, { method: "PATCH", body: JSON.stringify(form) });
}

export async function syncA2CAccounts(
  url: string
): Promise<{ imported: number; rows: A2CAccount[]; config: ConfigForm; stale?: boolean; warning?: string }> {
  return await api<{ imported: number; rows: A2CAccount[]; config: ConfigForm; stale?: boolean; warning?: string }>(url, { method: "POST" });
}

export async function toggleA2CAccount(url: string, enabled: boolean): Promise<{ config: ConfigForm }> {
  return await api<{ config: ConfigForm }>(url, { method: "PATCH", body: JSON.stringify({ enabled }) });
}

export function a2cAccountEndpoint(platform: boolean, accountId: number): string {
  return platform ? `/api/admin/a2c/accounts/${accountId}` : `/api/merchant/a2c/accounts/${accountId}`;
}

export async function saveCountry(url: string, patch: Record<string, unknown>): Promise<void> {
  await api(url, { method: "POST", body: JSON.stringify(patch) });
}

export async function setupTelegramWebhook(url: string): Promise<{ config: ConfigForm; webhookUrl?: string }> {
  return await api<{ config: ConfigForm; webhookUrl?: string }>(url, { method: "POST" });
}
