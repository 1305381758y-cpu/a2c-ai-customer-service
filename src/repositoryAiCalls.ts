import type { Db } from "./db.js";

export interface AiCallLogInput {
  merchantId?: string;
  countryId?: string;
  provider: string;
  model: string;
  taskType: string;
  status: "success" | "error";
  durationMs: number;
  error?: string;
}

export interface AiCallStatsFilters {
  merchantId?: string;
  provider?: string;
  startAt?: string;
  endAt?: string;
}

export interface AiCallStats {
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  averageDurationMs: number;
  availableProviders: string[];
  byType: Array<{ taskType: string; totalCalls: number; successCalls: number; errorCalls: number; averageDurationMs: number }>;
  byProvider: Array<{ provider: string; totalCalls: number; successCalls: number; errorCalls: number; averageDurationMs: number }>;
  byTypeDetails: Array<{ taskType: string; provider: string; model: string; totalCalls: number; successCalls: number; errorCalls: number; averageDurationMs: number; lastCalledAt: string }>;
}

export class AiCallRepository {
  constructor(private readonly db: Db) {}

  record(input: AiCallLogInput): void {
    this.db.sqlite
      .prepare(`
        INSERT INTO ai_call_logs
          (merchant_id, country_id, provider, model, task_type, status, duration_ms, error)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        input.merchantId || "",
        input.countryId || "",
        input.provider,
        input.model,
        input.taskType || "unknown",
        input.status,
        Math.max(0, Math.round(input.durationMs || 0)),
        (input.error || "").slice(0, 500)
      );
  }

  stats(filters: AiCallStatsFilters = {}): AiCallStats {
    const { where, params } = buildWhere(filters);
    const total = this.db.sqlite.prepare(`
      SELECT
        COUNT(*) AS total_calls,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_calls,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_calls,
        AVG(duration_ms) AS average_duration_ms
      FROM ai_call_logs
      ${where}
    `).get(...params) as Record<string, unknown> | undefined;
    const byType = this.db.sqlite.prepare(`
      SELECT
        task_type,
        COUNT(*) AS total_calls,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_calls,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_calls,
        AVG(duration_ms) AS average_duration_ms
      FROM ai_call_logs
      ${where}
      GROUP BY task_type
      ORDER BY total_calls DESC, task_type ASC
    `).all(...params).map(mapTaskRow);
    const byProvider = this.db.sqlite.prepare(`
      SELECT
        provider,
        COUNT(*) AS total_calls,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_calls,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_calls,
        AVG(duration_ms) AS average_duration_ms
      FROM ai_call_logs
      ${where}
      GROUP BY provider
      ORDER BY total_calls DESC, provider ASC
    `).all(...params).map(mapProviderRow);
    const byTypeDetails = this.db.sqlite.prepare(`
      SELECT
        task_type,
        provider,
        model,
        COUNT(*) AS total_calls,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_calls,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_calls,
        AVG(duration_ms) AS average_duration_ms,
        MAX(created_at) AS last_called_at
      FROM ai_call_logs
      ${where}
      GROUP BY task_type, provider, model
      ORDER BY task_type ASC, total_calls DESC, provider ASC, model ASC
    `).all(...params).map(mapDetailRow);
    const providerWhere = buildWhere({ ...filters, provider: undefined });
    const availableProviders = this.db.sqlite.prepare(`
      SELECT provider
      FROM ai_call_logs
      ${providerWhere.where}
      GROUP BY provider
      ORDER BY provider ASC
    `).all(...providerWhere.params).map((row) => String((row as Record<string, unknown>).provider || "unknown"));
    return {
      totalCalls: Number(total?.total_calls ?? 0),
      successCalls: Number(total?.success_calls ?? 0),
      errorCalls: Number(total?.error_calls ?? 0),
      averageDurationMs: Math.round(Number(total?.average_duration_ms ?? 0)),
      availableProviders,
      byType,
      byProvider,
      byTypeDetails
    };
  }
}

function buildWhere(filters: AiCallStatsFilters): { where: string; params: Array<string | number> } {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (filters.merchantId) {
    clauses.push("merchant_id = ?");
    params.push(filters.merchantId);
  }
  if (filters.provider) {
    clauses.push("provider = ?");
    params.push(filters.provider);
  }
  if (filters.startAt) {
    clauses.push("created_at >= ?");
    params.push(filters.startAt);
  }
  if (filters.endAt) {
    clauses.push("created_at < ?");
    params.push(filters.endAt);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

function mapTaskRow(row: Record<string, unknown>) {
  return {
    taskType: String(row.task_type || "unknown"),
    totalCalls: Number(row.total_calls ?? 0),
    successCalls: Number(row.success_calls ?? 0),
    errorCalls: Number(row.error_calls ?? 0),
    averageDurationMs: Math.round(Number(row.average_duration_ms ?? 0))
  };
}

function mapProviderRow(row: Record<string, unknown>) {
  return {
    provider: String(row.provider || "unknown"),
    totalCalls: Number(row.total_calls ?? 0),
    successCalls: Number(row.success_calls ?? 0),
    errorCalls: Number(row.error_calls ?? 0),
    averageDurationMs: Math.round(Number(row.average_duration_ms ?? 0))
  };
}

function mapDetailRow(row: Record<string, unknown>) {
  return {
    taskType: String(row.task_type || "unknown"),
    provider: String(row.provider || "unknown"),
    model: String(row.model || "unknown"),
    totalCalls: Number(row.total_calls ?? 0),
    successCalls: Number(row.success_calls ?? 0),
    errorCalls: Number(row.error_calls ?? 0),
    averageDurationMs: Math.round(Number(row.average_duration_ms ?? 0)),
    lastCalledAt: String(row.last_called_at || "")
  };
}
