import type { Db } from "./db.js";

export interface CustomerDeleteResult {
  deleted: boolean;
  conversationsDeleted: number;
  messagesDeleted: number;
}

export function deleteCustomerRecord(
  db: Db,
  input: { merchantId: string; customerKey: string; exists: boolean }
): CustomerDeleteResult {
  const { merchantId, customerKey } = input;
  if (!input.exists) return { deleted: false, conversationsDeleted: 0, messagesDeleted: 0 };

  const conversations = listCustomerConversationIds(db, merchantId, customerKey);
  db.sqlite.exec("BEGIN");
  try {
    const messagesDeleted = conversations.length ? deleteCustomerConversationData(db, merchantId, customerKey, conversations) : 0;
    if (!conversations.length) releaseCustomerInviteCodes(db, merchantId, customerKey);
    db.sqlite.prepare("DELETE FROM customer_memories WHERE merchant_id = ? AND customer_key = ?").run(merchantId, customerKey);
    const deleted = db.sqlite.prepare("DELETE FROM customers WHERE merchant_id = ? AND customer_key = ?").run(merchantId, customerKey);
    db.sqlite.exec("COMMIT");
    return { deleted: deleted.changes > 0, conversationsDeleted: conversations.length, messagesDeleted };
  } catch (error) {
    db.sqlite.exec("ROLLBACK");
    throw error;
  }
}

function listCustomerConversationIds(db: Db, merchantId: string, customerKey: string): string[] {
  return db.sqlite
    .prepare("SELECT id FROM conversations WHERE merchant_id = ? AND customer_phone = ?")
    .all(merchantId, customerKey)
    .map((row) => String((row as { id: string }).id));
}

function deleteCustomerConversationData(db: Db, merchantId: string, customerKey: string, conversationIds: string[]): number {
  const placeholders = conversationIds.map(() => "?").join(",");
  const conversationSampleMarkers = conversationIds.map((id) => `conversation_sample:${id}:%`);
  const messagesDeleted = Number(db.sqlite.prepare(`DELETE FROM messages WHERE conversation_id IN (${placeholders})`).run(...conversationIds).changes ?? 0);
  db.sqlite.prepare(`DELETE FROM intent_learning_events WHERE conversation_id IN (${placeholders})`).run(...conversationIds);
  db.sqlite.prepare(`DELETE FROM conversation_review_items WHERE conversation_id IN (${placeholders})`).run(...conversationIds);
  db.sqlite.prepare(`DELETE FROM conversation_reviews WHERE conversation_id IN (${placeholders})`).run(...conversationIds);
  db.sqlite.prepare(`DELETE FROM conversation_followups WHERE conversation_id IN (${placeholders})`).run(...conversationIds);
  db.sqlite.prepare(`DELETE FROM handoff_events WHERE conversation_id IN (${placeholders})`).run(...conversationIds);
  db.sqlite.prepare(`DELETE FROM customer_memories WHERE conversation_id IN (${placeholders})`).run(...conversationIds);
  db.sqlite.prepare(`DELETE FROM conversations WHERE id IN (${placeholders})`).run(...conversationIds);
  db.sqlite
    .prepare(`DELETE FROM training_samples WHERE merchant_id = ? AND (${conversationSampleMarkers.map(() => "keywords LIKE ?").join(" OR ")})`)
    .run(merchantId, ...conversationSampleMarkers);
  releaseCustomerInviteCodes(db, merchantId, customerKey, conversationIds, placeholders);
  return messagesDeleted;
}

function releaseCustomerInviteCodes(db: Db, merchantId: string, customerKey: string, conversationIds: string[] = [], placeholders = ""): void {
  const baseSet = `
    SET status = CASE WHEN status = 'reserved' THEN 'available' ELSE status END,
        assigned_customer_key = '',
        assigned_conversation_id = '',
        platform_account = '',
        assigned_at = CASE WHEN status = 'reserved' THEN '' ELSE assigned_at END,
        updated_at = CURRENT_TIMESTAMP
  `;
  if (!conversationIds.length) {
    db.sqlite.prepare(`UPDATE a2c_invite_codes ${baseSet} WHERE merchant_id = ? AND assigned_customer_key = ?`).run(merchantId, customerKey);
    return;
  }
  db.sqlite
    .prepare(`UPDATE a2c_invite_codes ${baseSet} WHERE merchant_id = ? AND (assigned_customer_key = ? OR assigned_conversation_id IN (${placeholders}))`)
    .run(merchantId, customerKey, ...conversationIds);
}
