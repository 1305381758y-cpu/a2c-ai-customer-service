import type { A2CAccount } from "./clients/a2c.js";
import type { Db } from "./db.js";
import {
  inviteCodeAccountMatches,
  mapA2CInviteCode,
  mapMerchantA2CAccount,
  normalizeInviteCodeStatus
} from "./repositoryMappers.js";
import type { A2CInviteCodeRecord, Conversation, MerchantA2CAccountRecord, MerchantConfigRecord } from "./repositoryTypes.js";

export class MerchantA2CAccountRepository {
  constructor(
    private readonly db: Db,
    private readonly countries: {
      defaultCountryId: (merchantId: string) => string;
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
        SELECT a.*, co.code AS country_code, co.name AS country_name, co.default_language
        FROM merchant_a2c_accounts a
        LEFT JOIN merchant_countries co ON co.id = a.country_id
        ${where}
        ORDER BY a.enabled DESC, a.api_phone ASC
      `)
      .all(...params)
      .map((row) => mapMerchantA2CAccount(row as Record<string, unknown>));
  }

  sync(merchantId: string, accounts: A2CAccount[]): MerchantA2CAccountRecord[] {
    this.db.sqlite.prepare("INSERT OR IGNORE INTO merchant_configs (merchant_id) VALUES (?)").run(merchantId);
    const defaultCountryId = this.countries.defaultCountryId(merchantId);
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
      values.push(this.countries.defaultCountryId(account.merchantId));
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

  listInviteCodes(accountId: number, merchantId?: string): A2CInviteCodeRecord[] {
    const account = this.getAccount(accountId, merchantId);
    if (!account) return [];
    return this.db.sqlite
      .prepare(`
        SELECT ic.*, co.code AS country_code, co.name AS country_name
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

  createInviteCode(accountId: number, input: Record<string, unknown>, merchantId?: string): A2CInviteCodeRecord {
    const account = this.getAccount(accountId, merchantId);
    if (!account) throw new Error("a2c account not found");
    const code = String(input.code || "").trim();
    if (!code) throw new Error("invite code is required");
    const registerUrl = String(input.registerUrl || "").trim();
    const status = normalizeInviteCodeStatus(input.status, "available");
    this.db.sqlite
      .prepare(`
        INSERT INTO a2c_invite_codes
          (merchant_id, country_id, a2c_account_id, a2c_account_phone, code, register_url, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(merchant_id, a2c_account_phone, code) DO UPDATE SET
          country_id = excluded.country_id,
          a2c_account_id = excluded.a2c_account_id,
          register_url = excluded.register_url,
          status = CASE WHEN a2c_invite_codes.status = 'used' THEN a2c_invite_codes.status ELSE excluded.status END,
          updated_at = CURRENT_TIMESTAMP
      `)
      .run(account.merchantId, account.countryId, account.id, account.apiPhone, code, registerUrl, status);
    const row = this.db.sqlite
      .prepare(`
        SELECT ic.*, co.code AS country_code, co.name AS country_name
        FROM a2c_invite_codes ic
        LEFT JOIN merchant_countries co ON co.id = ic.country_id
        WHERE ic.merchant_id = ? AND ic.a2c_account_phone = ? AND ic.code = ?
      `)
      .get(account.merchantId, account.apiPhone, code) as Record<string, unknown>;
    return mapA2CInviteCode(row);
  }

  importInviteCodes(accountId: number, input: { codes?: string; registerUrl?: string }, merchantId?: string): { imported: number; rows: A2CInviteCodeRecord[] } {
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
        (merchant_id, country_id, a2c_account_id, a2c_account_phone, code, register_url, status)
      VALUES (?, ?, ?, ?, ?, ?, 'available')
      ON CONFLICT(merchant_id, a2c_account_phone, code) DO UPDATE SET
        country_id = excluded.country_id,
        a2c_account_id = excluded.a2c_account_id,
        register_url = CASE WHEN excluded.register_url != '' THEN excluded.register_url ELSE a2c_invite_codes.register_url END,
        updated_at = CURRENT_TIMESTAMP
    `);
    this.db.sqlite.exec("BEGIN");
    try {
      for (const code of uniqueCodes) {
        const result = insert.run(account.merchantId, account.countryId, account.id, account.apiPhone, code, registerUrl);
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
    const entries = Object.entries(patch).filter(([key]) => key in allowed);
    if (entries.length) {
      const assignments = entries.map(([key]) => `${allowed[key]} = ?`).join(", ");
      const values = entries.map(([key, value]) => key === "status" ? normalizeInviteCodeStatus(value, existing.status) : String(value ?? ""));
      this.db.sqlite
        .prepare(`UPDATE a2c_invite_codes SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND merchant_id = ?`)
        .run(...values, id, existing.merchantId);
    }
    return this.getInviteCode(id, existing.merchantId);
  }

  deleteInviteCode(id: number, merchantId?: string): boolean {
    const existing = this.getInviteCode(id, merchantId);
    if (!existing) return false;
    const result = this.db.sqlite.prepare("DELETE FROM a2c_invite_codes WHERE id = ? AND merchant_id = ?").run(id, existing.merchantId);
    return result.changes > 0;
  }

  reserveInviteCodeForConversation(conversation: Pick<Conversation, "id" | "merchantId" | "countryId" | "customerPhone" | "a2cAccountPhone">): A2CInviteCodeRecord | undefined {
    const existing = this.db.sqlite
      .prepare(`
        SELECT ic.*, co.code AS country_code, co.name AS country_name
        FROM a2c_invite_codes ic
        LEFT JOIN merchant_countries co ON co.id = ic.country_id
        WHERE ic.merchant_id = ? AND ic.assigned_conversation_id = ? AND ic.status IN ('reserved', 'used')
        ORDER BY ic.id DESC
        LIMIT 1
      `)
      .get(conversation.merchantId, conversation.id) as Record<string, unknown> | undefined;
    if (existing) return mapA2CInviteCode(existing);

    const availableRows = this.db.sqlite
      .prepare(`
        SELECT ic.*, co.code AS country_code, co.name AS country_name
        FROM a2c_invite_codes ic
        LEFT JOIN merchant_countries co ON co.id = ic.country_id
        WHERE ic.merchant_id = ?
          AND ic.status = 'available'
        ORDER BY
          CASE WHEN ic.country_id = ? THEN 0 WHEN ic.country_id = '' THEN 1 ELSE 2 END,
          ic.id ASC
        LIMIT 200
      `)
      .all(conversation.merchantId, conversation.countryId) as Array<Record<string, unknown>>;
    const available =
      availableRows.find((row) => inviteCodeAccountMatches(String(row.a2c_account_phone ?? ""), conversation.a2cAccountPhone)) ??
      availableRows.find((row) => String(row.country_id ?? "") === conversation.countryId) ??
      availableRows.find((row) => String(row.country_id ?? "") === "") ??
      availableRows[0];
    if (!available) return undefined;

    const code = mapA2CInviteCode(available);
    this.db.sqlite
      .prepare(`
        UPDATE a2c_invite_codes
        SET status = 'reserved',
            country_id = ?,
            assigned_customer_key = ?,
            assigned_conversation_id = ?,
            assigned_at = COALESCE(NULLIF(assigned_at, ''), CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND merchant_id = ? AND status = 'available'
      `)
      .run(conversation.countryId, conversation.customerPhone, conversation.id, code.id, conversation.merchantId);
    return this.getInviteCode(code.id, conversation.merchantId);
  }

  markInviteCodeUsedForConversation(conversationId: string, merchantId: string, platformAccount = ""): A2CInviteCodeRecord | undefined {
    const existing = this.db.sqlite
      .prepare(`
        SELECT ic.*, co.code AS country_code, co.name AS country_name
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
        SELECT ic.*, co.code AS country_code, co.name AS country_name
        FROM a2c_invite_codes ic
        LEFT JOIN merchant_countries co ON co.id = ic.country_id
        WHERE ic.id = ? ${merchantId ? "AND ic.merchant_id = ?" : ""}
      `)
      .get(id, ...(merchantId ? [merchantId] : [])) as Record<string, unknown> | undefined;
    return row ? mapA2CInviteCode(row) : undefined;
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
