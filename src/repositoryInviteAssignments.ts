import type { Db } from "./db.js";

export function releaseInviteAssignments(db: Db, merchantId: string, options: { conversationIds?: string[]; customerKey?: string } = {}): void {
  const conversationIds = options.conversationIds ?? [];
  const clauses = ["merchant_id = ?"];
  const params: Array<string> = [merchantId];
  if (conversationIds.length) {
    clauses.push(`conversation_id IN (${conversationIds.map(() => "?").join(",")})`);
    params.push(...conversationIds);
  } else if (options.customerKey) {
    clauses.push("customer_key = ?");
    params.push(options.customerKey);
  } else {
    return;
  }
  const rows = db.sqlite.prepare(`SELECT * FROM a2c_invite_assignments WHERE ${clauses.join(" AND ")}`).all(...params) as Array<Record<string, unknown>>;
  for (const row of rows) {
    if (String(row.status) !== "reserved") continue;
    const source = String(row.invite_source) === "group" ? "group" : "account";
    const table = source === "group" ? "a2c_group_invite_codes" : "a2c_invite_codes";
    db.sqlite.prepare(`
      UPDATE ${table}
      SET status = CASE WHEN reusable = 0 AND status = 'reserved' THEN 'available' ELSE status END,
          usage_count = CASE WHEN usage_count > 0 THEN usage_count - 1 ELSE 0 END,
          ${source === "account" ? "assigned_customer_key = CASE WHEN reusable = 0 THEN '' ELSE assigned_customer_key END, assigned_conversation_id = CASE WHEN reusable = 0 THEN '' ELSE assigned_conversation_id END, assigned_at = CASE WHEN reusable = 0 THEN '' ELSE assigned_at END," : ""}
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND merchant_id = ?
    `).run(Number(row.invite_code_id), merchantId);
  }
  db.sqlite.prepare(`DELETE FROM a2c_invite_assignments WHERE ${clauses.join(" AND ")}`).run(...params);
}
