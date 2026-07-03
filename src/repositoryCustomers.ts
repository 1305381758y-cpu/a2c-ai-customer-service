import type { Db } from "./db.js";
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

  list(filters: { merchantId?: string; countryId?: string; status?: string; language?: string; limit?: number } = {}): CustomerRecord[] {
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

  delete(merchantId: string, customerKey: string): { deleted: boolean; conversationsDeleted: number; messagesDeleted: number } {
    const customer = this.get(merchantId, customerKey);
    if (!customer) return { deleted: false, conversationsDeleted: 0, messagesDeleted: 0 };
    const conversations = this.db.sqlite
      .prepare("SELECT id FROM conversations WHERE merchant_id = ? AND customer_phone = ?")
      .all(merchantId, customerKey)
      .map((row) => String((row as { id: string }).id));

    this.db.sqlite.exec("BEGIN");
    try {
      let messagesDeleted = 0;
      if (conversations.length) {
        const placeholders = conversations.map(() => "?").join(",");
        const conversationSampleMarkers = conversations.map((id) => `conversation_sample:${id}:%`);
        messagesDeleted = Number(this.db.sqlite.prepare(`DELETE FROM messages WHERE conversation_id IN (${placeholders})`).run(...conversations).changes ?? 0);
        this.db.sqlite.prepare(`DELETE FROM intent_learning_events WHERE conversation_id IN (${placeholders})`).run(...conversations);
        this.db.sqlite.prepare(`DELETE FROM conversation_review_items WHERE conversation_id IN (${placeholders})`).run(...conversations);
        this.db.sqlite.prepare(`DELETE FROM conversation_reviews WHERE conversation_id IN (${placeholders})`).run(...conversations);
        this.db.sqlite.prepare(`DELETE FROM conversation_followups WHERE conversation_id IN (${placeholders})`).run(...conversations);
        this.db.sqlite.prepare(`DELETE FROM handoff_events WHERE conversation_id IN (${placeholders})`).run(...conversations);
        this.db.sqlite.prepare(`DELETE FROM customer_memories WHERE conversation_id IN (${placeholders})`).run(...conversations);
        this.db.sqlite.prepare(`DELETE FROM conversations WHERE id IN (${placeholders})`).run(...conversations);
        this.db.sqlite.prepare(`DELETE FROM training_samples WHERE merchant_id = ? AND (${conversationSampleMarkers.map(() => "keywords LIKE ?").join(" OR ")})`).run(merchantId, ...conversationSampleMarkers);
        this.db.sqlite.prepare(`UPDATE a2c_invite_codes
          SET status = CASE WHEN status = 'reserved' THEN 'available' ELSE status END,
              assigned_customer_key = '',
              assigned_conversation_id = '',
              platform_account = '',
              assigned_at = CASE WHEN status = 'reserved' THEN '' ELSE assigned_at END,
              updated_at = CURRENT_TIMESTAMP
          WHERE merchant_id = ? AND (assigned_customer_key = ? OR assigned_conversation_id IN (${placeholders}))
        `).run(merchantId, customerKey, ...conversations);
      } else {
        this.db.sqlite.prepare(`
          UPDATE a2c_invite_codes
          SET status = CASE WHEN status = 'reserved' THEN 'available' ELSE status END,
              assigned_customer_key = '',
              assigned_conversation_id = '',
              platform_account = '',
              assigned_at = CASE WHEN status = 'reserved' THEN '' ELSE assigned_at END,
              updated_at = CURRENT_TIMESTAMP
          WHERE merchant_id = ? AND assigned_customer_key = ?
        `).run(merchantId, customerKey);
      }
      this.db.sqlite.prepare("DELETE FROM customer_memories WHERE merchant_id = ? AND customer_key = ?").run(merchantId, customerKey);
      const deleted = this.db.sqlite.prepare("DELETE FROM customers WHERE merchant_id = ? AND customer_key = ?").run(merchantId, customerKey);
      this.db.sqlite.exec("COMMIT");
      return { deleted: deleted.changes > 0, conversationsDeleted: conversations.length, messagesDeleted };
    } catch (error) {
      this.db.sqlite.exec("ROLLBACK");
      throw error;
    }
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
