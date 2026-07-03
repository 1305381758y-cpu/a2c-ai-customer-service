import type { Db } from "./db.js";
import type { UnreadSummaryRecord } from "./repositoryTypes.js";

export interface MarkAllReadFilters {
  a2cAccountPhone?: string;
}

export interface MarkAllReadQuery {
  where: string;
  params: Array<string | number>;
}

export function buildMarkAllReadQuery(merchantId: string, filters: MarkAllReadFilters = {}): MarkAllReadQuery {
  const clauses = ["merchant_id = ?", "unread_count > 0"];
  const params: Array<string | number> = [merchantId];
  if (filters.a2cAccountPhone) {
    clauses.push("a2c_account_phone = ?");
    params.push(filters.a2cAccountPhone);
  }
  return {
    where: clauses.join(" AND "),
    params
  };
}

export function markAllConversationsRead(db: Db, merchantId: string, filters: MarkAllReadFilters = {}): { updated: number } {
  const { where, params } = buildMarkAllReadQuery(merchantId, filters);
  const result = db.sqlite
    .prepare(`UPDATE conversations SET unread_count = 0, updated_at = CURRENT_TIMESTAMP WHERE ${where}`)
    .run(...params);
  return { updated: Number(result.changes ?? 0) };
}

export function unreadConversationSummary(db: Db, merchantId: string): UnreadSummaryRecord[] {
  const rows = db.sqlite.prepare(`
    SELECT a2c_account_phone, id AS conversation_id, customer_phone, unread_count
    FROM conversations
    WHERE merchant_id = ? AND unread_count > 0
    ORDER BY updated_at DESC
  `).all(merchantId) as Array<{ a2c_account_phone: string; conversation_id: string; customer_phone: string; unread_count: number }>;
  return groupUnreadSummaryRows(rows);
}

export function groupUnreadSummaryRows(rows: Array<{ a2c_account_phone: string; conversation_id: string; customer_phone: string; unread_count: number }>): UnreadSummaryRecord[] {
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
