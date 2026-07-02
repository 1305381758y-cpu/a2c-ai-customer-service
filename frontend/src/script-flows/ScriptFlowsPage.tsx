import { useEffect, useState } from "react";
import { Copy, Plus, Upload } from "lucide-react";

import { api, loadRows, useRows, withQuery } from "../app/api.js";
import type { Filters, MerchantCountry, ScriptFlow, ScriptFlowStep, ScriptFlowVersion } from "../types.js";
import { AsyncButton, Editor, FilterBar, Table } from "../ui/components.js";
import { coercePatch } from "../ui/form.js";
import { countryLabel, formatDateTime, label } from "../ui/formatters.js";
import { notify } from "../ui/toast.js";

const STRICT_STEP_OPTIONS = [
  "interest_screening",
  "registration_intent",
  "wait_registration",
  "telegram_confirm",
  "telegram_download",
  "collect_telegram",
  "human_handoff",
  "ended"
];

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

function ScriptFlowStepEditor({ step, endpoint, onSaved }: { step: ScriptFlowStep; endpoint: string; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState<ScriptFlowStep>(step);
  useEffect(() => setDraft(step), [step]);
  const set = (key: keyof ScriptFlowStep, value: string | boolean | number) => setDraft({ ...draft, [key]: value } as ScriptFlowStep);
  const save = async () => {
    await api(`${endpoint}/${step.id}`, { method: "PATCH", body: JSON.stringify(coercePatch(draft as unknown as Record<string, any>)) });
    notify("success", "流程节点已保存");
    await onSaved();
  };
  const duplicate = async () => {
    await api(`${endpoint}/${step.id}/duplicate`, { method: "POST" });
    notify("success", "流程节点已复制");
    await onSaved();
  };
  const remove = async () => {
    if (!window.confirm("确认删除这个流程节点？如果有其他节点引用它，需要先修改引用。")) return;
    await api(`${endpoint}/${step.id}`, { method: "DELETE" });
    notify("success", "流程节点已删除");
    await onSaved();
  };
  return <div className="script-node-form">
    <div className="form-grid compact-fields">
      <label>流程编号<input value={draft.flowCode} onChange={(e) => set("flowCode", e.target.value)} /></label>
      <label>流程名称<input value={draft.flowName} onChange={(e) => set("flowName", e.target.value)} /></label>
      <label>系统步骤<select value={draft.flowStep} onChange={(e) => set("flowStep", e.target.value)}>{STRICT_STEP_OPTIONS.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
      <label>顺序<input type="number" value={draft.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value || 0))} /></label>
      <label>是否发链接<select value={String(draft.sendLink)} onChange={(e) => set("sendLink", e.target.value === "true")}><option value="false">否</option><option value="true">是</option></select></label>
      <label>是否发邀请码<select value={String(draft.sendInvite)} onChange={(e) => set("sendInvite", e.target.value === "true")}><option value="false">否</option><option value="true">是</option></select></label>
      <label>启用<select value={String(draft.enabled)} onChange={(e) => set("enabled", e.target.value === "true")}><option value="true">启用</option><option value="false">停用</option></select></label>
      <label>下一流程编号<input value={draft.nextFlowCode} onChange={(e) => set("nextFlowCode", e.target.value)} /></label>
      <label>下一系统步骤<select value={draft.nextFlowStep || ""} onChange={(e) => set("nextFlowStep", e.target.value)}><option value="">按默认流程</option>{STRICT_STEP_OPTIONS.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
    </div>
    <div className="form-grid">
      <label>当前节点目标<textarea value={draft.goal} onChange={(e) => set("goal", e.target.value)} /></label>
      <label>触发条件<textarea value={draft.triggerCondition} onChange={(e) => set("triggerCondition", e.target.value)} /></label>
      <label>客户常见表达<textarea value={draft.customerExpressions} onChange={(e) => set("customerExpressions", e.target.value)} /></label>
      <label>客服标准话术<textarea value={draft.standardReply} onChange={(e) => set("standardReply", e.target.value)} /></label>
      <label>需要收集的信息<textarea value={draft.collectInfo} onChange={(e) => set("collectInfo", e.target.value)} /></label>
      <label>下一步条件<textarea value={draft.nextCondition} onChange={(e) => set("nextCondition", e.target.value)} /></label>
      <label>禁止事项<textarea value={draft.forbidden} onChange={(e) => set("forbidden", e.target.value)} /></label>
      <label>备注<textarea value={draft.notes} onChange={(e) => set("notes", e.target.value)} /></label>
    </div>
    <div className="notice">变量：{"{{REGISTER_URL}}"} 注册链接，{"{{INVITE_CODE}}"} 邀请码，{"{{INVITE_DISPLAY}}"} 链接和邀请码完整文本。</div>
    <div className="toolbar"><AsyncButton busyText="保存中..." onClick={save}>保存节点</AsyncButton><AsyncButton busyText="复制中..." onClick={duplicate}><Copy size={16}/>复制节点</AsyncButton><AsyncButton className="danger" busyText="删除中..." onClick={remove}>删除节点</AsyncButton></div>
  </div>;
}
