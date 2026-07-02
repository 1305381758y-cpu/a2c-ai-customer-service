import { hashPassword, type UserRole } from "../auth.js";
import type { Repositories, UserRecord } from "../repositories.js";

export type CreateAdminUserInput = {
  merchantId?: string | null;
  email: string;
  name: string;
  password: string;
  role: UserRole;
};

export type PatchAdminUserInput = {
  merchantId?: string;
  name?: string;
  password?: string;
  role?: unknown;
  status?: unknown;
};

export type DeleteAdminUserResult =
  | { ok: true }
  | { ok: false; statusCode: 400 | 404; error: string };

export function listAdminUsers(repos: Repositories, filters: { merchantId?: string }): UserRecord[] {
  return repos.listUsers({ merchantId: filters.merchantId });
}

export function createAdminUser(repos: Repositories, input: CreateAdminUserInput): UserRecord {
  return repos.createUser({
    merchantId: merchantIdForRole(input.role, input.merchantId),
    email: input.email,
    name: input.name,
    passwordHash: hashPassword(input.password),
    role: input.role
  });
}

export function patchAdminUser(repos: Repositories, id: string, input: PatchAdminUserInput): UserRecord | undefined {
  const role = normalizeUserRole(input.role);
  return repos.patchUser(id, {
    name: typeof input.name === "string" ? input.name : undefined,
    status: input.status === "active" || input.status === "disabled" ? input.status : undefined,
    role,
    merchantId: role === "platform_admin" ? null : typeof input.merchantId === "string" ? input.merchantId : undefined,
    passwordHash: typeof input.password === "string" && input.password.length >= 8 ? hashPassword(input.password) : undefined
  });
}

export function deleteAdminUser(repos: Repositories, id: string, currentUserId: string): DeleteAdminUserResult {
  if (currentUserId === id) return { ok: false, statusCode: 400, error: "不能删除当前登录账号" };
  const deleted = repos.deleteUser(id);
  if (!deleted) return { ok: false, statusCode: 404, error: "user not found" };
  return { ok: true };
}

function merchantIdForRole(role: UserRole, merchantId: string | null | undefined): string | null {
  return role === "platform_admin" ? null : merchantId ?? "default";
}

function normalizeUserRole(role: unknown): UserRole | undefined {
  return role === "platform_admin" || role === "merchant_admin" || role === "merchant_operator" ? role : undefined;
}
