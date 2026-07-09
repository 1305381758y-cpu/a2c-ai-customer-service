import React, { useEffect, useMemo, useState } from "react";
import { Plus, Upload, Workflow } from "lucide-react";

import { api, loadRows, useRows, withQuery } from "../app/api.js";
import type { Filters, MerchantCountry, ScriptFlow, ScriptFlowStep, ScriptFlowVersion } from "../types.js";
import { ScriptFlowStepEditor } from "./ScriptFlowStepEditor.js";
import { AsyncButton, ConfirmActionButton, Editor, FilterBar, Table } from "../ui/components.js";
import { countryLabel, formatDateTime, label, translateSystemMessage } from "../ui/formatters.js";
import { notify } from "../ui/toast.js";

export function ScriptFlowsPage({ platform = false }: { platform?: boolean }) {
  const base = platform ? "/api/admin/script-flows" : "/api/merchant/script-flows";
  const stepBase = platform ? "/api/admin/script-flow-steps" : "/api/merchant/script-flow-steps";
  const [countries] = useRows<MerchantCountry>("/api/merchant/countries");
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
  const validationWarnings = useMemo(() => detail ? validateScriptFlowDraft(detail.steps) : [], [detail]);

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
    <section className="script-flow-list work-panel">
      <div className="training-center-hero compact">
        <div><h3>话本流程</h3><p>上传话本后，系统会自动分析并生成可编辑流程节点。检查无误后再启用，客户会话才会按新流程推进。</p></div>
      </div>
      <FilterBar filters={filters} setFilters={setFilters} fields={platform ? ["merchantId", "countryId", "status"] : ["countryId", "status"]} selects={{ countryId: ["", ...countries.map((country) => country.id)], status: ["", "draft", "active", "disabled"] }} onApply={reload} />
      <div className="material-uploader compact-uploader">
        <div className="toolbar wrap">
          <input placeholder="话本名称，可选" value={flowName} onChange={(event) => setFlowName(event.target.value)} />
          <input type="file" accept=".xlsx,.xls,.docx,.txt,.md,.csv" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          <AsyncButton disabled={!file || platform && !filters.merchantId.trim()} busyText="分析中..." onClick={upload}><Upload size={16}/>上传并生成节点</AsyncButton>
          <AsyncButton disabled={platform && !filters.merchantId.trim()} busyText="创建中..." onClick={createBuiltIn}><Workflow size={16}/>使用内置11步创建</AsyncButton>
        </div>
        <small>支持 Excel/CSV 标准表头，也支持 Word/TXT/MD 自由话本。也可以直接使用系统内置 11 步生成草稿，右侧逐步修改后再启用。</small>
      </div>
      <Table
        rows={rows}
        columns={["name", "countryName", "status", "active", "version", "stepCount", "updatedAt"]}
        onRow={loadDetail}
        selectedKey={selected?.id}
        rowKey={(row) => row.id}
        loading={rowsLoading}
        error={rowsError}
        onRetry={reload}
        emptyTitle="暂无话本流程"
        emptyDetail="可以上传话本文件，或使用内置 11 步创建一个草稿流程。"
      />
    </section>
    <section className="script-flow-detail detail-panel">
      {detail ? <div className="script-flow-editor">
        <div className="detail-title-row">
          <div>
            <h3>{detail.flow.name}</h3>
            <p>{countryLabel(detail.flow.countryName)} · 版本 {detail.flow.version} · {detail.flow.active ? "当前启用" : label(detail.flow.status)}</p>
          </div>
          <div className="toolbar">
            <AsyncButton busyText="启用中..." onClick={enableFlow}>启用流程</AsyncButton>
            <ConfirmActionButton
              className="danger"
              busyText="删除中..."
              title="确认删除话本流程？"
              detail="删除后不可恢复。若这是当前启用流程，需要先启用其他流程，否则真实客户可能无法继续按预期话本推进。"
              confirmText="删除流程"
              onConfirm={deleteFlow}
            >
              删除流程
            </ConfirmActionButton>
          </div>
        </div>
        {enableError && <div className="warning action-warning" role="alert"><strong>启用失败</strong><span>{enableError}</span></div>}
        {validationWarnings.length > 0 && <div className="notice action-warning" role="status">
          <strong>启用前建议检查</strong>
          <span>{validationWarnings.slice(0, 5).join("；")}</span>
        </div>}
        <Editor title="流程基础信息" value={{ name: detail.flow.name, status: detail.flow.status, countryId: detail.flow.countryId }} fields={["name", "status", "countryId"]} selects={{ status: ["draft", "active", "disabled"], countryId: countries.map((country) => country.id) }} onSave={async (patch) => { await api(`${base}/${detail.flow.id}`, { method: "PATCH", body: JSON.stringify(patch) }); notify("success", "流程信息已保存"); await refreshDetail(); }} />
        <div className="script-flow-columns">
          <div className="script-step-list">
            <div className="panel-title"><h3>流程节点</h3><AsyncButton busyText="新增中..." onClick={addStep}><Plus size={16}/>新增节点</AsyncButton></div>
            {detail.steps.map((step) => <button key={step.id} className={`script-step-card ${selectedStep?.id === step.id ? "active" : ""} ${step.enabled ? "enabled" : "disabled"}`} onClick={() => setSelectedStep(step)}>
              <span className="script-step-card-head">
                <strong>{step.flowCode || "未编号"} · {step.flowName || label(step.flowStep)}</strong>
                <span className={`script-step-status ${step.enabled ? "on" : "off"}`}>{step.enabled ? "启用" : "停用"}</span>
              </span>
              <span className="script-step-meta">{label(step.flowStep)} · 顺序 {step.sortOrder}</span>
              <small className="script-step-reply">{step.standardReply || "暂无标准话术，请点击右侧补充。"}</small>
            </button>)}
            {!detail.steps.length && <div className="empty-state">还没有流程节点，请新增或重新导入话本文件。</div>}
          </div>
          <div className="script-step-editor">
            {selectedStep ? <ScriptFlowStepEditor step={selectedStep} endpoint={stepBase} onSaved={refreshDetail} /> : <div className="empty-state">选择左侧节点后编辑话术和跳转规则。</div>}
          </div>
        </div>
        <details className="version-panel">
          <summary>版本记录</summary>
          <div className="stack-list">
            {detail.versions.map((version) => <div key={version.id} className="version-row"><span>版本 {version.version}</span><span>{version.note || "保存"}</span><span>{version.createdBy || "系统"} · {formatDateTime(version.createdAt, detail.flow.countryName || detail.flow.countryId)}</span><ConfirmActionButton busyText="恢复中..." title="确认恢复话本版本？" detail={`恢复到版本 ${version.version} 后，当前流程节点和话术会被该版本覆盖。建议确认内容无误后再操作。`} confirmText="恢复版本" onConfirm={async () => { await api(`${base}/${detail.flow.id}/versions/${version.id}/restore`, { method: "POST" }); notify("success", "版本已恢复"); await refreshDetail(); }}>恢复</ConfirmActionButton></div>)}
          </div>
        </details>
      </div> : <div className="empty-chat"><h3>选择话本流程</h3><p>上传或选择一个流程后，可以在这里编辑每一步话术、触发条件和下一步规则。</p></div>}
    </section>
  </div>;
}
function validateScriptFlowDraft(steps: ScriptFlowStep[]): string[] {
  const enabledSteps = steps.filter((step) => step.enabled).sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0));
  if (!enabledSteps.length) return ["至少需要 1 个启用节点"];
  const codes = new Set(enabledSteps.map((step) => step.flowCode?.trim()).filter(Boolean));
  const flowSteps = new Set(enabledSteps.map((step) => step.flowStep?.trim()).filter(Boolean));
  const warnings: string[] = [];
  const seenCodes = new Set<string>();
  for (const step of enabledSteps) {
    const code = step.flowCode?.trim();
    if (code && seenCodes.has(code)) warnings.push(`流程编号重复：${code}`);
    if (code) seenCodes.add(code);
    const name = step.flowName || step.flowCode || "未命名节点";
    if (!step.standardReply?.trim()) warnings.push(`${name} 缺少客服标准话术`);
    if ((step.sendLink || step.sendInvite) && !(step.sendLink && step.sendInvite)) warnings.push(`${name} 发注册信息时需要同时开启链接和邀请码`);
    if (step.sendLink && !scriptTextIncludes(step.standardReply, ["{{REGISTER_URL}}", "{{INVITE_DISPLAY}}"])) warnings.push(`${name} 缺少注册链接变量`);
    if (step.sendInvite && !scriptTextIncludes(step.standardReply, ["{{INVITE_CODE}}", "{{INVITE_DISPLAY}}"])) warnings.push(`${name} 缺少邀请码变量`);
    if (step.flowStep === "collect_telegram" && !scriptTextIncludes(step.standardReply, ["{{TG_LINK}}", "{{TELEGRAM_LINK}}"])) warnings.push(`${name} 缺少老师TG链接变量`);
    if (step.nextFlowCode && !codes.has(step.nextFlowCode.trim())) warnings.push(`${name} 的下一流程编号不存在`);
    if (step.nextFlowStep && !flowSteps.has(step.nextFlowStep.trim())) warnings.push(`${name} 的下一系统步骤不存在`);
  }
  return [...new Set(warnings)];
}

function scriptTextIncludes(text: string, values: string[]): boolean {
  return values.some((value) => text.includes(value));
}
