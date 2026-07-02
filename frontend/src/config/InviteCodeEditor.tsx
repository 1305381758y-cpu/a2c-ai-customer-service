import { useEffect, useState } from "react";

import { api } from "../app/api.js";
import type { InviteCode } from "../types.js";
import { AsyncButton } from "../ui/components.js";
import { displayValue, formatDateTime, label } from "../ui/formatters.js";
import { notify } from "../ui/toast.js";

export function InviteCodeEditor({ code, endpoint, reload }: { code: InviteCode; endpoint: string; reload: () => Promise<void> }) {
  const [draft, setDraft] = useState({ code: code.code, registerUrl: code.registerUrl, status: code.status });
  useEffect(() => setDraft({ code: code.code, registerUrl: code.registerUrl, status: code.status }), [code.id, code.code, code.registerUrl, code.status]);
  return <div className="invite-editor">
    <div className="invite-editor-title"><div><strong>{code.code}</strong><span>{displayValue("status", code.status)}</span></div><small>{code.updatedAt ? `更新于 ${formatDateTime(code.updatedAt)}` : ""}</small></div>
    <div className="invite-editor-grid">
      <label>邀请码<input aria-label="邀请码" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} /></label>
      <label>状态<select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}><option value="available">{label("available")}</option><option value="reserved">{label("reserved")}</option><option value="used">{label("used")}</option><option value="disabled">{label("disabled")}</option></select></label>
      <label className="wide">注册链接<input aria-label="注册链接" value={draft.registerUrl} placeholder="不填时使用国家/商户开户链接；可包含 {code}" onChange={(e) => setDraft({ ...draft, registerUrl: e.target.value })} /></label>
    </div>
    <div className="invite-meta">
      <span>绑定客户：{code.assignedCustomerKey || "未绑定"}</span>
      <span>注册账号：{code.platformAccount || "未填写"}</span>
      <span>使用时间：{code.usedAt ? formatDateTime(code.usedAt) : "未使用"}</span>
    </div>
    <div className="invite-editor-actions">
      <AsyncButton busyText="保存中..." onClick={async () => { await api(`${endpoint}/${code.id}`, { method: "PATCH", body: JSON.stringify(draft) }); await reload(); notify("success", "邀请码已保存"); }}>保存修改</AsyncButton>
      <AsyncButton className="danger" busyText="删除中..." onClick={async () => { if (!window.confirm("确认彻底删除这个邀请码？")) return; await api(`${endpoint}/${code.id}`, { method: "DELETE" }); await reload(); notify("success", "邀请码已彻底删除"); }}>彻底删除</AsyncButton>
    </div>
  </div>;
}
