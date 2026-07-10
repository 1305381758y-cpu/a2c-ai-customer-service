import type { Db } from "./db.js";
import { mapConversation } from "./repositoryConversationMappers.js";
import type { Conversation } from "./repositoryTypes.js";

export interface ConversationListFilters {
  merchantId?: string;
  countryId?: string;
  status?: string;
  language?: string;
  handoffStatus?: string;
  a2cAccountPhone?: string;
  customerPhone?: string;
  startAt?: string;
  endAt?: string;
  limit?: number;
  offset?: number;
}

export interface ConversationListQuery {
  where: string;
  params: Array<string | number>;
}

export function buildConversationListQuery(filters: ConversationListFilters = {}): ConversationListQuery {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  addFilter(clauses, params, "c.merchant_id", filters.merchantId);
  addFilter(clauses, params, "c.country_id", filters.countryId);
  addFilter(clauses, params, "c.status", filters.status);
  addFilter(clauses, params, "c.language", filters.language);
  addFilter(clauses, params, "c.handoff_status", filters.handoffStatus);
  addFilter(clauses, params, "c.a2c_account_phone", filters.a2cAccountPhone);
  addFilter(clauses, params, "c.customer_phone", filters.customerPhone);
  addRangeFilter(clauses, params, "c.created_at", filters.startAt, filters.endAt);
  params.push(clampConversationListLimit(filters.limit), Math.max(filters.offset ?? 0, 0));
  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params
  };
}

export function listConversations(db: Db, filters: ConversationListFilters = {}): Conversation[] {
  const { where, params } = buildConversationListQuery(filters);
  return db.sqlite
    .prepare(`
      SELECT c.*, co.code AS country_code, co.name AS country_name
      FROM conversations c
      LEFT JOIN merchant_countries co ON co.id = c.country_id
      ${where}
      ORDER BY CASE WHEN COALESCE(c.pinned_at, '') != '' THEN 0 ELSE 1 END,
               c.pinned_at DESC,
               CASE WHEN c.unread_count > 0 THEN 0 ELSE 1 END,
               c.updated_at DESC
      LIMIT ? OFFSET ?
    `)
    .all(...params)
    .map((row) => mapConversation(row as Record<string, unknown>));
}

function addFilter(clauses: string[], params: Array<string | number>, column: string, value: string | undefined): void {
  if (!value) return;
  clauses.push(`${column} = ?`);
  params.push(value);
}

function addRangeFilter(
  clauses: string[],
  params: Array<string | number>,
  column: string,
  startAt: string | undefined,
  endAt: string | undefined
): void {
  if (startAt) {
    clauses.push(`${column} >= ?`);
    params.push(startAt);
  }
  if (endAt) {
    clauses.push(`${column} <= ?`);
    params.push(endAt);
  }
}

function clampConversationListLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? 100, 1), 50000);
}
