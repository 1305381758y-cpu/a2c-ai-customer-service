import React, { useEffect, useMemo, useState } from "react";

import { api, loadRows, useRows, withQuery } from "../app/api.js";
import type { Filters, MerchantCountry, ScriptFlow, ScriptFlowStep, ScriptFlowVersion } from "../types.js";
import { ScriptFlowDetailPanel } from "./ScriptFlowDetailPanel.js";
import { ScriptFlowListPanel } from "./ScriptFlowListPanel.js";
import { validateScriptFlowIssues } from "./ScriptFlowValidation.js";
import { ResourceErrorNotice } from "../ui/components.js";
import { translateSystemMessage } from "../ui/formatters.js";
import { notify } from "../ui/toast.js";

export function ScriptFlowsPage({ platform = false }: { platform?: boolean }) {
  const base = platform ? "/api/admin/script-flows" : "/api/merchant/script-flows";
  const stepBase = platform ? "/api/admin/script-flow-steps" : "/api/merchant/script-flow-steps";
  const [countries, , countriesState] = useRows<MerchantCountry>("/api/merchant/countries");
  const [filters, setFilters] = useState<Filters>({ merchantId: "", countryId: "", status: "" });
  const rowsUrl = withQuery(base, platform ? filters : { countryId: filters.countryId, status: filters.status });
  const [rows, setRows] = useState<ScriptFlow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ScriptFlow | null>(null);
  const [detail, setDetail] = useState<{ flow: ScriptFlow; steps: ScriptFlowStep[]; versions: ScriptFlowVersion[] } | null>(null);
  const [selectedStep, setSelectedStep] = useState<ScriptFlowStep | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [flowName, setFlowName] = useState("");
  const [enableError, setEnableError] = useState("");
  const validationIssues = useMemo(() => detail ? validateScriptFlowIssues(detail.steps) : [], [detail]);

  const reload = async () => {
    setRowsLoading(true);
    setRowsError(null);
    try {
      setRows(await loadRows(rowsUrl));
    } catch (err) {
      setRows([]);
      setRowsError(err instanceof Error ? err.message : "话本流程加载失败，请稍后重试。");
    } finally {
      setRowsLoading(false);
    }
  };
  useEffect(() => { void reload(); }, [rowsUrl]);

  const loadDetail = async (flow: ScriptFlow) => {
    setSelected(flow);
    setEnableError("");
    const next = await api<{ flow: ScriptFlow; steps: ScriptFlowStep[]; versions: ScriptFlowVersion[] }>(`${base}/${flow.id}`);
    setDetail(next);
    setSelectedStep(next.steps[0] || null);
  };

  const upload = async () => {
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    const params = new URLSearchParams();
    const countryId = filters.countryId || countries[0]?.id || "";
    if (flowName.trim()) params.set("name", flowName.trim());
    if (countryId) params.set("countryId", countryId);
    if (platform && filters.merchantId.trim()) params.set("merchantId", filters.merchantId.trim());
    const response = await fetch(`${base}/import${params.toString() ? `?${params}` : ""}`, { method: "POST", body });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || "上传失败");
    const result = await response.json() as { flow: ScriptFlow; imported: number };
    notify("success", "话本流程已导入", `已生成 ${result.imported} 个流程节点。当前为草稿，请检查后再启用。`);
    setFile(null);
    setFlowName("");
    await reload();
    await loadDetail(result.flow);
  };

  const createBuiltIn = async () => {
    const countryId = filters.countryId || countries[0]?.id || "";
    const body: Record<string, string> = { name: flowName.trim() || "严格业务流程" };
    if (countryId) body.countryId = countryId;
    if (platform && filters.merchantId.trim()) body.merchantId = filters.merchantId.trim();
    const result = await api<{ flow: ScriptFlow; steps: ScriptFlowStep[] }>(`${base}/builtin`, { method: "POST", body: JSON.stringify(body) });
    notify("success", "已创建内置流程", "已生成 11 个可编辑节点。请检查话术后再启用。");
    setFlowName("");
    await reload();
    await loadDetail(result.flow);
  };

  const refreshDetail = async () => {
    if (!selected) return;
    const next = await api<{ flow: ScriptFlow; steps: ScriptFlowStep[]; versions: ScriptFlowVersion[] }>(`${base}/${selected.id}`);
    setDetail(next);
    setSelected(next.flow);
    setSelectedStep((current) => next.steps.find((step) => step.id === current?.id) || next.steps[0] || null);
    await reload();
  };

  const enableFlow = async () => {
    if (!detail) return;
    setEnableError("");
    try {
      await api(`${base}/${detail.flow.id}/enable`, { method: "POST" });
      notify("success", "话本流程已启用", "后续新客户会优先按这个流程推进。");
      await refreshDetail();
    } catch (error) {
      const message = translateSystemMessage(error instanceof Error ? error.message : "启用失败");
      setEnableError(message);
      throw error;
    }
  };

  const addStep = async () => {
    if (!detail) return;
    const order = detail.steps.length + 1;
    const created = await api<ScriptFlowStep>(`${base}/${detail.flow.id}/steps`, {
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
    setSelectedStep(created);
    await refreshDetail();
  };

  const deleteFlow = async () => {
    if (!selected) return;
    await api(`${base}/${selected.id}`, { method: "DELETE" });
    notify("success", "话本流程已删除");
    setSelected(null);
    setDetail(null);
    setSelectedStep(null);
    await reload();
  };

  return <div className="script-flow-page work-split">
    <ResourceErrorNotice label="国家筛选选项" error={countriesState.error} onRetry={countriesState.reload} />
    <ScriptFlowListPanel platform={platform} countries={countries} filters={filters} setFilters={setFilters} reload={reload} flowName={flowName} setFlowName={setFlowName} file={file} setFile={setFile} upload={upload} createBuiltIn={createBuiltIn} rows={rows} selectedId={selected?.id} rowsLoading={rowsLoading} rowsError={rowsError} loadDetail={loadDetail} />
    <ScriptFlowDetailPanel detail={detail} base={base} stepBase={stepBase} countries={countries} selectedStep={selectedStep} setSelectedStep={setSelectedStep} enableError={enableError} validationIssues={validationIssues} enableFlow={enableFlow} deleteFlow={deleteFlow} addStep={addStep} refreshDetail={refreshDetail} />
  </div>;
}
