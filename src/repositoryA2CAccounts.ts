import type { A2CAccount } from "./clients/a2c.js";
import type { Db } from "./db.js";
import { inviteCodeAccountMatches, normalizeInviteCodeStatus } from "./repositoryInviteCodes.js";
import {
  mapA2CInviteCode,
  mapMerchantA2CAccount
} from "./repositoryMerchantMappers.js";
import type { A2CAccountGroupRecord, A2CInviteCodeRecord, Conversation, InviteCodeTeacherLinkBindingRecord, MerchantA2CAccountRecord, MerchantConfigRecord } from "./repositoryTypes.js";

function mapAccountGroup(row: Record<string, unknown>): A2CAccountGroupRecord {
  return {
    id: Number(row.id),
    merchantId: String(row.merchant_id ?? "default"),
    countryId: String(row.country_id ?? ""),
    countryCode: String(row.country_code ?? "default"),
    countryName: String(row.country_name ?? "默认国家"),
    name: String(row.name ?? ""),
    status: String(row.status ?? "active") === "disabled" ? "disabled" : "active",
    accountCount: Number(row.account_count ?? 0),
    inviteCodeCount: Number(row.invite_code_count ?? 0),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

function mapTeacherBinding(row: Record<string, unknown>): InviteCodeTeacherLinkBindingRecord {
  return {
    id: Number(row.id),
    merchantId: String(row.merchant_id ?? "default"),
    inviteSource: String(row.invite_source ?? "group") === "account" ? "account" : "group",
    inviteCodeId: Number(row.invite_code_id),
    teacherTgLinkId: Number(row.teacher_tg_link_id),
    assignedCount: Number(row.assigned_count ?? 0),
    status: String(row.status ?? "active") === "disabled" ? "disabled" : "active"
  };
}

export class MerchantA2CAccountRepository {
  constructor(
    private readonly db: Db,
    private readonly countries: {
      defaultCountryId: (merchantId: string) => string;
      validCountryId: (merchantId: string, countryId: string) => string;
    },
    private readonly configs: {
      getMerchantConfig: (merchantId: string) => MerchantConfigRecord;
    }
  ) {}

  list(filters: { merchantId?: string; enabled?: boolean } = {}): MerchantA2CAccountRecord[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filters.merchantId) {
      clauses.push("a.merchant_id = ?");
      params.push(filters.merchantId);
    }
    if (typeof filters.enabled === "boolean") {
      clauses.push("a.enabled = ?");
      params.push(filters.enabled ? 1 : 0);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.db.sqlite
      .prepare(`
        SELECT a.*, co.code AS country_code, co.name AS country_name, co.default_language,
               g.name AS group_name
        FROM merchant_a2c_accounts a
        LEFT JOIN merchant_countries co ON co.id = a.country_id
        LEFT JOIN a2c_account_groups g ON g.id = a.group_id AND g.merchant_id = a.merchant_id
        ${where}
        ORDER BY a.enabled DESC, a.api_phone ASC
      `)
      .all(...params)
      .map((row) => mapMerchantA2CAccount(row as Record<string, unknown>));
  }

  sync(merchantId: string, accounts: A2CAccount[]): MerchantA2CAccountRecord[] {
    this.db.sqlite.prepare("INSERT OR IGNORE INTO merchant_configs (merchant_id) VALUES (?)").run(merchantId);
    const defaultCountryId = this.countries.defaultCountryId(merchantId);
    const syncedPhones = Array.from(new Set(accounts.map((account) => String(account.apiPhone || "").trim()).filter(Boolean)));
    const upsert = this.db.sqlite.prepare(`
      INSERT INTO merchant_a2c_accounts
        (merchant_id, country_id, api_phone, waba_id, status, number_status, quality_rating, messaging_limit, verified_name, enabled, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(merchant_id, api_phone) DO UPDATE SET
        country_id = excluded.country_id,
        waba_id = excluded.waba_id,
        status = excluded.status,
        number_status = excluded.number_status,
        quality_rating = excluded.quality_rating,
        messaging_limit = excluded.messaging_limit,
        verified_name = excluded.verified_name,
        synced_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `);
    this.db.sqlite.exec("BEGIN");
    try {
      const staleRows = this.db.sqlite
        .prepare(`
          SELECT id
          FROM merchant_a2c_accounts
          WHERE merchant_id = ?
            ${syncedPhones.length ? `AND api_phone NOT IN (${syncedPhones.map(() => "?").join(",")})` : ""}
        `)
        .all(merchantId, ...syncedPhones) as Array<{ id: number }>;
      for (const row of staleRows) {
        this.db.sqlite
          .prepare(`
            DELETE FROM invite_code_teacher_tg_links
            WHERE merchant_id = ?
              AND invite_source = 'account'
              AND invite_code_id IN (
                SELECT id FROM a2c_invite_codes WHERE merchant_id = ? AND a2c_account_id = ?
              )
          `)
          .run(merchantId, merchantId, row.id);
        this.db.sqlite
          .prepare("DELETE FROM a2c_invite_codes WHERE merchant_id = ? AND a2c_account_id = ?")
          .run(merchantId, row.id);
        this.db.sqlite
          .prepare("DELETE FROM merchant_a2c_accounts WHERE merchant_id = ? AND id = ?")
          .run(merchantId, row.id);
      }
      for (const account of accounts) {
        const apiPhone = String(account.apiPhone || "").trim();
        if (!apiPhone) continue;
        upsert.run(
          merchantId,
          defaultCountryId,
          apiPhone,
          account.wabaId ?? "",
          Number(account.status ?? 0),
          Number(account.numberStatus ?? 0),
          Number(account.qualityRating ?? 0),
          Number(account.messagingLimit ?? 0),
          account.verifiedName ?? ""
        );
      }
      this.db.sqlite.exec("COMMIT");
    } catch (error) {
      this.db.sqlite.exec("ROLLBACK");
      throw error;
    }
    this.refreshPhones(merchantId);
    return this.list({ merchantId });
  }

  patch(id: number, patch: Record<string, unknown>, merchantId?: string): MerchantA2CAccountRecord | undefined {
    const row = this.db.sqlite
      .prepare(`SELECT * FROM merchant_a2c_accounts WHERE id = ? ${merchantId ? "AND merchant_id = ?" : ""}`)
      .get(id, ...(merchantId ? [merchantId] : [])) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    const account = mapMerchantA2CAccount(row);
    const updates: string[] = [];
    const values: Array<string | number> = [];
    if (typeof patch.enabled === "boolean") {
      updates.push("enabled = ?");
      values.push(patch.enabled ? 1 : 0);
    }
    if (typeof patch.countryId === "string") {
      updates.push("country_id = ?");
      values.push(this.countries.validCountryId(account.merchantId, patch.countryId) || this.countries.defaultCountryId(account.merchantId));
    }
    if (patch.groupId === null || patch.groupId === "") {
      updates.push("group_id = NULL");
    } else if (patch.groupId !== undefined) {
      const groupId = Number(patch.groupId);
      const group = this.getGroup(groupId, account.merchantId);
      if (!group) throw new Error("客服分组不存在");
      updates.push("group_id = ?");
      values.push(group.id);
    }
    if (updates.length) {
      this.db.sqlite
        .prepare(`UPDATE merchant_a2c_accounts SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(...values, id);
      this.refreshPhones(account.merchantId);
    }
    return this.list({ merchantId: account.merchantId }).find((item) => item.id === id);
  }

  getAccount(id: number, merchantId?: string): MerchantA2CAccountRecord | undefined {
    const row = this.db.sqlite
      .prepare(`SELECT * FROM merchant_a2c_accounts WHERE id = ? ${merchantId ? "AND merchant_id = ?" : ""}`)
      .get(id, ...(merchantId ? [merchantId] : [])) as Record<string, unknown> | undefined;
    return row ? mapMerchantA2CAccount(row) : undefined;
  }

  listGroups(merchantId: string): A2CAccountGroupRecord[] {
    return this.db.sqlite.prepare(`
      SELECT g.*, co.code AS country_code, co.name AS country_name,
             (SELECT COUNT(*) FROM merchant_a2c_accounts a WHERE a.group_id = g.id AND a.merchant_id = g.merchant_id) AS account_count,
             (SELECT COUNT(*) FROM a2c_group_invite_codes ic WHERE ic.group_id = g.id AND ic.merchant_id = g.merchant_id) AS invite_code_count
      FROM a2c_account_groups g
      LEFT JOIN merchant_countries co ON co.id = g.country_id
      WHERE g.merchant_id = ?
      ORDER BY CASE g.status WHEN 'active' THEN 0 ELSE 1 END, g.name ASC
    `).all(merchantId).map((row) => mapAccountGroup(row as Record<string, unknown>));
  }

  getGroup(id: number, merchantId: string): A2CAccountGroupRecord | undefined {
    return this.listGroups(merchantId).find((item) => item.id === id);
  }

  createGroup(merchantId: string, input: Record<string, unknown>): A2CAccountGroupRecord {
    const name = String(input.name ?? "").trim();
    if (!name) throw new Error("分组名称不能为空");
    const countryId = this.countries.validCountryId(merchantId, String(input.countryId ?? "")) || this.countries.defaultCountryId(merchantId);
    const status = String(input.status ?? "active") === "disabled" ? "disabled" : "active";
    const result = this.db.sqlite.prepare(`
      INSERT INTO a2c_account_groups (merchant_id, country_id, name, status)
      VALUES (?, ?, ?, ?)
    `).run(merchantId, countryId, name, status);
    return this.getGroup(Number(result.lastInsertRowid), merchantId)!;
  }

  patchGroup(id: number, merchantId: string, patch: Record<string, unknown>): A2CAccountGroupRecord | undefined {
    const existing = this.getGroup(id, merchantId);
    if (!existing) return undefined;
    const updates: string[] = [];
    const values: Array<string | number> = [];
    let updatedCountryId = "";
    if (typeof patch.name === "string") {
      const name = patch.name.trim();
      if (!name) throw new Error("分组名称不能为空");
      updates.push("name = ?");
      values.push(name);
    }
    if (typeof patch.countryId === "string") {
      updates.push("country_id = ?");
      updatedCountryId = this.countries.validCountryId(merchantId, patch.countryId) || this.countries.defaultCountryId(merchantId);
      values.push(updatedCountryId);
    }
    if (patch.status !== undefined) {
      updates.push("status = ?");
      values.push(String(patch.status) === "disabled" ? "disabled" : "active");
    }
    if (updates.length) {
      this.db.sqlite.prepare(`UPDATE a2c_account_groups SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND merchant_id = ?`).run(...values, id, merchantId);
    }
    if (updatedCountryId) {
      this.db.sqlite.prepare("UPDATE merchant_a2c_accounts SET country_id = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ? AND group_id = ?").run(updatedCountryId, merchantId, id);
      this.db.sqlite.prepare("UPDATE a2c_group_invite_codes SET country_id = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ? AND group_id = ?").run(updatedCountryId, merchantId, id);
    }
    return this.getGroup(id, merchantId);
  }

  deleteGroup(id: number, merchantId: string): boolean {
    const group = this.getGroup(id, merchantId);
    if (!group) return false;
    this.db.sqlite.exec("BEGIN");
    try {
      this.db.sqlite.prepare(`
        DELETE FROM invite_code_teacher_tg_links
        WHERE merchant_id = ?
          AND invite_source = 'group'
          AND invite_code_id IN (
            SELECT id FROM a2c_group_invite_codes WHERE merchant_id = ? AND group_id = ?
          )
      `).run(merchantId, merchantId, id);
      this.db.sqlite.prepare("UPDATE merchant_a2c_accounts SET group_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ? AND group_id = ?").run(merchantId, id);
      this.db.sqlite.prepare("DELETE FROM a2c_account_groups WHERE id = ? AND merchant_id = ?").run(id, merchantId);
      this.db.sqlite.exec("COMMIT");
      return true;
    } catch (error) {
      this.db.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  setGroupAccounts(id: number, merchantId: string, accountIds: number[]): A2CAccountGroupRecord | undefined {
    const group = this.getGroup(id, merchantId);
    if (!group) return undefined;
    const uniqueIds = [...new Set(accountIds.filter((value) => Number.isInteger(value)))];
    const validIds = uniqueIds.length ? (this.db.sqlite.prepare(`SELECT id FROM merchant_a2c_accounts WHERE merchant_id = ? AND id IN (${uniqueIds.map(() => "?").join(",")})`).all(merchantId, ...uniqueIds) as Array<{ id: number }>).map((row) => row.id) : [];
    this.db.sqlite.exec("BEGIN");
    try {
      this.db.sqlite.prepare("UPDATE merchant_a2c_accounts SET group_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ? AND group_id = ?").run(merchantId, id);
      const assign = this.db.sqlite.prepare("UPDATE merchant_a2c_accounts SET group_id = ?, country_id = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ? AND id = ?");
      for (const accountId of validIds) assign.run(id, group.countryId, merchantId, accountId);
      this.db.sqlite.exec("COMMIT");
    } catch (error) {
      this.db.sqlite.exec("ROLLBACK");
      throw error;
    }
    return this.getGroup(id, merchantId);
  }

  listInviteCodes(accountId: number, merchantId?: string): A2CInviteCodeRecord[] {
    const account = this.getAccount(accountId, merchantId);
    if (!account) return [];
    return this.db.sqlite
      .prepare(`
        SELECT ic.*, 'account' AS invite_source, '' AS group_name, co.code AS country_code, co.name AS country_name
        FROM a2c_invite_codes ic
        LEFT JOIN merchant_countries co ON co.id = ic.country_id
        WHERE ic.a2c_account_id = ? AND ic.merchant_id = ?
        ORDER BY
          CASE ic.status WHEN 'available' THEN 0 WHEN 'reserved' THEN 1 WHEN 'used' THEN 2 ELSE 3 END,
          ic.id DESC
      `)
      .all(account.id, account.merchantId)
      .map((row) => mapA2CInviteCode(row as Record<string, unknown>));
  }

  listGroupInviteCodes(groupId: number, merchantId: string): A2CInviteCodeRecord[] {
    const group = this.getGroup(groupId, merchantId);
    if (!group) return [];
    return this.db.sqlite.prepare(`
      SELECT ic.*, 'group' AS invite_source, g.name AS group_name,
             0 AS a2c_account_id, '' AS a2c_account_phone,
             '' AS assigned_customer_key, '' AS assigned_conversation_id,
             '' AS platform_account, '' AS assigned_at, ic.last_used_at AS used_at,
             co.code AS country_code, co.name AS country_name
      FROM a2c_group_invite_codes ic
      JOIN a2c_account_groups g ON g.id = ic.group_id AND g.merchant_id = ic.merchant_id
      LEFT JOIN merchant_countries co ON co.id = ic.country_id
      WHERE ic.group_id = ? AND ic.merchant_id = ?
      ORDER BY CASE ic.status WHEN 'available' THEN 0 ELSE 1 END, ic.id ASC
    `).all(groupId, merchantId).map((row) => mapA2CInviteCode(row as Record<string, unknown>));
  }

  createGroupInviteCode(groupId: number, merchantId: string, input: Record<string, unknown>): A2CInviteCodeRecord {
    const group = this.getGroup(groupId, merchantId);
    if (!group) throw new Error("客服分组不存在");
    const code = String(input.code ?? "").trim();
    if (!code) throw new Error("邀请码不能为空");
    const status = normalizeInviteCodeStatus(input.status, "available");
    const reusable = input.reusable === undefined ? true : Boolean(input.reusable);
    this.db.sqlite.prepare(`
      INSERT INTO a2c_group_invite_codes (merchant_id, country_id, group_id, code, register_url, status, reusable)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(merchant_id, group_id, code) DO UPDATE SET
        register_url = excluded.register_url,
        status = excluded.status,
        reusable = excluded.reusable,
        updated_at = CURRENT_TIMESTAMP
    `).run(merchantId, group.countryId, groupId, code, String(input.registerUrl ?? "").trim(), status, reusable ? 1 : 0);
    return this.listGroupInviteCodes(groupId, merchantId).find((item) => item.code === code)!;
  }

  importGroupInviteCodes(groupId: number, merchantId: string, input: { codes?: string; registerUrl?: string; reusable?: boolean }): { imported: number; rows: A2CInviteCodeRecord[] } {
    const group = this.getGroup(groupId, merchantId);
    if (!group) throw new Error("客服分组不存在");
    const codes = [...new Set(String(input.codes ?? "").split(/[\n,，;\t ]+/).map((item) => item.trim()).filter(Boolean))];
    let imported = 0;
    this.db.sqlite.exec("BEGIN");
    try {
      for (const code of codes) {
        this.createGroupInviteCode(groupId, merchantId, { code, registerUrl: input.registerUrl ?? "", reusable: input.reusable ?? true });
        imported += 1;
      }
      this.db.sqlite.exec("COMMIT");
    } catch (error) {
      this.db.sqlite.exec("ROLLBACK");
      throw error;
    }
    return { imported, rows: this.listGroupInviteCodes(groupId, merchantId) };
  }

  patchGroupInviteCode(id: number, merchantId: string, patch: Record<string, unknown>): A2CInviteCodeRecord | undefined {
    const row = this.getGroupInviteCode(id, merchantId);
    if (!row) return undefined;
    const updates: string[] = [];
    const values: Array<string | number> = [];
    if (typeof patch.code === "string" && patch.code.trim()) { updates.push("code = ?"); values.push(patch.code.trim()); }
    if (typeof patch.registerUrl === "string") { updates.push("register_url = ?"); values.push(patch.registerUrl.trim()); }
    if (patch.status !== undefined) { updates.push("status = ?"); values.push(normalizeInviteCodeStatus(patch.status, row.status)); }
    if (patch.reusable !== undefined) { updates.push("reusable = ?"); values.push(Boolean(patch.reusable) ? 1 : 0); }
    if (updates.length) this.db.sqlite.prepare(`UPDATE a2c_group_invite_codes SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND merchant_id = ?`).run(...values, id, merchantId);
    return this.getGroupInviteCode(id, merchantId);
  }

  deleteGroupInviteCode(id: number, merchantId: string): boolean {
    const row = this.getGroupInviteCode(id, merchantId);
    if (!row) return false;
    this.db.sqlite.prepare("DELETE FROM invite_code_teacher_tg_links WHERE merchant_id = ? AND invite_source = 'group' AND invite_code_id = ?").run(merchantId, id);
    return this.db.sqlite.prepare("DELETE FROM a2c_group_invite_codes WHERE id = ? AND merchant_id = ?").run(id, merchantId).changes > 0;
  }

  getGroupInviteCode(id: number, merchantId: string): A2CInviteCodeRecord | undefined {
    const row = this.db.sqlite.prepare(`
      SELECT ic.*, 'group' AS invite_source, g.name AS group_name,
             0 AS a2c_account_id, '' AS a2c_account_phone,
             '' AS assigned_customer_key, '' AS assigned_conversation_id,
             '' AS platform_account, '' AS assigned_at, ic.last_used_at AS used_at,
             co.code AS country_code, co.name AS country_name
      FROM a2c_group_invite_codes ic
      JOIN a2c_account_groups g ON g.id = ic.group_id AND g.merchant_id = ic.merchant_id
      LEFT JOIN merchant_countries co ON co.id = ic.country_id
      WHERE ic.id = ? AND ic.merchant_id = ?
    `).get(id, merchantId) as Record<string, unknown> | undefined;
    return row ? mapA2CInviteCode(row) : undefined;
  }

  listInviteTeacherBindings(inviteSource: "account" | "group", inviteCodeId: number, merchantId: string): InviteCodeTeacherLinkBindingRecord[] {
    return this.db.sqlite.prepare(`
      SELECT * FROM invite_code_teacher_tg_links
      WHERE merchant_id = ? AND invite_source = ? AND invite_code_id = ?
      ORDER BY id ASC
    `).all(merchantId, inviteSource, inviteCodeId).map((row) => mapTeacherBinding(row as Record<string, unknown>));
  }

  replaceInviteTeacherBindings(inviteSource: "account" | "group", inviteCodeId: number, merchantId: string, teacherTgLinkIds: number[]): InviteCodeTeacherLinkBindingRecord[] {
    const invite = inviteSource === "group" ? this.getGroupInviteCode(inviteCodeId, merchantId) : this.getInviteCode(inviteCodeId, merchantId);
    if (!invite) throw new Error("邀请码不存在");
    const uniqueIds = [...new Set(teacherTgLinkIds.filter((value) => Number.isInteger(value)))];
    const validIds = uniqueIds.length ? (this.db.sqlite.prepare(`SELECT id FROM teacher_tg_links WHERE merchant_id = ? AND id IN (${uniqueIds.map(() => "?").join(",")})`).all(merchantId, ...uniqueIds) as Array<{ id: number }>).map((row) => row.id) : [];
    this.db.sqlite.exec("BEGIN");
    try {
      this.db.sqlite.prepare("DELETE FROM invite_code_teacher_tg_links WHERE merchant_id = ? AND invite_source = ? AND invite_code_id = ?").run(merchantId, inviteSource, inviteCodeId);
      const insert = this.db.sqlite.prepare(`INSERT INTO invite_code_teacher_tg_links (merchant_id, invite_source, invite_code_id, teacher_tg_link_id) VALUES (?, ?, ?, ?)`);
      for (const teacherId of validIds) insert.run(merchantId, inviteSource, inviteCodeId, teacherId);
      this.db.sqlite.exec("COMMIT");
    } catch (error) {
      this.db.sqlite.exec("ROLLBACK");
      throw error;
    }
    return this.listInviteTeacherBindings(inviteSource, inviteCodeId, merchantId);
  }

  createInviteCode(accountId: number, input: Record<string, unknown>, merchantId?: string): A2CInviteCodeRecord {
    const account = this.getAccount(accountId, merchantId);
    if (!account) throw new Error("a2c account not found");
    const code = String(input.code || "").trim();
    if (!code) throw new Error("invite code is required");
    const registerUrl = String(input.registerUrl || "").trim();
    const status = normalizeInviteCodeStatus(input.status, "available");
    const reusable = Boolean(input.reusable ?? false);
    this.db.sqlite
      .prepare(`
        INSERT INTO a2c_invite_codes
          (merchant_id, country_id, a2c_account_id, a2c_account_phone, code, register_url, status, reusable)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(merchant_id, a2c_account_phone, code) DO UPDATE SET
          country_id = excluded.country_id,
          a2c_account_id = excluded.a2c_account_id,
          register_url = excluded.register_url,
          reusable = excluded.reusable,
          status = CASE WHEN a2c_invite_codes.status = 'used' THEN a2c_invite_codes.status ELSE excluded.status END,
          updated_at = CURRENT_TIMESTAMP
      `)
      .run(account.merchantId, account.countryId, account.id, account.apiPhone, code, registerUrl, status, reusable ? 1 : 0);
    const row = this.db.sqlite
      .prepare(`
        SELECT ic.*, 'account' AS invite_source, '' AS group_name, co.code AS country_code, co.name AS country_name
        FROM a2c_invite_codes ic
        LEFT JOIN merchant_countries co ON co.id = ic.country_id
        WHERE ic.merchant_id = ? AND ic.a2c_account_phone = ? AND ic.code = ?
      `)
      .get(account.merchantId, account.apiPhone, code) as Record<string, unknown>;
    return mapA2CInviteCode(row);
  }

  importInviteCodes(accountId: number, input: { codes?: string; registerUrl?: string; reusable?: boolean }, merchantId?: string): { imported: number; rows: A2CInviteCodeRecord[] } {
    const account = this.getAccount(accountId, merchantId);
    if (!account) throw new Error("a2c account not found");
    const registerUrl = String(input.registerUrl || "").trim();
    const codes = String(input.codes || "")
      .split(/[\n,，;\t ]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    const uniqueCodes = [...new Set(codes)];
    let imported = 0;
    const insert = this.db.sqlite.prepare(`
      INSERT INTO a2c_invite_codes
        (merchant_id, country_id, a2c_account_id, a2c_account_phone, code, register_url, status, reusable)
      VALUES (?, ?, ?, ?, ?, ?, 'available', ?)
      ON CONFLICT(merchant_id, a2c_account_phone, code) DO UPDATE SET
        country_id = excluded.country_id,
        a2c_account_id = excluded.a2c_account_id,
        register_url = CASE WHEN excluded.register_url != '' THEN excluded.register_url ELSE a2c_invite_codes.register_url END,
        reusable = excluded.reusable,
        updated_at = CURRENT_TIMESTAMP
    `);
    this.db.sqlite.exec("BEGIN");
    try {
      for (const code of uniqueCodes) {
        const result = insert.run(account.merchantId, account.countryId, account.id, account.apiPhone, code, registerUrl, input.reusable ? 1 : 0);
        if (result.changes > 0) imported += 1;
      }
      this.db.sqlite.exec("COMMIT");
    } catch (error) {
      this.db.sqlite.exec("ROLLBACK");
      throw error;
    }
    return { imported, rows: this.listInviteCodes(account.id, account.merchantId) };
  }

  patchInviteCode(id: number, patch: Record<string, unknown>, merchantId?: string): A2CInviteCodeRecord | undefined {
    const existing = this.getInviteCode(id, merchantId);
    if (!existing) return undefined;
    const allowed: Record<string, string> = {
      code: "code",
      registerUrl: "register_url",
      status: "status",
      assignedCustomerKey: "assigned_customer_key",
      assignedConversationId: "assigned_conversation_id",
      platformAccount: "platform_account"
    };
    if (patch.reusable !== undefined) {
      patch = { ...patch, reusable: Boolean(patch.reusable) };
      allowed.reusable = "reusable";
    }
    const entries = Object.entries(patch).filter(([key]) => key in allowed);
    if (entries.length) {
      const assignments = entries.map(([key]) => `${allowed[key]} = ?`).join(", ");
      const values = entries.map(([key, value]) => key === "status" ? normalizeInviteCodeStatus(value, existing.status) : key === "reusable" ? (value ? 1 : 0) : String(value ?? ""));
      this.db.sqlite
        .prepare(`UPDATE a2c_invite_codes SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND merchant_id = ?`)
        .run(...values, id, existing.merchantId);
    }
    return this.getInviteCode(id, existing.merchantId);
  }

  deleteInviteCode(id: number, merchantId?: string): boolean {
    const existing = this.getInviteCode(id, merchantId);
    if (!existing) return false;
    this.db.sqlite.prepare("DELETE FROM invite_code_teacher_tg_links WHERE merchant_id = ? AND invite_source = 'account' AND invite_code_id = ?").run(existing.merchantId, id);
    const result = this.db.sqlite.prepare("DELETE FROM a2c_invite_codes WHERE id = ? AND merchant_id = ?").run(id, existing.merchantId);
    return result.changes > 0;
  }

  reserveInviteCodeForConversation(conversation: Pick<Conversation, "id" | "merchantId" | "countryId" | "customerPhone" | "a2cAccountPhone">): A2CInviteCodeRecord | undefined {
    const assigned = this.inviteAssignmentForConversation(conversation.id, conversation.merchantId);
    if (assigned) return assigned;

    const legacyExisting = this.db.sqlite
      .prepare(`
        SELECT ic.*, 'account' AS invite_source, '' AS group_name, co.code AS country_code, co.name AS country_name
        FROM a2c_invite_codes ic
        LEFT JOIN merchant_countries co ON co.id = ic.country_id
        WHERE ic.merchant_id = ? AND ic.assigned_conversation_id = ? AND ic.status IN ('reserved', 'used')
        ORDER BY ic.id DESC
        LIMIT 1
      `)
      .get(conversation.merchantId, conversation.id) as Record<string, unknown> | undefined;
    if (legacyExisting && inviteCodeAccountMatches(String(legacyExisting.a2c_account_phone ?? ""), conversation.a2cAccountPhone)) {
      return mapA2CInviteCode(legacyExisting);
    }

    const account = this.list({ merchantId: conversation.merchantId })
      .find((item) => inviteCodeAccountMatches(item.apiPhone, conversation.a2cAccountPhone));
    if (!account) return undefined;

    if (account.groupId) {
      const group = this.getGroup(account.groupId, conversation.merchantId);
      if (group?.status === "active") {
        const groupCode = this.db.sqlite.prepare(`
          SELECT id
          FROM a2c_group_invite_codes
          WHERE merchant_id = ? AND group_id = ?
            AND (country_id = ? OR country_id = '' OR country_id IS NULL)
            AND status = 'available'
          ORDER BY usage_count ASC, id ASC
          LIMIT 1
        `).get(conversation.merchantId, group.id, conversation.countryId) as { id: number } | undefined;
        if (groupCode && this.assignInviteToConversation("group", groupCode.id, conversation)) {
          return this.inviteAssignmentForConversation(conversation.id, conversation.merchantId);
        }
      }
    }

    const available = this.db.sqlite
      .prepare(`
        SELECT ic.*, 'account' AS invite_source, '' AS group_name, co.code AS country_code, co.name AS country_name
        FROM a2c_invite_codes ic
        LEFT JOIN merchant_countries co ON co.id = ic.country_id
        WHERE ic.merchant_id = ?
          AND ic.a2c_account_id = ?
          AND (ic.country_id = ? OR ic.country_id = '' OR ic.country_id IS NULL)
          AND ic.status = 'available'
        ORDER BY
          CASE WHEN ic.country_id = ? THEN 0 WHEN ic.country_id = '' THEN 1 ELSE 2 END,
          ic.id ASC
        LIMIT 1
      `)
      .get(conversation.merchantId, account.id, conversation.countryId, conversation.countryId) as Record<string, unknown> | undefined;
    if (!available) return undefined;

    const code = mapA2CInviteCode(available);
    if (!this.assignInviteToConversation("account", code.id, conversation)) {
      return this.inviteAssignmentForConversation(conversation.id, conversation.merchantId)
        ?? this.reserveInviteCodeForConversation(conversation);
    }
    return this.inviteAssignmentForConversation(conversation.id, conversation.merchantId);
  }

  markInviteCodeUsedForConversation(conversationId: string, merchantId: string, platformAccount = ""): A2CInviteCodeRecord | undefined {
    const assignment = this.db.sqlite.prepare(`
      SELECT * FROM a2c_invite_assignments
      WHERE merchant_id = ? AND conversation_id = ? AND status IN ('reserved', 'used')
      LIMIT 1
    `).get(merchantId, conversationId) as Record<string, unknown> | undefined;
    if (assignment) {
      const source = String(assignment.invite_source) === "group" ? "group" : "account";
      const inviteCodeId = Number(assignment.invite_code_id);
      const code = source === "group" ? this.getGroupInviteCode(inviteCodeId, merchantId) : this.getInviteCode(inviteCodeId, merchantId);
      if (!code) return undefined;
      this.db.sqlite.exec("BEGIN");
      try {
        this.db.sqlite.prepare(`
          UPDATE a2c_invite_assignments
          SET status = 'used', platform_account = CASE WHEN ? != '' THEN ? ELSE platform_account END,
              used_at = COALESCE(NULLIF(used_at, ''), CURRENT_TIMESTAMP)
          WHERE merchant_id = ? AND conversation_id = ?
        `).run(platformAccount, platformAccount, merchantId, conversationId);
        const table = source === "group" ? "a2c_group_invite_codes" : "a2c_invite_codes";
        this.db.sqlite.prepare(`
          UPDATE ${table}
          SET status = CASE WHEN reusable = 1 THEN 'available' ELSE 'used' END,
              last_used_at = CURRENT_TIMESTAMP,
              ${source === "account" ? "platform_account = CASE WHEN ? != '' THEN ? ELSE platform_account END, used_at = COALESCE(NULLIF(used_at, ''), CURRENT_TIMESTAMP)," : ""}
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND merchant_id = ?
        `).run(...(source === "account" ? [platformAccount, platformAccount] : []), inviteCodeId, merchantId);
        this.db.sqlite.exec("COMMIT");
      } catch (error) {
        this.db.sqlite.exec("ROLLBACK");
        throw error;
      }
      return this.inviteAssignmentForConversation(conversationId, merchantId);
    }

    const existing = this.db.sqlite
      .prepare(`
        SELECT ic.*, 'account' AS invite_source, '' AS group_name, co.code AS country_code, co.name AS country_name
        FROM a2c_invite_codes ic
        LEFT JOIN merchant_countries co ON co.id = ic.country_id
        WHERE ic.merchant_id = ? AND ic.assigned_conversation_id = ? AND ic.status IN ('reserved', 'available')
        ORDER BY ic.id DESC
        LIMIT 1
      `)
      .get(merchantId, conversationId) as Record<string, unknown> | undefined;
    if (!existing) return undefined;
    const code = mapA2CInviteCode(existing);
    this.db.sqlite
      .prepare(`
        UPDATE a2c_invite_codes
        SET status = 'used',
            platform_account = CASE WHEN ? != '' THEN ? ELSE platform_account END,
            used_at = COALESCE(NULLIF(used_at, ''), CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND merchant_id = ?
      `)
      .run(platformAccount, platformAccount, code.id, merchantId);
    return this.getInviteCode(code.id, merchantId);
  }

  getInviteCode(id: number, merchantId?: string): A2CInviteCodeRecord | undefined {
    const row = this.db.sqlite
      .prepare(`
        SELECT ic.*, 'account' AS invite_source, '' AS group_name, co.code AS country_code, co.name AS country_name
        FROM a2c_invite_codes ic
        LEFT JOIN merchant_countries co ON co.id = ic.country_id
        WHERE ic.id = ? ${merchantId ? "AND ic.merchant_id = ?" : ""}
      `)
      .get(id, ...(merchantId ? [merchantId] : [])) as Record<string, unknown> | undefined;
    return row ? mapA2CInviteCode(row) : undefined;
  }

  private assignInviteToConversation(
    source: "account" | "group",
    inviteCodeId: number,
    conversation: Pick<Conversation, "id" | "merchantId" | "countryId" | "customerPhone">
  ): boolean {
    const code = source === "group" ? this.getGroupInviteCode(inviteCodeId, conversation.merchantId) : this.getInviteCode(inviteCodeId, conversation.merchantId);
    if (!code || code.status !== "available") return false;
    this.db.sqlite.exec("BEGIN");
    try {
      const inserted = this.db.sqlite.prepare(`
        INSERT OR IGNORE INTO a2c_invite_assignments
          (merchant_id, conversation_id, customer_key, invite_source, invite_code_id, invite_code, register_url)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(conversation.merchantId, conversation.id, conversation.customerPhone, source, code.id, code.code, code.registerUrl);
      if (!inserted.changes) {
        this.db.sqlite.exec("COMMIT");
        return false;
      }
      const table = source === "group" ? "a2c_group_invite_codes" : "a2c_invite_codes";
      const updated = this.db.sqlite.prepare(`
        UPDATE ${table}
        SET status = CASE WHEN reusable = 1 THEN status ELSE 'reserved' END,
            usage_count = usage_count + 1,
            ${source === "account" ? "country_id = ?, assigned_customer_key = CASE WHEN reusable = 1 THEN assigned_customer_key ELSE ? END, assigned_conversation_id = CASE WHEN reusable = 1 THEN assigned_conversation_id ELSE ? END, assigned_at = CASE WHEN reusable = 1 THEN assigned_at ELSE COALESCE(NULLIF(assigned_at, ''), CURRENT_TIMESTAMP) END," : ""}
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND merchant_id = ? AND status = 'available'
      `).run(...(source === "account" ? [conversation.countryId, conversation.customerPhone, conversation.id] : []), code.id, conversation.merchantId);
      if (!updated.changes) throw new Error("invite code was allocated concurrently");
      this.db.sqlite.exec("COMMIT");
      return true;
    } catch (error) {
      this.db.sqlite.exec("ROLLBACK");
      if (error instanceof Error && /concurrently/.test(error.message)) return false;
      throw error;
    }
  }

  private inviteAssignmentForConversation(conversationId: string, merchantId: string): A2CInviteCodeRecord | undefined {
    const assignment = this.db.sqlite.prepare(`
      SELECT * FROM a2c_invite_assignments
      WHERE merchant_id = ? AND conversation_id = ? AND status IN ('reserved', 'used')
      LIMIT 1
    `).get(merchantId, conversationId) as Record<string, unknown> | undefined;
    if (!assignment) return undefined;
    const source = String(assignment.invite_source) === "group" ? "group" : "account";
    const code = source === "group"
      ? this.getGroupInviteCode(Number(assignment.invite_code_id), merchantId)
      : this.getInviteCode(Number(assignment.invite_code_id), merchantId);
    if (!code) return undefined;
    return {
      ...code,
      status: String(assignment.status) === "used" ? "used" : "reserved",
      assignedCustomerKey: String(assignment.customer_key ?? ""),
      assignedConversationId: conversationId,
      platformAccount: String(assignment.platform_account ?? ""),
      assignedAt: String(assignment.assigned_at ?? ""),
      usedAt: String(assignment.used_at ?? "")
    };
  }

  refreshPhones(merchantId: string): MerchantConfigRecord {
    const phones = this.list({ merchantId, enabled: true }).map((account) => account.apiPhone).join(",");
    this.db.sqlite.prepare("INSERT OR IGNORE INTO merchant_configs (merchant_id) VALUES (?)").run(merchantId);
    this.db.sqlite
      .prepare("UPDATE merchant_configs SET a2c_account_phone = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?")
      .run(phones, merchantId);
    return this.configs.getMerchantConfig(merchantId);
  }
}
