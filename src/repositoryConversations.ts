import { randomUUID } from "node:crypto";
import type { Db } from "./db.js";
import {
  mapConversation,
  mapConversationExportRecord,
  mapConversationMessage,
  mapCustomerMemory
} from "./repositoryConversationMappers.js";
import { buildCustomerMemorySummary, clipText } from "./repositoryJson.js";
import type {
  Conversation,
  ConversationExportRecord,
  ConversationMessageRecord,
  CustomerMemoryRecord,
  MessageInput,
  UnreadSummaryRecord
} from "./repositoryTypes.js";

export interface ConversationRepositoryDeps {
  refreshCustomerAfterConversationDelete(merchantId: string, countryId: string, customerKey: string): void;
}

export class ConversationRepository {
  constructor(
    private readonly db: Db,
    private readonly deps: ConversationRepositoryDeps
  ) {}

  getOrCreate(customerPhone: string, a2cAccountPhone: string, nickname = "", merchantId = "default", countryId: string): Conversation {
    const existing = this.db.sqlite
      .prepare("SELECT * FROM conversations WHERE merchant_id = ? AND customer_phone = ? AND a2c_account_phone = ?")
      .get(merchantId, customerPhone, a2cAccountPhone) as Record<string, unknown> | undefined;
    if (existing) {
      const mapped = mapConversation(existing);
      if (!mapped.countryId || mapped.countryId === `${mapped.merchantId}:default` && countryId !== mapped.countryId) {
        this.db.sqlite.prepare("UPDATE conversations SET country_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(countryId, mapped.id);
        return this.get(mapped.id)!;
      }
      return mapped;
    }

    const id = randomUUID();
    this.db.sqlite
      .prepare(`
        INSERT INTO conversations (id, merchant_id, country_id, customer_phone, a2c_account_phone, nickname)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(id, merchantId, countryId, customerPhone, a2cAccountPhone, nickname);
    return this.get(id)!;
  }

  get(id: string): Conversation | undefined {
    const row = this.db.sqlite.prepare(`
      SELECT c.*, co.code AS country_code, co.name AS country_name
      FROM conversations c
      LEFT JOIN merchant_countries co ON co.id = c.country_id
      WHERE c.id = ?
    `).get(id) as Record<string, unknown> | undefined;
    return row ? mapConversation(row) : undefined;
  }

  update(conversation: Conversation): void {
    this.db.sqlite
      .prepare(`
        UPDATE conversations
        SET country_id = ?, language = ?, stage = ?, flow_step = ?, extracted_phone = ?, extracted_telegram = ?, extracted_whatsapp = ?,
            status = ?, handoff_status = ?, handoff_notified = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(
        conversation.countryId,
        conversation.language,
        conversation.stage,
        conversation.flowStep,
        conversation.extractedPhone,
        conversation.extractedTelegram,
        conversation.extractedWhatsApp,
        conversation.status,
        conversation.handoffStatus,
        conversation.handoffNotified,
        conversation.id
      );
  }

  insertMessage(input: MessageInput): { inserted: boolean; id?: number } {
    try {
      const result = this.insertMessageRow(input, input.externalId ?? null);
      if (input.direction === "inbound") {
        this.db.sqlite.prepare("UPDATE conversations SET unread_count = unread_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(input.conversationId);
      } else {
        this.learnFromConversationReply(input.conversationId, Number(result.lastInsertRowid ?? 0), input);
      }
      return { inserted: true, id: Number(result.lastInsertRowid ?? 0) || undefined };
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE")) {
        if (input.direction === "outbound") {
          const result = this.insertMessageRow(input, `local_outbound:${input.conversationId}:${Date.now()}:${Math.random().toString(36).slice(2)}`, {
            externalIdConflict: input.externalId ?? ""
          });
          this.learnFromConversationReply(input.conversationId, Number(result.lastInsertRowid ?? 0), input);
          return { inserted: true, id: Number(result.lastInsertRowid ?? 0) || undefined };
        }
        return { inserted: false };
      }
      throw error;
    }
  }

  markRead(conversationId: string, merchantId: string): Conversation | undefined {
    this.db.sqlite.prepare("UPDATE conversations SET unread_count = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND merchant_id = ?").run(conversationId, merchantId);
    return this.get(conversationId);
  }

  markAllRead(merchantId: string, filters: { a2cAccountPhone?: string } = {}): { updated: number } {
    const clauses = ["merchant_id = ?", "unread_count > 0"];
    const params: Array<string | number> = [merchantId];
    if (filters.a2cAccountPhone) {
      clauses.push("a2c_account_phone = ?");
      params.push(filters.a2cAccountPhone);
    }
    const result = this.db.sqlite
      .prepare(`UPDATE conversations SET unread_count = 0, updated_at = CURRENT_TIMESTAMP WHERE ${clauses.join(" AND ")}`)
      .run(...params);
    return { updated: Number(result.changes ?? 0) };
  }

  pin(conversationId: string, merchantId: string, pinned: boolean): Conversation | undefined {
    this.db.sqlite
      .prepare("UPDATE conversations SET pinned_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND merchant_id = ?")
      .run(pinned ? new Date().toISOString() : "", conversationId, merchantId);
    return this.get(conversationId);
  }

  unreadSummary(merchantId: string): UnreadSummaryRecord[] {
    const rows = this.db.sqlite.prepare(`
      SELECT a2c_account_phone, id AS conversation_id, customer_phone, unread_count
      FROM conversations
      WHERE merchant_id = ? AND unread_count > 0
      ORDER BY updated_at DESC
    `).all(merchantId) as Array<{ a2c_account_phone: string; conversation_id: string; customer_phone: string; unread_count: number }>;
    const grouped = new Map<string, UnreadSummaryRecord>();
    for (const row of rows) {
      const account = String(row.a2c_account_phone);
      const existing = grouped.get(account) ?? { a2cAccountPhone: account, unreadCount: 0, conversations: [] };
      existing.unreadCount += Number(row.unread_count || 0);
      existing.conversations.push({
        conversationId: String(row.conversation_id),
        customerPhone: String(row.customer_phone),
        unreadCount: Number(row.unread_count || 0)
      });
      grouped.set(account, existing);
    }
    return [...grouped.values()];
  }

  listMessages(conversationId: string, limit = 20): ConversationMessageRecord[] {
    return this.db.sqlite
      .prepare(`
        SELECT id, direction, content, msg_type, language, intent, raw_payload, created_at
        FROM messages
        WHERE conversation_id = ?
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(conversationId, limit)
      .reverse()
      .map((row) => mapConversationMessage(row as Record<string, unknown>));
  }

  exportMessages(filters: {
    merchantId?: string;
    countryId?: string;
    status?: string;
    handoffStatus?: string;
    language?: string;
    a2cAccountPhone?: string;
    customerPhone?: string;
    direction?: string;
    startAt?: string;
    endAt?: string;
    limit?: number;
  } = {}): ConversationExportRecord[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filters.merchantId) {
      clauses.push("c.merchant_id = ?");
      params.push(filters.merchantId);
    }
    if (filters.countryId) {
      clauses.push("c.country_id = ?");
      params.push(filters.countryId);
    }
    if (filters.status) {
      clauses.push("c.status = ?");
      params.push(filters.status);
    }
    if (filters.handoffStatus) {
      clauses.push("c.handoff_status = ?");
      params.push(filters.handoffStatus);
    }
    if (filters.language) {
      clauses.push("c.language = ?");
      params.push(filters.language);
    }
    if (filters.a2cAccountPhone) {
      clauses.push("c.a2c_account_phone = ?");
      params.push(filters.a2cAccountPhone);
    }
    if (filters.customerPhone) {
      clauses.push("c.customer_phone = ?");
      params.push(filters.customerPhone);
    }
    if (filters.direction) {
      clauses.push("m.direction = ?");
      params.push(filters.direction);
    }
    if (filters.startAt) {
      clauses.push("m.created_at >= ?");
      params.push(filters.startAt);
    }
    if (filters.endAt) {
      clauses.push("m.created_at <= ?");
      params.push(filters.endAt);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = Math.min(Math.max(filters.limit ?? 5000, 1), 50000);
    params.push(limit);

    return this.db.sqlite
      .prepare(`
        SELECT
          c.merchant_id,
          c.country_id,
          co.code AS country_code,
          co.name AS country_name,
          c.id AS conversation_id,
          c.customer_phone,
          c.nickname,
          c.a2c_account_phone,
          c.language AS conversation_language,
          c.stage AS conversation_stage,
          c.flow_step,
          c.status AS conversation_status,
          c.handoff_status,
          c.extracted_phone,
          c.extracted_telegram,
          c.extracted_whatsapp,
          m.id AS message_id,
          m.direction,
          m.external_id,
          m.content,
          m.msg_type,
          m.language AS message_language,
          m.intent,
          m.phone_detected,
          m.telegram_detected,
          m.raw_payload,
          m.created_at
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        LEFT JOIN merchant_countries co ON co.id = c.country_id
        ${where}
        ORDER BY m.id ASC
        LIMIT ?
      `)
      .all(...params)
      .map((row) => mapConversationExportRecord(row as Record<string, unknown>));
  }

  getCustomerMemoryByConversation(conversationId: string): CustomerMemoryRecord | undefined {
    const conversation = this.get(conversationId);
    if (!conversation) return undefined;
    return this.getCustomerMemory(conversation.merchantId, conversation.countryId, conversation.customerPhone);
  }

  getCustomerMemory(merchantId: string, countryId: string, customerKey: string): CustomerMemoryRecord | undefined {
    const row = this.db.sqlite
      .prepare(`
        SELECT cm.*, co.code AS country_code, co.name AS country_name
        FROM customer_memories cm
        LEFT JOIN merchant_countries co ON co.id = cm.country_id
        WHERE cm.merchant_id = ? AND cm.country_id = ? AND cm.customer_key = ?
      `)
      .get(merchantId, countryId, customerKey) as Record<string, unknown> | undefined;
    return row ? mapCustomerMemory(row) : undefined;
  }

  updateCustomerMemoryFromMessage(conversation: Conversation, input: { intent: string; content: string; direction: "inbound" | "outbound" }): CustomerMemoryRecord {
    const existing = this.getCustomerMemory(conversation.merchantId, conversation.countryId, conversation.customerPhone);
    const facts = existing?.facts ?? {};
    const recentSignals = Array.isArray(facts.recentSignals) ? facts.recentSignals as Array<Record<string, unknown>> : [];
    const signal = {
      direction: input.direction,
      intent: input.intent,
      content: clipText(input.content, 180),
      at: new Date().toISOString()
    };
    const lastIntent = input.direction === "inbound" || input.intent !== "unknown" ? input.intent : existing?.lastIntent ?? "unknown";
    const nextFacts = {
      ...facts,
      customerPhone: conversation.customerPhone,
      a2cAccountPhone: conversation.a2cAccountPhone,
      countryId: conversation.countryId,
      countryName: conversation.countryName,
      nickname: conversation.nickname,
      lastIntent,
      lastMessage: clipText(input.content, 180),
      recentSignals: [...recentSignals, signal].slice(-10)
    };
    const summary = buildCustomerMemorySummary(conversation, lastIntent, existing?.operatorNotes ?? "");

    this.db.sqlite
      .prepare(`
        INSERT INTO customer_memories
          (merchant_id, country_id, customer_key, conversation_id, language, stage, extracted_phone, extracted_telegram, extracted_whatsapp, last_intent, summary, facts_json, operator_notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(merchant_id, country_id, customer_key) DO UPDATE SET
          conversation_id = excluded.conversation_id,
          language = excluded.language,
          stage = excluded.stage,
          extracted_phone = excluded.extracted_phone,
          extracted_telegram = excluded.extracted_telegram,
          extracted_whatsapp = excluded.extracted_whatsapp,
          last_intent = excluded.last_intent,
          summary = excluded.summary,
          facts_json = excluded.facts_json,
          updated_at = CURRENT_TIMESTAMP
      `)
      .run(
        conversation.merchantId,
        conversation.countryId,
        conversation.customerPhone,
        conversation.id,
        conversation.language,
        conversation.stage,
        conversation.extractedPhone,
        conversation.extractedTelegram,
        conversation.extractedWhatsApp,
        lastIntent,
        summary,
        JSON.stringify(nextFacts),
        existing?.operatorNotes ?? ""
      );
    return this.getCustomerMemory(conversation.merchantId, conversation.countryId, conversation.customerPhone)!;
  }

  patchCustomerMemory(conversationId: string, merchantId: string | undefined, patch: Record<string, unknown>): CustomerMemoryRecord | undefined {
    const conversation = this.get(conversationId);
    if (!conversation || (merchantId && conversation.merchantId !== merchantId)) return undefined;
    const existing = this.getCustomerMemory(conversation.merchantId, conversation.countryId, conversation.customerPhone)
      ?? this.updateCustomerMemoryFromMessage(conversation, { intent: "unknown", content: "", direction: "inbound" });
    const facts = typeof patch.facts === "object" && patch.facts !== null && !Array.isArray(patch.facts)
      ? patch.facts as Record<string, unknown>
      : existing.facts;
    const operatorNotes = typeof patch.operatorNotes === "string" ? patch.operatorNotes : existing.operatorNotes;
    const summary = buildCustomerMemorySummary(conversation, existing.lastIntent, operatorNotes);
    this.db.sqlite
      .prepare(`
        UPDATE customer_memories
        SET facts_json = ?, operator_notes = ?, summary = ?, updated_at = CURRENT_TIMESTAMP
        WHERE merchant_id = ? AND country_id = ? AND customer_key = ?
      `)
      .run(JSON.stringify(facts), operatorNotes, summary, conversation.merchantId, conversation.countryId, conversation.customerPhone);
    return this.getCustomerMemory(conversation.merchantId, conversation.countryId, conversation.customerPhone);
  }

  list(filters: { merchantId?: string; countryId?: string; status?: string; language?: string; handoffStatus?: string; a2cAccountPhone?: string; customerPhone?: string; limit?: number } = {}): Conversation[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filters.merchantId) {
      clauses.push("c.merchant_id = ?");
      params.push(filters.merchantId);
    }
    if (filters.countryId) {
      clauses.push("c.country_id = ?");
      params.push(filters.countryId);
    }
    if (filters.status) {
      clauses.push("c.status = ?");
      params.push(filters.status);
    }
    if (filters.language) {
      clauses.push("c.language = ?");
      params.push(filters.language);
    }
    if (filters.handoffStatus) {
      clauses.push("c.handoff_status = ?");
      params.push(filters.handoffStatus);
    }
    if (filters.a2cAccountPhone) {
      clauses.push("c.a2c_account_phone = ?");
      params.push(filters.a2cAccountPhone);
    }
    if (filters.customerPhone) {
      clauses.push("c.customer_phone = ?");
      params.push(filters.customerPhone);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 50000);
    params.push(limit);

    return this.db.sqlite
      .prepare(`
        SELECT c.*, co.code AS country_code, co.name AS country_name
        FROM conversations c
        LEFT JOIN merchant_countries co ON co.id = c.country_id
        ${where}
        ORDER BY CASE WHEN COALESCE(c.pinned_at, '') != '' THEN 0 ELSE 1 END,
                 c.pinned_at DESC,
                 CASE WHEN c.unread_count > 0 THEN 0 ELSE 1 END,
                 c.updated_at DESC
        LIMIT ?
      `)
      .all(...params)
      .map((row) => mapConversation(row as Record<string, unknown>));
  }

  delete(id: string, merchantId?: string): boolean {
    const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
    const conversation = this.db.sqlite.prepare(`SELECT * FROM conversations ${where}`).get(id, ...(merchantId ? [merchantId] : [])) as Record<string, unknown> | undefined;
    if (!conversation) return false;
    const mapped = mapConversation(conversation);
    this.db.sqlite.exec("BEGIN");
    try {
      const replacementMemoryConversation = this.db.sqlite
        .prepare(`
          SELECT id
          FROM conversations
          WHERE merchant_id = ? AND country_id = ? AND customer_phone = ? AND id != ?
          ORDER BY updated_at DESC
          LIMIT 1
        `)
        .get(mapped.merchantId, mapped.countryId, mapped.customerPhone, id) as { id: string } | undefined;
      if (replacementMemoryConversation) {
        this.db.sqlite
          .prepare(`
            UPDATE customer_memories
            SET conversation_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE merchant_id = ? AND country_id = ? AND customer_key = ? AND conversation_id = ?
          `)
          .run(replacementMemoryConversation.id, mapped.merchantId, mapped.countryId, mapped.customerPhone, id);
      } else {
        this.db.sqlite
          .prepare("DELETE FROM customer_memories WHERE merchant_id = ? AND country_id = ? AND customer_key = ?")
          .run(mapped.merchantId, mapped.countryId, mapped.customerPhone);
      }
      this.db.sqlite.prepare("DELETE FROM customer_memories WHERE conversation_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM conversation_review_items WHERE conversation_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM conversation_reviews WHERE conversation_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM conversation_followups WHERE conversation_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM messages WHERE conversation_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM handoff_events WHERE conversation_id = ?").run(id);
      const result = this.db.sqlite.prepare(`DELETE FROM conversations ${where}`).run(id, ...(merchantId ? [merchantId] : []));
      this.deps.refreshCustomerAfterConversationDelete(mapped.merchantId, mapped.countryId, mapped.customerPhone);
      this.db.sqlite.exec("COMMIT");
      return result.changes > 0;
    } catch (error) {
      this.db.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  private insertMessageRow(input: MessageInput, externalId: string | null, extraRawPayload: Record<string, unknown> = { }): { lastInsertRowid: unknown } {
    return this.db.sqlite
      .prepare(`
        INSERT INTO messages
          (merchant_id, conversation_id, direction, external_id, content, msg_type, language, intent, phone_detected, telegram_detected, raw_payload)
        VALUES ((SELECT merchant_id FROM conversations WHERE id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        input.conversationId,
        input.conversationId,
        input.direction,
        externalId,
        input.content,
        input.msgType,
        input.language,
        input.intent,
        input.phoneDetected ?? "",
        input.telegramDetected ?? "",
        JSON.stringify({
          ...(typeof input.rawPayload === "object" && input.rawPayload !== null ? input.rawPayload as Record<string, unknown> : {}),
          ...extraRawPayload,
          whatsappDetected: input.whatsappDetected ?? ""
        })
      );
  }

  private learnFromConversationReply(conversationId: string, outboundMessageId: number, input: MessageInput): void {
    const reply = String(input.content || "").trim();
    if (input.direction !== "outbound" || input.msgType !== "text" || !reply || reply.length < 2) return;
    const conversation = this.get(conversationId);
    if (!conversation) return;
    const inbound = this.db.sqlite
      .prepare(`
        SELECT id, content, language, intent
        FROM messages
        WHERE conversation_id = ? AND direction = 'inbound' AND id < ?
        ORDER BY id DESC
        LIMIT 1
      `)
      .get(conversationId, outboundMessageId || Number.MAX_SAFE_INTEGER) as { id: number; content: string; language: string; intent: string } | undefined;
    const customerMessage = String(inbound?.content || "").trim();
    if (!inbound || !customerMessage || customerMessage.length < 2) return;
    const marker = `conversation_sample:${conversationId}:${inbound.id}`;
    const existing = this.db.sqlite
      .prepare("SELECT id FROM training_samples WHERE merchant_id = ? AND keywords LIKE ? LIMIT 1")
      .get(conversation.merchantId, `%${marker}%`) as { id: number } | undefined;
    const language = String(inbound.language || input.language || conversation.language || "unknown");
    const intent = String(inbound.intent || input.intent || "unknown");
    const keywords = `${marker},真实对话,自动沉淀,${conversation.a2cAccountPhone},${conversation.customerPhone}`;
    if (existing) {
      this.db.sqlite
        .prepare(`
          UPDATE training_samples
          SET standard_reply = ?, language = ?, intent = ?, stage = ?, enabled = 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND merchant_id = ?
        `)
        .run(clipText(reply, 1200), language, intent, conversation.stage, existing.id, conversation.merchantId);
      return;
    }
    this.db.sqlite
      .prepare(`
        INSERT INTO training_samples
          (merchant_id, country_id, customer_message, standard_reply, stage, intent, language, keywords, priority, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
      `)
      .run(
        conversation.merchantId,
        conversation.countryId,
        clipText(customerMessage, 1200),
        clipText(reply, 1200),
        conversation.stage,
        intent,
        language,
        keywords
      );
  }
}
