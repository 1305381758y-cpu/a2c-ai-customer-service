import { useEffect, useState } from "react";
import { Plus, Upload } from "lucide-react";

import { api, loadRows, useRows, withQuery } from "../app/api.js";
import type { Filters, MerchantCountry, ScriptFlow, ScriptFlowStep, ScriptFlowVersion } from "../types.js";
import { AsyncButton, Editor, FilterBar, Table } from "../ui/components.js";
import { countryLabel, formatDateTime, label } from "../ui/formatters.js";
import { notify } from "../ui/toast.js";
import { ScriptFlowStepEditor } from "./ScriptFlowStepEditor.js";

export function ScriptFlowsPage({ platform = false }: { platform?: boolean }) {
  const base = platform ? "/api/admin/script-flows" : "/api/merchant/script-flows";
  const stepBase = platform ? "/api/admin/script-flow-steps" : "/api/merchant/script-flow-steps";
  const [countries] = useRows<MerchantCountry>("/api/merchant/countries");
  const [filters, setFilters] = useState<Filters>({ merchantId: "", countryId: "", status: "" });
  const rowsUrl = withQuery(base, platform ? filters : { countryId: filters.countryId, status: filters.status });
  const [rows, setRows] = useRows<ScriptFlow>(rowsUrl);
  const [selected, setSelected] = useState<ScriptFlow | null>(null);
  const [detail, setDetail] = useState<{ flow: ScriptFlow; steps: ScriptFlowStep[]; versions: ScriptFlowVersion[] } | null>(null);
  const [selectedStep, setSelectedStep] = useState<ScriptFlowStep | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [flowName, setFlowName] = useState("");
  const reload = async () => setRows(await loadRows(rowsUrl));
  const loadDetail = async (flow: ScriptFlow) => {
    setSelected(flow);
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
    notify("success", "话本流程已导入", `已生成 ${result.imported} 个流程节点`);
    setFile(null);
    setFlowName("");
    await reload();
  };
  const refreshDetail = async () => {
    if (!selected) return;
    const next = await api<{ flow: ScriptFlow; steps: ScriptFlowStep[]; versions: ScriptFlowVersion[] }>(`${base}/${selected.id}`);
    setDetail(next);
    setSelected(next.flow);
    setSelectedStep((current) => next.steps.find((step) => step.id === current?.id) || next.steps[0] || null);
    await reload();
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
    if (!window.confirm("确认删除这个话本流程？删除后不可恢复。当前启用的话本需要先启用其他话本后再删除。")) return;
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
        <div><h3>话本流程</h3><p>这里维护“客户下一步该怎么走”。上传 Excel 或 Word 后可直接编辑节点，启用后客户会话优先按该流程推进。</p></div>
      </div>
      <FilterBar filters={filters} setFilters={setFilters} fields={platform ? ["merchantId", "countryId", "status"] : ["countryId", "status"]} selects={{ countryId: ["", ...countries.map((country) => country.id)], status: ["", "draft", "active", "disabled"] }} onApply={reload} />
      <div className="material-uploader compact-uploader">
        <div className="toolbar wrap">
          <input placeholder="话本名称，可选" value={flowName} onChange={(event) => setFlowName(event.target.value)} />
          <input type="file" accept=".xlsx,.xls,.docx" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          <AsyncButton disabled={!file || platform && !filters.merchantId.trim()} busyText="导入中..." onClick={upload}><Upload size={16}/>导入话本流程</AsyncButton>
        </div>
        <small>Excel 表头需包含“客服标准话术”；Word 会按段落自动拆成流程节点，导入后可在右侧继续编辑。</small>
      </div>
      <Table rows={rows} columns={["name", "countryName", "status", "active", "version", "stepCount", "updatedAt"]} onRow={loadDetail} selectedKey={selected?.id} rowKey={(row) => row.id} />
    </section>
    <section className="script-flow-detail detail-panel">
      {detail ? <div className="script-flow-editor">
        <div className="detail-title-row">
          <div>
            <h3>{detail.flow.name}</h3>
            <p>{countryLabel(detail.flow.countryName)} · 版本 {detail.flow.version} · {detail.flow.active ? "当前启用" : label(detail.flow.status)}</p>
          </div>
          <div className="toolbar">
            <AsyncButton busyText="启用中..." onClick={async () => { await api(`${base}/${detail.flow.id}/enable`, { method: "POST" }); notify("success", "话本流程已启用"); await refreshDetail(); }}>启用流程</AsyncButton>
            <AsyncButton className="danger" busyText="删除中..." onClick={deleteFlow}>删除流程</AsyncButton>
          </div>
        </div>
        <Editor title="流程基础信息" value={{ name: detail.flow.name, status: detail.flow.status, countryId: detail.flow.countryId }} fields={["name", "status", "countryId"]} selects={{ status: ["draft", "active", "disabled"], countryId: countries.map((country) => country.id) }} onSave={async (patch) => { await api(`${base}/${detail.flow.id}`, { method: "PATCH", body: JSON.stringify(patch) }); notify("success", "流程信息已保存"); await refreshDetail(); }} />
        <div className="script-flow-columns">
          <div className="script-step-list">
            <div className="panel-title"><h3>流程节点</h3><AsyncButton busyText="新增中..." onClick={addStep}><Plus size={16}/>新增节点</AsyncButton></div>
            {detail.steps.map((step) => <button key={step.id} className={`script-step-card ${selectedStep?.id === step.id ? "active" : ""}`} onClick={() => setSelectedStep(step)}>
              <strong>{step.flowCode} · {step.flowName || label(step.flowStep)}</strong>
              <span>{label(step.flowStep)} · 顺序 {step.sortOrder} · {step.enabled ? "启用" : "停用"}</span>
              <small>{step.standardReply}</small>
            </button>)}
            {!detail.steps.length && <div className="empty-state">还没有流程节点，请新增或重新导入 Excel。</div>}
          </div>
          <div className="script-step-editor">
            {selectedStep ? <ScriptFlowStepEditor step={selectedStep} endpoint={stepBase} onSaved={refreshDetail} /> : <div className="empty-state">选择左侧节点后编辑话术和跳转规则。</div>}
          </div>
        </div>
        <details className="version-panel">
          <summary>版本记录</summary>
          <div className="stack-list">
            {detail.versions.map((version) => <div key={version.id} className="version-row"><span>版本 {version.version}</span><span>{version.note || "保存"}</span><span>{version.createdBy || "系统"} · {formatDateTime(version.createdAt)}</span><AsyncButton busyText="恢复中..." onClick={async () => { if (!window.confirm(`确认恢复到版本 ${version.version}？`)) return; await api(`${base}/${detail.flow.id}/versions/${version.id}/restore`, { method: "POST" }); notify("success", "版本已恢复"); await refreshDetail(); }}>恢复</AsyncButton></div>)}
          </div>
        </details>
      </div> : <div className="empty-chat"><h3>选择话本流程</h3><p>上传或选择一个流程后，可以在这里编辑每一步话术、触发条件和下一步规则。</p></div>}
    </section>
  </div>;
}
