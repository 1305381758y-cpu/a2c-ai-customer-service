import { randomUUID } from "node:crypto";
import type { UserRole } from "./auth.js";
import type { Db } from "./db.js";
import { mapUser } from "./repositoryMappers.js";
import type { UserRecord } from "./repositoryTypes.js";

export class UserRepository {
  constructor(private readonly db: Db) {}

  ensureBootstrapAdmin(input: { email: string; passwordHash: string }): void {
    const existing = this.db.sqlite.prepare("SELECT id FROM users WHERE role = 'platform_admin' LIMIT 1").get();
    if (existing) return;
    this.db.sqlite
      .prepare("INSERT INTO users (id, merchant_id, email, name, password_hash, role) VALUES (?, NULL, ?, ?, ?, 'platform_admin')")
      .run(randomUUID(), input.email, "平台管理员", input.passwordHash);
  }

  getByEmail(email: string): UserRecord | undefined {
    const row = this.db.sqlite.prepare("SELECT * FROM users WHERE lower(email) = lower(?)").get(email) as Record<string, unknown> | undefined;
    return row ? mapUser(row) : undefined;
  }

  getById(id: string): UserRecord | undefined {
    const row = this.db.sqlite.prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? mapUser(row) : undefined;
  }

  list(filters: { merchantId?: string } = {}): UserRecord[] {
    const where = filters.merchantId ? "WHERE merchant_id = ?" : "";
    const params = filters.merchantId ? [filters.merchantId] : [];
    return this.db.sqlite.prepare(`SELECT * FROM users ${where} ORDER BY created_at DESC`).all(...params).map((row) => mapUser(row as Record<string, unknown>));
  }

  create(input: { merchantId: string | null; email: string; name: string; passwordHash: string; role: UserRole }): UserRecord {
    const id = randomUUID();
    this.db.sqlite
      .prepare("INSERT INTO users (id, merchant_id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, input.merchantId, input.email, input.name, input.passwordHash, input.role);
    return this.getById(id)!;
  }

  resetPlatformAdmin(input: { email: string; passwordHash: string; name?: string }): UserRecord {
    const existing = this.getByEmail(input.email);
    if (existing) {
      return this.patch(existing.id, {
        name: input.name ?? existing.name,
        status: "active",
        passwordHash: input.passwordHash,
        role: "platform_admin",
        merchantId: null
      })!;
    }
    return this.create({
      merchantId: null,
      email: input.email,
      name: input.name ?? "平台管理员",
      passwordHash: input.passwordHash,
      role: "platform_admin"
    });
  }

  patch(id: string, patch: { name?: string; status?: string; passwordHash?: string; role?: UserRole; merchantId?: string | null }): UserRecord | undefined {
    const assignments = ["updated_at = CURRENT_TIMESTAMP"];
    const values: Array<string | null> = [];
    if (patch.name !== undefined) {
      assignments.push("name = ?");
      values.push(patch.name);
    }
    if (patch.status !== undefined) {
      assignments.push("status = ?");
      values.push(patch.status);
    }
    if (patch.passwordHash !== undefined) {
      assignments.push("password_hash = ?");
      values.push(patch.passwordHash);
    }
    if (patch.role !== undefined) {
      assignments.push("role = ?");
      values.push(patch.role);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "merchantId")) {
      assignments.push("merchant_id = ?");
      values.push(patch.merchantId ?? null);
    }
    this.db.sqlite.prepare(`UPDATE users SET ${assignments.join(", ")} WHERE id = ?`).run(...values, id);
    return this.getById(id);
  }

  delete(id: string): boolean {
    const result = this.db.sqlite.prepare("DELETE FROM users WHERE id = ?").run(id);
    return result.changes > 0;
  }
}
