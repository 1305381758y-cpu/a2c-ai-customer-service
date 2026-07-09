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
  httpStatus?: number;
  requestSummary?: string;
  responseSummary?: string;
}

export interface AiCallStatsFilters {
  merchantId?: string;
  provider?: string;
  taskType?: string;
  status?: "success" | "error" | string;
  startAt?: string;
  endAt?: string;
}

export interface AiCallStats {
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  successRate: number;
  averageDurationMs: number;
  availableProviders: string[];
  availableTaskTypes: string[];
  byType: Array<{ taskType: string; totalCalls: number; successCalls: number; errorCalls: number; successRate: number; averageDurationMs: number }>;
  byProvider: Array<{ provider: string; totalCalls: number; successCalls: number; errorCalls: number; successRate: number; averageDurationMs: number }>;
  byTypeDetails: Array<{ taskType: string; provider: string; model: string; totalCalls: number; successCalls: number; errorCalls: number; successRate: number; averageDurationMs: number; lastCalledAt: string }>;
  byError: Array<{ taskType: string; provider: string; model: string; errorMessage: string; httpStatus: number | null; requestSummary: string; responseSummary: string; errorCalls: number; lastFailedAt: string }>;
}

export class AiCallRepository {
  constructor(private readonly db: Db) {}

  record(input: AiCallLogInput): void {
    this.db.sqlite
      .prepare(`
        INSERT INTO ai_call_logs
          (merchant_id, country_id, provider, model, task_type, status, duration_ms, error, http_status, request_summary, response_summary)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        input.merchantId || "",
        input.countryId || "",
        input.provider,
        input.model,
        input.taskType || "unknown",
        input.status,
        Math.max(0, Math.round(input.durationMs || 0)),
        (input.error || "").slice(0, 500),
        input.httpStatus ?? null,
        (input.requestSummary || "").slice(0, 2000),
        (input.responseSummary || "").slice(0, 1500)
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
    const byError = this.db.sqlite.prepare(`
      SELECT
        task_type,
        provider,
        model,
        COALESCE(NULLIF(error, ''), '未知错误') AS error,
        http_status,
        COALESCE(NULLIF(request_summary, ''), '') AS request_summary,
        COALESCE(NULLIF(response_summary, ''), '') AS response_summary,
        COUNT(*) AS error_calls,
        MAX(created_at) AS last_failed_at
      FROM ai_call_logs
      ${where ? `${where} AND status = 'error'` : "WHERE status = 'error'"}
      GROUP BY task_type, provider, model, error, http_status, request_summary, response_summary
      ORDER BY error_calls DESC, last_failed_at DESC
      LIMIT 50
    `).all(...params).map(mapErrorRow);
    const providerWhere = buildWhere({ ...filters, provider: undefined });
    const availableProviders = this.db.sqlite.prepare(`
      SELECT provider
      FROM ai_call_logs
      ${providerWhere.where}
      GROUP BY provider
      ORDER BY provider ASC
    `).all(...providerWhere.params).map((row) => String((row as Record<string, unknown>).provider || "unknown"));
    const taskTypeWhere = buildWhere({ ...filters, taskType: undefined });
    const availableTaskTypes = this.db.sqlite.prepare(`
      SELECT task_type
      FROM ai_call_logs
      ${taskTypeWhere.where}
      GROUP BY task_type
      ORDER BY task_type ASC
    `).all(...taskTypeWhere.params).map((row) => String((row as Record<string, unknown>).task_type || "unknown"));
    const totalCalls = Number(total?.total_calls ?? 0);
    const successCalls = Number(total?.success_calls ?? 0);
    return {
      totalCalls,
      successCalls,
      errorCalls: Number(total?.error_calls ?? 0),
      successRate: successRate(successCalls, totalCalls),
      averageDurationMs: Math.round(Number(total?.average_duration_ms ?? 0)),
      availableProviders,
      availableTaskTypes,
      byType,
      byProvider,
      byTypeDetails,
      byError
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
  if (filters.taskType) {
    clauses.push("task_type = ?");
    params.push(filters.taskType);
  }
  if (filters.status === "success" || filters.status === "error") {
    clauses.push("status = ?");
    params.push(filters.status);
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
  const totalCalls = Number(row.total_calls ?? 0);
  const successCalls = Number(row.success_calls ?? 0);
  return {
    taskType: String(row.task_type || "unknown"),
    totalCalls,
    successCalls,
    errorCalls: Number(row.error_calls ?? 0),
    successRate: successRate(successCalls, totalCalls),
    averageDurationMs: Math.round(Number(row.average_duration_ms ?? 0))
  };
}

function mapProviderRow(row: Record<string, unknown>) {
  const totalCalls = Number(row.total_calls ?? 0);
  const successCalls = Number(row.success_calls ?? 0);
  return {
    provider: String(row.provider || "unknown"),
    totalCalls,
    successCalls,
    errorCalls: Number(row.error_calls ?? 0),
    successRate: successRate(successCalls, totalCalls),
    averageDurationMs: Math.round(Number(row.average_duration_ms ?? 0))
  };
}

function mapDetailRow(row: Record<string, unknown>) {
  const totalCalls = Number(row.total_calls ?? 0);
  const successCalls = Number(row.success_calls ?? 0);
  return {
    taskType: String(row.task_type || "unknown"),
    provider: String(row.provider || "unknown"),
    model: String(row.model || "unknown"),
    totalCalls,
    successCalls,
    errorCalls: Number(row.error_calls ?? 0),
    successRate: successRate(successCalls, totalCalls),
    averageDurationMs: Math.round(Number(row.average_duration_ms ?? 0)),
    lastCalledAt: String(row.last_called_at || "")
  };
}

function mapErrorRow(row: Record<string, unknown>) {
  return {
    taskType: String(row.task_type || "unknown"),
    provider: String(row.provider || "unknown"),
    model: String(row.model || "unknown"),
    errorMessage: String(row.error || "未知错误"),
    httpStatus: row.http_status === null || row.http_status === undefined ? null : Number(row.http_status),
    requestSummary: String(row.request_summary || ""),
    responseSummary: String(row.response_summary || ""),
    errorCalls: Number(row.error_calls ?? 0),
    lastFailedAt: String(row.last_failed_at || "")
  };
}

function successRate(successCalls: number, totalCalls: number): number {
  if (!totalCalls) return 0;
  return Math.round((successCalls / totalCalls) * 1000) / 10;
}
