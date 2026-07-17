import { randomUUID } from "node:crypto";
import type { Db } from "./db.js";
import {
  exportConversationMessages,
  type ConversationExportFilters
} from "./repositoryConversationExports.js";
import {
  getCustomerMemory,
  patchCustomerMemory,
  updateCustomerMemoryFromMessage,
  type CustomerMemoryMessageInput
} from "./repositoryCustomerMemory.js";
import {
  listConversations,
  type ConversationListFilters
} from "./repositoryConversationLists.js";
import {
  markAllConversationsRead,
  unreadConversationSummary,
  type MarkAllReadFilters
} from "./repositoryConversationUnread.js";
import {
  mapConversation,
  mapConversationMessage,
} from "./repositoryConversationMappers.js";
import { learnFromConversationReply } from "./repositoryConversationLearning.js";
import type {
  Conversation,
  ConversationExportRecord,
  ConversationMessageRecord,
  ConversationScriptStateRecord,
  CustomerMemoryRecord,
  MessageInput,
  UnreadSummaryRecord
} from "./repositoryTypes.js";

export interface ConversationRepositoryDeps {
  refreshCustomerAfterConversationDelete(merchantId: string, countryId: string, customerKey: string): void;
  chargeSession(merchantId: string, customerKey: string): { status: "free" | "charged" | "insufficient"; amount: number };
}

export class ConversationRepository {
  constructor(
    private readonly db: Db,
    private readonly deps: ConversationRepositoryDeps
  ) {}

