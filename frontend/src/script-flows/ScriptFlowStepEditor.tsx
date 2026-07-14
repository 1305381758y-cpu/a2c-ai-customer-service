import React, { useEffect, useState } from "react";
import { Copy, Link2, MessageSquareText, Route, ShieldAlert } from "lucide-react";

import { api } from "../app/api.js";
import type { ScriptFlowStep } from "../types.js";
import { AsyncButton, ClosePanelButton, ConfirmActionButton } from "../ui/components.js";
import { coercePatch } from "../ui/form.js";
import { label } from "../ui/formatters.js";
import { notify } from "../ui/toast.js";

const STRICT_STEP_OPTIONS = [
  "first_greeting",
  "interest_screening",
  "project_intro",
  "registration_intent",
  "send_register_link",
  "wait_registration",
  "telegram_confirm",
  "telegram_download",
  "collect_telegram",
  "human_handoff",
  "ended"
];

export function ScriptFlowStepEditor({ step, endpoint, canEdit = true, onSaved, onClose }: { step: ScriptFlowStep; endpoint: string; canEdit?: boolean; onSaved: () => Promise<void>; onClose?: () => void }) {
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
    await api(`${endpoint}/${step.id}`, { method: "DELETE" });
    notify("success", "流程节点已删除");
    await onSaved();
  };
  return <fieldset className="script-node-form" disabled={!canEdit}>
    <section className="script-editor-group">
      {onClose && <div className="section-heading-row"><strong>当前节点编辑</strong><ClosePanelButton onClose={onClose} /></div>}
      <div className="script-editor-group-title"><Route size={17}/><div><strong>节点与推进</strong><span>定义这个节点在流程中的位置和下一步。</span></div></div>
      <div className="form-grid compact-fields">
        <label>流程编号<input value={draft.flowCode} onChange={(e) => set("flowCode", e.target.value)} /></label>
        <label>流程名称<input value={draft.flowName} onChange={(e) => set("flowName", e.target.value)} /></label>
        <label>系统步骤<select value={draft.flowStep} onChange={(e) => set("flowStep", e.target.value)}>{STRICT_STEP_OPTIONS.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
        <label>顺序<input type="number" value={draft.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value || 0))} /></label>
        <label>下一流程编号<input value={draft.nextFlowCode} onChange={(e) => set("nextFlowCode", e.target.value)} /></label>
        <label>下一系统步骤<select value={draft.nextFlowStep || ""} onChange={(e) => set("nextFlowStep", e.target.value)}><option value="">按默认流程</option>{STRICT_STEP_OPTIONS.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
        <label>节点状态<select value={String(draft.enabled)} onChange={(e) => set("enabled", e.target.value === "true")}><option value="true">启用</option><option value="false">停用</option></select></label>
      </div>
      <div className="form-grid">
        <label>当前节点目标<textarea value={draft.goal} onChange={(e) => set("goal", e.target.value)} /></label>
        <label>下一步条件<textarea value={draft.nextCondition} onChange={(e) => set("nextCondition", e.target.value)} /></label>
      </div>
    </section>
    <section className="script-editor-group">
      <div className="script-editor-group-title"><MessageSquareText size={17}/><div><strong>客户表达与客服话术</strong><span>客户说什么会命中本节点，以及命中后如何回复。</span></div></div>
      <div className="form-grid">
        <label>触发条件<textarea value={draft.triggerCondition} onChange={(e) => set("triggerCondition", e.target.value)} /></label>
        <label>客户常见表达<textarea value={draft.customerExpressions} onChange={(e) => set("customerExpressions", e.target.value)} /></label>
        <label className="wide-field">客服标准话术<textarea className="script-standard-reply" value={draft.standardReply} onChange={(e) => set("standardReply", e.target.value)} /></label>
      </div>
    </section>
    <section className="script-editor-group">
      <div className="script-editor-group-title"><Link2 size={17}/><div><strong>发送内容与资料收集</strong><span>只有这里开启的内容，运行时才允许在该节点发送。</span></div></div>
      <div className="form-grid compact-fields">
        <label>发送注册链接<select value={String(draft.sendLink)} onChange={(e) => set("sendLink", e.target.value === "true")}><option value="false">不发送</option><option value="true">发送</option></select></label>
        <label>发送邀请码<select value={String(draft.sendInvite)} onChange={(e) => set("sendInvite", e.target.value === "true")}><option value="false">不发送</option><option value="true">发送</option></select></label>
        <label>发送注册教程图<select value={String(Boolean(draft.sendTutorialImage))} onChange={(e) => set("sendTutorialImage", e.target.value === "true")}><option value="false">不发送</option><option value="true">发送</option></select></label>
      </div>
      <label>需要收集的信息<textarea value={draft.collectInfo} onChange={(e) => set("collectInfo", e.target.value)} /></label>
      <div className="script-variable-help"><strong>可用变量</strong><code>{"{{REGISTER_URL}}"}</code><span>注册链接</span><code>{"{{INVITE_CODE}}"}</code><span>邀请码</span><code>{"{{INVITE_DISPLAY}}"}</code><span>链接和邀请码完整文本</span><code>{"{{TG_LINK}}"}</code><span>老师TG链接</span></div>
    </section>
    <details className="script-editor-group optional-group">
      <summary><ShieldAlert size={17}/><span><strong>边界与备注</strong><small>配置禁止事项和内部说明</small></span></summary>
      <div className="form-grid">
        <label>禁止事项<textarea value={draft.forbidden} onChange={(e) => set("forbidden", e.target.value)} /></label>
        <label>备注<textarea value={draft.notes} onChange={(e) => set("notes", e.target.value)} /></label>
      </div>
    </details>
    {canEdit && <div className="toolbar"><AsyncButton busyText="保存中..." onClick={save}>保存节点</AsyncButton><AsyncButton busyText="复制中..." onClick={duplicate}><Copy size={16}/>复制节点</AsyncButton><ConfirmActionButton className="danger" busyText="删除中..." title="确认删除流程节点？" detail="删除后不可恢复。如果其他节点引用了这个节点，需要先修改引用关系，否则流程可能断开。" confirmText="删除节点" onConfirm={remove}>删除节点</ConfirmActionButton></div>}
  </fieldset>;
}
