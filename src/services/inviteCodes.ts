import type { A2CInviteCodeRecord, Repositories } from "../repositories.js";

export type InviteCodeResult<T> =
  | { ok: true; value: T }
  | { ok: false; statusCode: 400 | 404; error: string };

export function listInviteCodes(
  repos: Repositories,
  accountIdParam: string,
  merchantId?: string
): InviteCodeResult<{ rows: A2CInviteCodeRecord[] }> {
  const accountId = parseInviteCodeId(accountIdParam);
  if (accountId === undefined) return invalidId();
  return { ok: true, value: { rows: repos.listInviteCodesForA2CAccount(accountId, merchantId) } };
}

export function createInviteCode(
  repos: Repositories,
  accountIdParam: string,
  body: Record<string, unknown>,
  merchantId?: string
): InviteCodeResult<A2CInviteCodeRecord> {
  const accountId = parseInviteCodeId(accountIdParam);
  if (accountId === undefined) return invalidId();
  try {
    return { ok: true, value: repos.createInviteCodeForA2CAccount(accountId, body, merchantId) };
  } catch (error) {
    return badRequest(error, "invalid invite code");
  }
}

export function importInviteCodes(
  repos: Repositories,
  accountIdParam: string,
  body: { codes?: string; registerUrl?: string; reusable?: boolean },
  merchantId?: string
): InviteCodeResult<{ imported: number; rows: A2CInviteCodeRecord[] }> {
  const accountId = parseInviteCodeId(accountIdParam);
  if (accountId === undefined) return invalidId();
  try {
    return { ok: true, value: repos.importInviteCodesForA2CAccount(accountId, body, merchantId) };
  } catch (error) {
    return badRequest(error, "invalid invite codes");
  }
}

export function patchInviteCode(
  repos: Repositories,
  idParam: string,
  body: Record<string, unknown>,
  merchantId?: string
): InviteCodeResult<A2CInviteCodeRecord> {
  const id = parseInviteCodeId(idParam);
  if (id === undefined) return invalidId();
  const row = repos.patchInviteCode(id, body, merchantId);
  if (!row) return { ok: false, statusCode: 404, error: "invite code not found" };
  return { ok: true, value: row };
}

export function deleteInviteCode(
  repos: Repositories,
  idParam: string,
  merchantId?: string
): InviteCodeResult<{ ok: true }> {
  const id = parseInviteCodeId(idParam);
  if (id === undefined) return invalidId();
  const deleted = repos.deleteInviteCode(id, merchantId);
  if (!deleted) return { ok: false, statusCode: 404, error: "invite code not found" };
  return { ok: true, value: { ok: true } };
}

function parseInviteCodeId(value: string): number | undefined {
  const id = Number(value);
  return Number.isInteger(id) ? id : undefined;
}

function invalidId(): InviteCodeResult<never> {
  return { ok: false, statusCode: 400, error: "invalid id" };
}

function badRequest(error: unknown, fallback: string): InviteCodeResult<never> {
  return { ok: false, statusCode: 400, error: error instanceof Error ? error.message : fallback };
}
