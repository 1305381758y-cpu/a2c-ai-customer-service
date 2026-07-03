import type { Db } from "./db.js";
import { mapConversationExportRecord } from "./repositoryConversationMappers.js";
import type { ConversationExportRecord } from "./repositoryTypes.js";

export interface ConversationExportFilters {
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
}

export interface ConversationExportQuery {
  where: string;
  params: Array<string | number>;
}

export function buildConversationExportQuery(filters: ConversationExportFilters = {}): ConversationExportQuery {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  addFilter(clauses, params, "c.merchant_id", filters.merchantId);
  addFilter(clauses, params, "c.country_id", filters.countryId);
  addFilter(clauses, params, "c.status", filters.status);
  addFilter(clauses, params, "c.handoff_status", filters.handoffStatus);
  addFilter(clauses, params, "c.language", filters.language);
  addFilter(clauses, params, "c.a2c_account_phone", filters.a2cAccountPhone);
  addFilter(clauses, params, "c.customer_phone", filters.customerPhone);
  addFilter(clauses, params, "m.direction", filters.direction);
  if (filters.startAt) {
    clauses.push("m.created_at >= ?");
    params.push(filters.startAt);
  }
  if (filters.endAt) {
    clauses.push("m.created_at <= ?");
    params.push(filters.endAt);
  }
  params.push(clampConversationExportLimit(filters.limit));
  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params
  };
}

export function exportConversationMessages(db: Db, filters: ConversationExportFilters = {}): ConversationExportRecord[] {
  const { where, params } = buildConversationExportQuery(filters);
  return db.sqlite
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

function addFilter(clauses: string[], params: Array<string | number>, column: string, value: string | undefined): void {
  if (!value) return;
  clauses.push(`${column} = ?`);
  params.push(value);
}

function clampConversationExportLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? 5000, 1), 50000);
}
