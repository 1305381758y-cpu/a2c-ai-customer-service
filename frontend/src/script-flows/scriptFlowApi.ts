import { api, loadRows, withQuery } from "../app/api.js";
import type { Filters, ScriptFlow, ScriptFlowStep, ScriptFlowVersion } from "../types.js";

export type ScriptFlowDetailResponse = {
  flow: ScriptFlow;
  steps: ScriptFlowStep[];
  versions: ScriptFlowVersion[];
};

export type ScriptFlowImportInput = {
  base: string;
  file: File;
  flowName?: string;
  countryId?: string;
  merchantId?: string;
};

export function scriptFlowBase(platform: boolean): string {
  return platform ? "/api/admin/script-flows" : "/api/merchant/script-flows";
}

export function scriptFlowStepBase(platform: boolean): string {
  return platform ? "/api/admin/script-flow-steps" : "/api/merchant/script-flow-steps";
}

export function scriptFlowRowsUrl(platform: boolean, filters: Filters): string {
  return withQuery(scriptFlowBase(platform), platform ? filters : {
    countryId: filters.countryId,
    status: filters.status
  });
}

export async function loadScriptFlows(url: string): Promise<ScriptFlow[]> {
  return await loadRows<ScriptFlow>(url);
}

export async function loadScriptFlowDetail(base: string, flowId: number): Promise<ScriptFlowDetailResponse> {
  return await api<ScriptFlowDetailResponse>(`${base}/${flowId}`);
}

export async function importScriptFlow(input: ScriptFlowImportInput): Promise<{ flow: ScriptFlow; imported: number }> {
  const body = new FormData();
  body.append("file", input.file);
  const params = new URLSearchParams();
  if (input.flowName?.trim()) params.set("name", input.flowName.trim());
  if (input.countryId) params.set("countryId", input.countryId);
  if (input.merchantId?.trim()) params.set("merchantId", input.merchantId.trim());

  const response = await fetch(`${input.base}/import${params.toString() ? `?${params}` : ""}`, { method: "POST", body });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || "上传失败");
  return await response.json() as { flow: ScriptFlow; imported: number };
}

export async function createScriptFlowStep(base: string, flowId: number, order: number): Promise<ScriptFlowStep> {
  return await api<ScriptFlowStep>(`${base}/${flowId}/steps`, {
    method: "POST",
    body: JSON.stringify({
      flowCode: `step_${order}`,
      flowName: "新流程节点",
      flowStep: "interest_screening",
      standardReply: "请在这里填写客服标准话术。",
      sortOrder: order,
      enabled: true
    })
  });
}

export async function deleteScriptFlow(base: string, flowId: number): Promise<void> {
  await api(`${base}/${flowId}`, { method: "DELETE" });
}

export async function updateScriptFlowStep(endpoint: string, stepId: number, patch: Record<string, unknown>): Promise<void> {
  await api(`${endpoint}/${stepId}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export async function duplicateScriptFlowStep(endpoint: string, stepId: number): Promise<void> {
  await api(`${endpoint}/${stepId}/duplicate`, { method: "POST" });
}

export async function deleteScriptFlowStep(endpoint: string, stepId: number): Promise<void> {
  await api(`${endpoint}/${stepId}`, { method: "DELETE" });
}
