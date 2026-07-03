import { useEffect, useState } from "react";
import { Upload } from "lucide-react";

import { useRows } from "../app/api.js";
import type { Filters, MerchantCountry, ScriptFlow, ScriptFlowStep, ScriptFlowVersion } from "../types.js";
import { AsyncButton, FilterBar, Table } from "../ui/components.js";
import { notify } from "../ui/toast.js";
import { ScriptFlowDetail } from "./ScriptFlowDetail.js";
import {
  createScriptFlowStep,
  deleteScriptFlow,
  importScriptFlow,
  loadScriptFlowDetail,
  loadScriptFlows,
  scriptFlowBase,
  scriptFlowRowsUrl,
  scriptFlowStepBase
} from "./scriptFlowApi.js";

export function ScriptFlowsPage({ platform = false }: { platform?: boolean }) {
  const base = scriptFlowBase(platform);
  const stepBase = scriptFlowStepBase(platform);
  const [countries] = useRows<MerchantCountry>("/api/merchant/countries");
  const [filters, setFilters] = useState<Filters>({ merchantId: "", countryId: "", status: "" });
  const rowsUrl = scriptFlowRowsUrl(platform, filters);
  const [rows, setRows] = useRows<ScriptFlow>(rowsUrl);
  const [selected, setSelected] = useState<ScriptFlow | null>(null);
  const [detail, setDetail] = useState<{ flow: ScriptFlow; steps: ScriptFlowStep[]; versions: ScriptFlowVersion[] } | null>(null);
  const [selectedStep, setSelectedStep] = useState<ScriptFlowStep | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [flowName, setFlowName] = useState("");
  const reload = async () => setRows(await loadScriptFlows(rowsUrl));
  const loadDetail = async (flow: ScriptFlow) => {
    setSelected(flow);
    const next = await loadScriptFlowDetail(base, flow.id);
    setDetail(next);
    setSelectedStep(next.steps[0] || null);
  };
  const upload = async () => {
    if (!file) return;
    const countryId = filters.countryId || countries[0]?.id || "";
    const result = await importScriptFlow({
      base,
      file,
      flowName,
      countryId,
      merchantId: platform ? filters.merchantId : ""
    });
    notify("success", "话本流程已导入", `已生成 ${result.imported} 个流程节点`);
    setFile(null);
    setFlowName("");
    await reload();
  };
  const refreshDetail = async () => {
    if (!selected) return;
    const next = await loadScriptFlowDetail(base, selected.id);
    setDetail(next);
    setSelected(next.flow);
    setSelectedStep((current) => next.steps.find((step) => step.id === current?.id) || next.steps[0] || null);
    await reload();
  };
  const addStep = async () => {
    if (!detail) return;
    const order = detail.steps.length + 1;
    const created = await createScriptFlowStep(base, detail.flow.id, order);
    setSelectedStep(created);
    await refreshDetail();
  };
  const deleteFlow = async () => {
    if (!selected) return;
    if (!window.confirm("确认删除这个话本流程？删除后不可恢复。当前启用的话本需要先启用其他话本后再删除。")) return;
    await deleteScriptFlow(base, selected.id);
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
    <ScriptFlowDetail
      base={base}
      stepBase={stepBase}
      detail={detail}
      selectedStep={selectedStep}
      countries={countries}
      onAddStep={addStep}
      onDeleteFlow={deleteFlow}
      onRefresh={refreshDetail}
      onSelectStep={setSelectedStep}
    />
  </div>;
}
