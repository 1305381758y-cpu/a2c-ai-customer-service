import React from "react";
import { Plus } from "lucide-react";

import { api } from "../app/api.js";
import type { MerchantCountry, ScriptFlow, ScriptFlowStep, ScriptFlowVersion } from "../types.js";
import { AsyncButton, ConfirmActionButton, Editor } from "../ui/components.js";
import { countryLabel, formatDateTime, label } from "../ui/formatters.js";
import { notify } from "../ui/toast.js";
import { ScriptFlowStepEditor } from "./ScriptFlowStepEditor.js";

type ScriptFlowDetail = {
  flow: ScriptFlow;
  steps: ScriptFlowStep[];
  versions: ScriptFlowVersion[];
};

export function ScriptFlowDetailPanel({
  detail,
  base,
  stepBase,
  countries,
  selectedStep,
  setSelectedStep,
  enableError,
  validationWarnings,
  enableFlow,
  deleteFlow,
  addStep,
  refreshDetail
}: {
  detail: ScriptFlowDetail | null;
  base: string;
  stepBase: string;
  countries: MerchantCountry[];
  selectedStep: ScriptFlowStep | null;
  setSelectedStep: (step: ScriptFlowStep) => void;
  enableError: string;
  validationWarnings: string[];
  enableFlow: () => Promise<void>;
  deleteFlow: () => Promise<void>;
  addStep: () => Promise<void>;
  refreshDetail: () => Promise<void>;
}) {
  return <section className="script-flow-detail detail-panel">
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
  </section>;
}
