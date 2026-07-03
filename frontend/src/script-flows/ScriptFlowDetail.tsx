import { Plus } from "lucide-react";

import type { MerchantCountry, ScriptFlow, ScriptFlowStep, ScriptFlowVersion } from "../types.js";
import { AsyncButton, Editor } from "../ui/components.js";
import { countryLabel, formatDateTime, label } from "../ui/formatters.js";
import { notify } from "../ui/toast.js";
import { ScriptFlowStepEditor } from "./ScriptFlowStepEditor.js";
import { enableScriptFlow, restoreScriptFlowVersion, updateScriptFlow } from "./scriptFlowApi.js";

type ScriptFlowDetailData = {
  flow: ScriptFlow;
  steps: ScriptFlowStep[];
  versions: ScriptFlowVersion[];
};

type ScriptFlowDetailProps = {
  base: string;
  stepBase: string;
  detail: ScriptFlowDetailData | null;
  selectedStep: ScriptFlowStep | null;
  countries: MerchantCountry[];
  onAddStep: () => Promise<void>;
  onDeleteFlow: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onSelectStep: (step: ScriptFlowStep) => void;
};

export function ScriptFlowDetail({ base, stepBase, detail, selectedStep, countries, onAddStep, onDeleteFlow, onRefresh, onSelectStep }: ScriptFlowDetailProps) {
  return <section className="script-flow-detail detail-panel">
    {detail ? <div className="script-flow-editor">
      <div className="detail-title-row">
        <div>
          <h3>{detail.flow.name}</h3>
          <p>{countryLabel(detail.flow.countryName)} · 版本 {detail.flow.version} · {detail.flow.active ? "当前启用" : label(detail.flow.status)}</p>
        </div>
        <div className="toolbar">
          <AsyncButton busyText="启用中..." onClick={async () => { await enableScriptFlow(base, detail.flow.id); notify("success", "话本流程已启用"); await onRefresh(); }}>启用流程</AsyncButton>
          <AsyncButton className="danger" busyText="删除中..." onClick={onDeleteFlow}>删除流程</AsyncButton>
        </div>
      </div>
      <Editor title="流程基础信息" value={{ name: detail.flow.name, status: detail.flow.status, countryId: detail.flow.countryId }} fields={["name", "status", "countryId"]} selects={{ status: ["draft", "active", "disabled"], countryId: countries.map((country) => country.id) }} onSave={async (patch) => { await updateScriptFlow(base, detail.flow.id, patch); notify("success", "流程信息已保存"); await onRefresh(); }} />
      <div className="script-flow-columns">
        <div className="script-step-list">
          <div className="panel-title"><h3>流程节点</h3><AsyncButton busyText="新增中..." onClick={onAddStep}><Plus size={16}/>新增节点</AsyncButton></div>
          {detail.steps.map((step) => <button key={step.id} className={`script-step-card ${selectedStep?.id === step.id ? "active" : ""}`} onClick={() => onSelectStep(step)}>
            <strong>{step.flowCode} · {step.flowName || label(step.flowStep)}</strong>
            <span>{label(step.flowStep)} · 顺序 {step.sortOrder} · {step.enabled ? "启用" : "停用"}</span>
            <small>{step.standardReply}</small>
          </button>)}
          {!detail.steps.length && <div className="empty-state">还没有流程节点，请新增或重新导入 Excel。</div>}
        </div>
        <div className="script-step-editor">
          {selectedStep ? <ScriptFlowStepEditor step={selectedStep} endpoint={stepBase} onSaved={onRefresh} /> : <div className="empty-state">选择左侧节点后编辑话术和跳转规则。</div>}
        </div>
      </div>
      <details className="version-panel">
        <summary>版本记录</summary>
        <div className="stack-list">
          {detail.versions.map((version) => <div key={version.id} className="version-row"><span>版本 {version.version}</span><span>{version.note || "保存"}</span><span>{version.createdBy || "系统"} · {formatDateTime(version.createdAt)}</span><AsyncButton busyText="恢复中..." onClick={async () => { if (!window.confirm(`确认恢复到版本 ${version.version}？`)) return; await restoreScriptFlowVersion(base, detail.flow.id, version.id); notify("success", "版本已恢复"); await onRefresh(); }}>恢复</AsyncButton></div>)}
        </div>
      </details>
    </div> : <div className="empty-chat"><h3>选择话本流程</h3><p>上传或选择一个流程后，可以在这里编辑每一步话术、触发条件和下一步规则。</p></div>}
  </section>;
}
