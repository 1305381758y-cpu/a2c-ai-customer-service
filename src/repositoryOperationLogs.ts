import type { Db } from "./db.js";
import type { OperationLogRecord } from "./repositoryTypes.js";

export class OperationLogRepository {
  constructor(private readonly db: Db) {}

  record(input: Omit<OperationLogRecord, "id" | "createdAt">): void {
    this.db.sqlite.prepare(`
      INSERT INTO operation_logs
        (merchant_id, actor_user_id, actor_name, actor_role, action, resource_type, target_id, route, method, status, http_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(input.merchantId, input.actorUserId, input.actorName, input.actorRole, input.action, input.resourceType, input.targetId, input.route, input.method, input.status, input.httpStatus);
  }

  list(filters: { merchantId?: string; action?: string; resourceType?: string; status?: string; q?: string; startAt?: string; endAt?: string; limit?: number; offset?: number }): { rows: OperationLogRecord[]; total: number } {
    const where: string[] = [];
    const values: Array<string | number> = [];
    if (filters.merchantId) { where.push("merchant_id = ?"); values.push(filters.merchantId); }
    if (filters.action) { where.push("action = ?"); values.push(filters.action); }
    if (filters.resourceType) { where.push("resource_type = ?"); values.push(filters.resourceType); }
    if (filters.status) { where.push("status = ?"); values.push(filters.status); }
    if (filters.startAt) { where.push("created_at >= ?"); values.push(filters.startAt); }
    if (filters.endAt) { where.push("created_at < ?"); values.push(filters.endAt); }
    if (filters.q) {
      where.push("(actor_name LIKE ? OR target_id LIKE ? OR route LIKE ?)");
      const term = `%${filters.q}%`;
      values.push(term, term, term);
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = Number((this.db.sqlite.prepare(`SELECT COUNT(*) AS total FROM operation_logs ${clause}`).get(...values) as { total: number }).total);
    const limit = Math.max(1, Math.min(Number(filters.limit || 20), 100));
    const offset = Math.max(0, Number(filters.offset || 0));
    const rows = this.db.sqlite.prepare(`SELECT * FROM operation_logs ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...values, limit, offset) as Array<Record<string, unknown>>;
    return { rows: rows.map(mapOperationLog), total };
  }
}

function mapOperationLog(row: Record<string, unknown>): OperationLogRecord {
  return {
    id: Number(row.id),
    merchantId: String(row.merchant_id || ""),
    actorUserId: String(row.actor_user_id || ""),
    actorName: String(row.actor_name || ""),
    actorRole: String(row.actor_role || ""),
    action: String(row.action || ""),
    resourceType: String(row.resource_type || ""),
    targetId: String(row.target_id || ""),
    route: String(row.route || ""),
    method: String(row.method || ""),
    status: String(row.status) === "success" ? "success" : "error",
    httpStatus: Number(row.http_status || 0),
    createdAt: String(row.created_at || "")
  };
}
