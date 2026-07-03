import type { Db } from "./db.js";
import { deleteCustomerRecord } from "./repositoryCustomerDeletion.js";
import { mapCustomer } from "./repositoryCustomerMappers.js";
import type { Conversation, CustomerRecord } from "./repositoryTypes.js";

export class CustomerRepository {
  constructor(private readonly db: Db) {}

  upsertFromConversation(conversation: Conversation): CustomerRecord {
    const existing = this.get(conversation.merchantId, conversation.customerPhone);
    this.db.sqlite
      .prepare(`
        INSERT INTO customers
          (merchant_id, country_id, customer_key, nickname, first_a2c_account_phone, last_a2c_account_phone,
           language, stage, extracted_phone, extracted_telegram, extracted_whatsapp, status, conversation_count, last_conversation_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(merchant_id, customer_key) DO UPDATE SET
          nickname = CASE WHEN excluded.nickname != '' THEN excluded.nickname ELSE customers.nickname END,
          last_a2c_account_phone = excluded.last_a2c_account_phone,
          country_id = excluded.country_id,
          language = excluded.language,
          stage = excluded.stage,
          extracted_phone = CASE WHEN excluded.extracted_phone != '' THEN excluded.extracted_phone ELSE customers.extracted_phone END,
          extracted_telegram = CASE WHEN excluded.extracted_telegram != '' THEN excluded.extracted_telegram ELSE customers.extracted_telegram END,
          extracted_whatsapp = CASE WHEN excluded.extracted_whatsapp != '' THEN excluded.extracted_whatsapp ELSE customers.extracted_whatsapp END,
          status = excluded.status,
          conversation_count = (
            SELECT COUNT(*)
            FROM conversations
            WHERE merchant_id = excluded.merchant_id AND customer_phone = excluded.customer_key
          ),
          last_conversation_id = excluded.last_conversation_id,
          last_seen_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      `)
      .run(
        conversation.merchantId,
        conversation.countryId,
        conversation.customerPhone,
        conversation.nickname,
        existing?.firstA2CAccountPhone || conversation.a2cAccountPhone,
        conversation.a2cAccountPhone,
        conversation.language,
        conversation.stage,
        conversation.extractedPhone,
        conversation.extractedTelegram,
        conversation.extractedWhatsApp,
        conversation.status,
        conversation.id
      );
    return this.get(conversation.merchantId, conversation.customerPhone)!;
  }

  get(merchantId: string, customerKey: string): CustomerRecord | undefined {
    const row = this.db.sqlite
      .prepare(`
        SELECT cu.*, co.code AS country_code, co.name AS country_name
        FROM customers cu
        LEFT JOIN merchant_countries co ON co.id = cu.country_id
        WHERE cu.merchant_id = ? AND cu.customer_key = ?
      `)
      .get(merchantId, customerKey) as Record<string, unknown> | undefined;
    return row ? mapCustomer(row) : undefined;
  }

