import { api, loadRows, withQuery } from "../app/api.js";
import type { Filters, User } from "../types.js";

export type AdminUserCreateInput = {
  email: string;
  name: string;
  password: string;
  role: string;
  merchantId: string;
};

export function adminUsersUrl(filters: Filters = {}): string {
  return withQuery("/api/admin/users", filters);
}

export async function loadAdminUsers(filters: Filters = {}): Promise<User[]> {
  return await loadRows<User>(adminUsersUrl(filters));
}

export async function createAdminUser(input: AdminUserCreateInput): Promise<void> {
  await api("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function updateAdminUser(userId: string, patch: Record<string, unknown>): Promise<void> {
  const cleanPatch = { ...patch };
  if (!cleanPatch.password) delete cleanPatch.password;
  await api(`/api/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(cleanPatch)
  });
}

export async function deleteAdminUser(userId: string): Promise<void> {
  await api(`/api/admin/users/${userId}`, { method: "DELETE" });
}
