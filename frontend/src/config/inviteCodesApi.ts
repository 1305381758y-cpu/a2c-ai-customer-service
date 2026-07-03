import { api, loadRows } from "../app/api.js";
import type { InviteCode } from "../types.js";

export type InviteCodeDraft = {
  code: string;
  registerUrl: string;
  status: string;
};

export type InviteCodeImportDraft = {
  codes: string;
  registerUrl: string;
};

export function inviteCodeListEndpoint(platform: boolean, accountId: number): string {
  return platform ? `/api/admin/a2c/accounts/${accountId}/invite-codes` : `/api/merchant/a2c/accounts/${accountId}/invite-codes`;
}

export function inviteCodeItemEndpoint(platform: boolean): string {
  return platform ? "/api/admin/invite-codes" : "/api/merchant/invite-codes";
}

export async function loadInviteCodes(endpoint: string): Promise<InviteCode[]> {
  return await loadRows<InviteCode>(endpoint);
}

export async function importInviteCodes(endpoint: string, draft: InviteCodeImportDraft): Promise<{ imported: number; rows: InviteCode[] }> {
  return await api<{ imported: number; rows: InviteCode[] }>(`${endpoint}/import`, {
    method: "POST",
    body: JSON.stringify(draft)
  });
}

export async function updateInviteCode(endpoint: string, codeId: number, draft: InviteCodeDraft): Promise<void> {
  await api(`${endpoint}/${codeId}`, {
    method: "PATCH",
    body: JSON.stringify(draft)
  });
}

export async function deleteInviteCode(endpoint: string, codeId: number): Promise<void> {
  await api(`${endpoint}/${codeId}`, { method: "DELETE" });
}