  getOrCreate(customerPhone: string, a2cAccountPhone: string, nickname = "", merchantId = "default", countryId: string, chargeSession = true): Conversation {
    this.db.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.db.sqlite
        .prepare("SELECT * FROM conversations WHERE merchant_id = ? AND customer_phone = ? AND a2c_account_phone = ?")
        .get(merchantId, customerPhone, a2cAccountPhone) as Record<string, unknown> | undefined;
      if (existing) {
        const mapped = mapConversation(existing);
        if (!mapped.countryId || mapped.countryId === `${mapped.merchantId}:default` && countryId !== mapped.countryId) {
          this.db.sqlite.prepare("UPDATE conversations SET country_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(countryId, mapped.id);
          const updated = this.get(mapped.id);
          if (!updated) throw new Error("会话更新后无法读取");
          this.db.sqlite.exec("COMMIT");
          return updated;
        }
        this.db.sqlite.exec("COMMIT");
        return mapped;
      }

      const id = randomUUID();
      const charge = chargeSession ? this.deps.chargeSession(merchantId, customerPhone) : { status: "free" as const, amount: 0 };
      this.db.sqlite.prepare(`
        INSERT INTO conversations (id, merchant_id, country_id, customer_phone, a2c_account_phone, nickname, billing_status, session_charge_amount, session_charged_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'charged' THEN CURRENT_TIMESTAMP ELSE '' END)
      `).run(id, merchantId, countryId, customerPhone, a2cAccountPhone, nickname, charge.status, charge.amount, charge.status);
      const created = this.get(id);
      if (!created) throw new Error("会话创建后无法读取");
      this.db.sqlite.exec("COMMIT");
      return created;
    } catch (error) {
      this.db.sqlite.exec("ROLLBACK");
      throw error;
    }
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
            assigned_teacher_tg_link_id = ?, assigned_teacher_tg_link_url = ?,
            status = ?, handoff_status = ?, handoff_notified = ?, awaiting_customer_question = ?, flow_hold_reason = ?, updated_at = CURRENT_TIMESTAMP
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
        conversation.assignedTeacherTgLinkId ?? null,
        conversation.assignedTeacherTgLinkUrl ?? "",
        conversation.status,
        conversation.handoffStatus,
        conversation.handoffNotified,
        conversation.awaitingCustomerQuestion ? 1 : 0,
        conversation.flowHoldReason ?? "",
        conversation.id
      );
    this.syncScriptState(conversation);
  }

  getScriptState(conversationId: string, merchantId?: string): ConversationScriptStateRecord | undefined {
    const where = merchantId ? "WHERE conversation_id = ? AND merchant_id = ?" : "WHERE conversation_id = ?";
    const row = this.db.sqlite.prepare(`SELECT * FROM conversation_script_state ${where}`).get(conversationId, ...(merchantId ? [merchantId] : [])) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    let collected: Record<string, unknown> = {};
    try { collected = JSON.parse(String(row.collected_json || "{}")) as Record<string, unknown>; } catch { collected = {}; }
    return {
      id: Number(row.id),
      merchantId: String(row.merchant_id || ""),
      conversationId: String(row.conversation_id || conversationId),
      flowId: row.flow_id == null ? undefined : Number(row.flow_id),
      flowVersion: Number(row.flow_version || 1),
      currentStepId: row.current_step_id == null ? undefined : Number(row.current_step_id),
      currentFlowStep: String(row.current_flow_step || ""),
      collected,
      updatedAt: String(row.updated_at || "")
    };
  }

  private syncScriptState(conversation: Conversation): void {
    const active = this.db.sqlite.prepare(`
      SELECT sf.id, sf.version
      FROM script_flows sf
      WHERE sf.merchant_id = ? AND sf.country_id = ? AND sf.active = 1 AND sf.status = 'active'
      ORDER BY sf.updated_at DESC, sf.id DESC LIMIT 1
    `).get(conversation.merchantId, conversation.countryId) as { id: number; version: number } | undefined;
    if (!active) return;
    const existing = this.getScriptState(conversation.id, conversation.merchantId);
    const flowId = existing?.flowId || active.id;
    const flowVersion = existing?.flowId ? existing.flowVersion : Number(active.version || 1);
    const step = this.db.sqlite.prepare("SELECT id FROM script_flow_steps WHERE flow_id = ? AND flow_step = ? ORDER BY id LIMIT 1").get(flowId, conversation.flowStep) as { id: number } | undefined;
    this.db.sqlite.prepare(`
      INSERT INTO conversation_script_state (merchant_id, conversation_id, flow_id, flow_version, current_step_id, current_flow_step, collected_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, '{}', CURRENT_TIMESTAMP)
      ON CONFLICT(conversation_id) DO UPDATE SET
        current_step_id = excluded.current_step_id,
        current_flow_step = excluded.current_flow_step,
        updated_at = CURRENT_TIMESTAMP
    `).run(conversation.merchantId, conversation.id, flowId, flowVersion, step?.id ?? null, conversation.flowStep);
  }

  insertMessage(input: MessageInput): { inserted: boolean; id?: number } {
    try {
      const result = this.insertMessageRow(input, input.externalId ?? null);
      if (input.direction === "inbound") {
        this.db.sqlite.prepare("UPDATE conversations SET unread_count = unread_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(input.conversationId);
      } else {
        learnFromConversationReply(this.db, { getConversation: (id) => this.get(id) }, input.conversationId, Number(result.lastInsertRowid ?? 0), input);
      }
      return { inserted: true, id: Number(result.lastInsertRowid ?? 0) || undefined };
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE")) {
        if (input.direction === "outbound") {
          const result = this.insertMessageRow(input, `local_outbound:${input.conversationId}:${Date.now()}:${Math.random().toString(36).slice(2)}`, {
            externalIdConflict: input.externalId ?? ""
          });
          learnFromConversationReply(this.db, { getConversation: (id) => this.get(id) }, input.conversationId, Number(result.lastInsertRowid ?? 0), input);
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

  markAllRead(merchantId: string, filters: MarkAllReadFilters = {}): { updated: number } {
    return markAllConversationsRead(this.db, merchantId, filters);
  }

  pin(conversationId: string, merchantId: string, pinned: boolean): Conversation | undefined {
    this.db.sqlite
      .prepare("UPDATE conversations SET pinned_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND merchant_id = ?")
      .run(pinned ? new Date().toISOString() : "", conversationId, merchantId);
    return this.get(conversationId);
  }

  unreadSummary(merchantId: string): UnreadSummaryRecord[] {
    return unreadConversationSummary(this.db, merchantId);
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

  exportMessages(filters: ConversationExportFilters = {}): ConversationExportRecord[] {
    return exportConversationMessages(this.db, filters);
  }

  getCustomerMemoryByConversation(conversationId: string): CustomerMemoryRecord | undefined {
    const conversation = this.get(conversationId);
    if (!conversation) return undefined;
    return this.getCustomerMemory(conversation.merchantId, conversation.countryId, conversation.customerPhone);
  }

  getCustomerMemory(merchantId: string, countryId: string, customerKey: string): CustomerMemoryRecord | undefined {
    return getCustomerMemory(this.db, merchantId, countryId, customerKey);
  }

  updateCustomerMemoryFromMessage(conversation: Conversation, input: CustomerMemoryMessageInput): CustomerMemoryRecord {
    return updateCustomerMemoryFromMessage(this.db, conversation, input);
  }

  patchCustomerMemory(conversationId: string, merchantId: string | undefined, patch: Record<string, unknown>): CustomerMemoryRecord | undefined {
    const conversation = this.get(conversationId);
    if (!conversation || (merchantId && conversation.merchantId !== merchantId)) return undefined;
    return patchCustomerMemory(this.db, conversation, patch);
  }

  list(filters: ConversationListFilters = {}): Conversation[] {
    return listConversations(this.db, filters);
  }

  count(filters: {
    merchantId?: string;
    countryId?: string;
    status?: string;
    language?: string;
    handoffStatus?: string;
    a2cAccountPhone?: string;
    customerPhone?: string;
    startAt?: string;
    endAt?: string;
  } = {}): number {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    addFilter(clauses, params, "merchant_id", filters.merchantId);
    addFilter(clauses, params, "country_id", filters.countryId);
    addFilter(clauses, params, "status", filters.status);
    addFilter(clauses, params, "language", filters.language);
    addFilter(clauses, params, "handoff_status", filters.handoffStatus);
    addFilter(clauses, params, "a2c_account_phone", filters.a2cAccountPhone);
    addFilter(clauses, params, "customer_phone", filters.customerPhone);
    addRangeFilter(clauses, params, "created_at", filters.startAt, filters.endAt);
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const row = this.db.sqlite.prepare(`SELECT COUNT(*) AS count FROM conversations ${where}`).get(...params) as { count: number } | undefined;
    return Number(row?.count ?? 0);
  }

  countByCustomerHistory(filters: { merchantId?: string; startAt?: string; endAt?: string; repeat: boolean }): number {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    addFilter(clauses, params, "c.merchant_id", filters.merchantId);
    addRangeFilter(clauses, params, "c.created_at", filters.startAt, filters.endAt);
    clauses.push(`${filters.repeat ? "EXISTS" : "NOT EXISTS"} (
      SELECT 1
      FROM conversations previous
      WHERE previous.merchant_id = c.merchant_id
        AND previous.customer_phone = c.customer_phone
        AND (
          previous.created_at < c.created_at
          OR (previous.created_at = c.created_at AND previous.id < c.id)
        )
      LIMIT 1
    )`);
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const row = this.db.sqlite.prepare(`SELECT COUNT(*) AS count FROM conversations c ${where}`).get(...params) as { count: number } | undefined;
    return Number(row?.count ?? 0);
  }

  countMessages(filters: { merchantId?: string; direction?: "inbound" | "outbound"; startAt?: string; endAt?: string } = {}): number {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    addFilter(clauses, params, "merchant_id", filters.merchantId);
    addFilter(clauses, params, "direction", filters.direction);
    addRangeFilter(clauses, params, "created_at", filters.startAt, filters.endAt);
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const row = this.db.sqlite.prepare(`SELECT COUNT(*) AS count FROM messages ${where}`).get(...params) as { count: number } | undefined;
    return Number(row?.count ?? 0);
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
      this.db.sqlite.prepare("DELETE FROM conversation_script_state WHERE conversation_id = ?").run(id);
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

}

function addFilter(clauses: string[], params: Array<string | number>, column: string, value: string | undefined): void {
  if (!value) return;
  clauses.push(`${column} = ?`);
  params.push(value);
}

function addRangeFilter(clauses: string[], params: Array<string | number>, column: string, startAt: string | undefined, endAt: string | undefined): void {
  if (startAt) {
    clauses.push(`${column} >= ?`);
    params.push(startAt);
  }
  if (endAt) {
    clauses.push(`${column} < ?`);
    params.push(endAt);
  }
}