  list(filters: { merchantId?: string; countryId?: string; status?: string; language?: string; q?: string; startAt?: string; endAt?: string; limit?: number } = {}): CustomerRecord[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filters.merchantId) {
      clauses.push("cu.merchant_id = ?");
      params.push(filters.merchantId);
    }
    if (filters.countryId) {
      clauses.push("cu.country_id = ?");
      params.push(filters.countryId);
    }
    if (filters.status) {
      clauses.push("cu.status = ?");
      params.push(filters.status);
    }
    if (filters.language) {
      clauses.push("cu.language = ?");
      params.push(filters.language);
    }
    addSearchFilter(clauses, params, filters.q);
    if (filters.startAt) {
      clauses.push("cu.last_seen_at >= ?");
      params.push(filters.startAt);
    }
    if (filters.endAt) {
      clauses.push("cu.last_seen_at < ?");
      params.push(filters.endAt);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 50000);
    params.push(limit);
    return this.db.sqlite
      .prepare(`
        SELECT cu.*, co.code AS country_code, co.name AS country_name
        FROM customers cu
        LEFT JOIN merchant_countries co ON co.id = cu.country_id
        ${where}
        ORDER BY cu.last_seen_at DESC, cu.id DESC
        LIMIT ?
      `)
      .all(...params)
      .map((row) => mapCustomer(row as Record<string, unknown>));
  }

  count(filters: { merchantId?: string; countryId?: string; status?: string; language?: string; q?: string; startAt?: string; endAt?: string } = {}): number {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filters.merchantId) {
      clauses.push("merchant_id = ?");
      params.push(filters.merchantId);
    }
    if (filters.countryId) {
      clauses.push("country_id = ?");
      params.push(filters.countryId);
    }
    if (filters.status) {
      clauses.push("status = ?");
      params.push(filters.status);
    }
    if (filters.language) {
      clauses.push("language = ?");
      params.push(filters.language);
    }
    addSearchFilter(clauses, params, filters.q);
    if (filters.startAt) {
      clauses.push("last_seen_at >= ?");
      params.push(filters.startAt);
    }
    if (filters.endAt) {
      clauses.push("last_seen_at < ?");
      params.push(filters.endAt);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const row = this.db.sqlite.prepare(`SELECT COUNT(*) AS count FROM customers ${where}`).get(...params) as { count: number } | undefined;
    return Number(row?.count ?? 0);
  }

  delete(merchantId: string, customerKey: string): { deleted: boolean; conversationsDeleted: number; messagesDeleted: number } {
    const customer = this.get(merchantId, customerKey);
    return deleteCustomerRecord(this.db, { merchantId, customerKey, exists: Boolean(customer) });
  }

  refreshAfterConversationDelete(merchantId: string, countryId: string, customerKey: string): void {
    const remainingInCountry = this.db.sqlite
      .prepare("SELECT COUNT(*) AS count FROM conversations WHERE merchant_id = ? AND country_id = ? AND customer_phone = ?")
      .get(merchantId, countryId, customerKey) as { count: number } | undefined;
    if ((remainingInCountry?.count ?? 0) === 0) {
      this.db.sqlite
        .prepare("DELETE FROM customer_memories WHERE merchant_id = ? AND country_id = ? AND customer_key = ?")
        .run(merchantId, countryId, customerKey);
    }

    const latest = this.db.sqlite
      .prepare(`
        SELECT id, a2c_account_phone, status, updated_at
        FROM conversations
        WHERE merchant_id = ? AND customer_phone = ?
        ORDER BY updated_at DESC
        LIMIT 1
      `)
      .get(merchantId, customerKey) as { id: string; a2c_account_phone: string; status: string; updated_at: string } | undefined;
    const count = this.db.sqlite
      .prepare("SELECT COUNT(*) AS count FROM conversations WHERE merchant_id = ? AND customer_phone = ?")
      .get(merchantId, customerKey) as { count: number } | undefined;
    if ((count?.count ?? 0) === 0) {
      this.db.sqlite
        .prepare("DELETE FROM customers WHERE merchant_id = ? AND customer_key = ?")
        .run(merchantId, customerKey);
      return;
    }
    this.db.sqlite
      .prepare(`
        UPDATE customers
        SET conversation_count = ?,
            last_conversation_id = ?,
            last_a2c_account_phone = COALESCE(?, last_a2c_account_phone),
            status = COALESCE(?, status),
            last_seen_at = COALESCE(?, last_seen_at),
            updated_at = CURRENT_TIMESTAMP
        WHERE merchant_id = ? AND customer_key = ?
      `)
      .run(count?.count ?? 0, latest?.id ?? "", latest?.a2c_account_phone ?? null, latest?.status ?? null, latest?.updated_at ?? null, merchantId, customerKey);
  }
}

function addSearchFilter(clauses: string[], params: Array<string | number>, q: string | undefined): void {
  const text = q?.trim();
  if (!text) return;
  const like = `%${text}%`;
  clauses.push(`(
    customer_key LIKE ?
    OR nickname LIKE ?
    OR first_a2c_account_phone LIKE ?
    OR last_a2c_account_phone LIKE ?
    OR extracted_phone LIKE ?
    OR extracted_telegram LIKE ?
    OR extracted_whatsapp LIKE ?
  )`);
  params.push(like, like, like, like, like, like, like);
}
