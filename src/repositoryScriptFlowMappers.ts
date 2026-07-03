import { normalizeScriptFlowStatus } from "./repositoryStatuses.js";
import type { ScriptFlowRecord, ScriptFlowStepRecord, ScriptFlowVersionRecord } from "./repositoryTypes.js";

export function mapScriptFlow(row: Record<string, unknown>): ScriptFlowRecord {
  const merchantId = String(row.merchant_id ?? "default");
  return {
    id: Number(row.id),
    merchantId,
    countryId: String(row.country_id ?? `${merchantId}:default`),
    countryCode: String(row.country_code ?? "default"),
    countryName: String(row.country_name ?? "默认国家"),
    name: String(row.name ?? ""),
    status: normalizeScriptFlowStatus(row.status),
    active: Boolean(Number(row.active ?? 0)),
    version: Number(row.version ?? 1),
    sourceFilename: String(row.source_filename ?? ""),
    stepCount: Number(row.step_count ?? 0),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

export function mapScriptFlowStep(row: Record<string, unknown>): ScriptFlowStepRecord {
  const merchantId = String(row.merchant_id ?? "default");
  return {
    id: Number(row.id),
    flowId: Number(row.flow_id),
    merchantId,
    countryId: String(row.country_id ?? `${merchantId}:default`),
    flowCode: String(row.flow_code ?? ""),
    flowName: String(row.flow_name ?? ""),
    flowStep: String(row.flow_step ?? ""),
    goal: String(row.goal ?? ""),
    triggerCondition: String(row.trigger_condition ?? ""),
    customerExpressions: String(row.customer_expressions ?? ""),
    standardReply: String(row.standard_reply ?? ""),
    collectInfo: String(row.collect_info ?? ""),
    sendLink: Boolean(Number(row.send_link ?? 0)),
    sendInvite: Boolean(Number(row.send_invite ?? 0)),
    nextCondition: String(row.next_condition ?? ""),
    nextFlowCode: String(row.next_flow_code ?? ""),
    nextFlowStep: String(row.next_flow_step ?? ""),
    forbidden: String(row.forbidden ?? ""),
    notes: String(row.notes ?? ""),
    sortOrder: Number(row.sort_order ?? 0),
    enabled: Boolean(Number(row.enabled ?? 1)),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

export function mapScriptFlowVersion(row: Record<string, unknown>): ScriptFlowVersionRecord {
  return {
    id: Number(row.id),
    flowId: Number(row.flow_id),
    merchantId: String(row.merchant_id ?? "default"),
    version: Number(row.version ?? 1),
    note: String(row.note ?? ""),
    createdBy: String(row.created_by ?? ""),
    createdAt: String(row.created_at ?? "")
  };
}
