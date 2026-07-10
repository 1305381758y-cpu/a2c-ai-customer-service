import React, { useEffect, useState } from "react";
import { History, RefreshCw } from "lucide-react";

import type { AgentProfile, AgentProfileVersion, Merchant, Toast } from "../types.js";
import { ConfirmActionButton } from "../ui/components.js";
import { formatDateTime, label } from "../ui/formatters.js";

type ApiClient = <T>(url: string, options?: RequestInit) => Promise<T>;
type Notify = (type: Toast["type"], title: string, detail?: string) => void;
type AsyncButtonComponent = React.ComponentType<{
  children: React.ReactNode;
  busyText: string;
  onClick: () => Promise<void>;
  className?: string;
  disabled?: boolean;
}>;

export function AgentProfilePage({
  platform,
  canEdit,
  api,
  notify,
  AsyncButton,
  loadRows
}: {
  platform: boolean;
  canEdit: boolean;
  api: ApiClient;
  notify: Notify;
  AsyncButton: AsyncButtonComponent;
  loadRows: <T>(url: string) => Promise<T[]>;
}) {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [merchantId, setMerchantId] = useState("default");
  const [form, setForm] = useState<AgentProfile | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const url = platform ? `/api/admin/merchants/${merchantId}/agent-profile` : "/api/merchant/agent-profile";
  const versionsUrl = `${url}/versions`;
  const [versions, setVersions] = useState<AgentProfileVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  useEffect(() => {
    if (!platform) {
      setMerchants([]);
      return;
    }
    loadRows<Merchant>("/api/admin/merchants").then(setMerchants).catch((err) => setError(err instanceof Error ? err.message : "商户列表加载失败"));
  }, [loadRows, platform]);

  const load = async () => setForm(await api<AgentProfile>(url));
  const loadVersions = async () => {
    setVersionsLoading(true);
    try {
      const result = await api<{ rows: AgentProfileVersion[] }>(versionsUrl);
      setVersions(result.rows);
    } finally {
      setVersionsLoading(false);
    }
  };

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "加载智能体配置失败"));
    loadVersions().catch((err) => setError(err instanceof Error ? err.message : "智能体版本加载失败"));
  }, [url]);

  const fields: Array<[keyof AgentProfile, string, string]> = [
    ["agentName", "智能体名称", "例如：开户注册接待专员"],
    ["roleDefinition", "角色定义", "说明这个客服是谁，有什么经验，负责什么"],
    ["toneStyle", "语气风格", "例如：简短、口语化、耐心、像真人聊天"],
    ["coreGoal", "核心目标", "这个智能体最终要帮客户完成什么"],
    ["mustFollow", "必须遵守", "流程、回答方式、资料收集顺序等"],
    ["forbidden", "禁止事项", "不能承诺、不能收集、不能暴露的内容"],
    ["uncertaintyPolicy", "不确定问题口径", "遇到未配置规则时怎么回答"],
    ["handoffPolicy", "转人工条件", "什么时候停止自动引导并通知人工"]
  ];

  const save = async () => {
    if (!form) return;
    setMessage("");
    setError("");
    try {
      const saved = await api<AgentProfile>(url, { method: "PATCH", body: JSON.stringify(form) });
      setForm(saved);
      setMessage("智能体配置已保存，后续话本流程、普通回复和模拟训练都会使用这份设定。");
      notify("success", "智能体配置已保存");
      await loadVersions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  };
  const restoreVersion = async (version: AgentProfileVersion) => {
    const restored = await api<AgentProfile>(`${versionsUrl}/${version.id}/restore`, { method: "POST" });
    setForm(restored);
    await loadVersions();
    notify("success", `已恢复智能体版本 ${version.version}`, "恢复操作已生成新的版本记录。");
  };

  return <section className="single-column">
    <div className="work-panel">
      <div className="section-title"><div><h2>商户智能体配置</h2><p>流程仍由话本状态机控制，这里只控制人设、语气、边界和转人工口径。</p></div>{form && <span className={`status-pill ${form.enabled ? "ok" : "neutral"}`}>{form.enabled ? "已启用" : "已停用"}</span>}</div>
      {platform && <select value={merchantId} onChange={(e) => setMerchantId(e.target.value)}>{merchants.map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}</select>}
      {error && <div className="error">{error}</div>}
      {message && <div className="notice">{message}</div>}
      {!canEdit && <div className="permission-notice"><strong>当前为只读智能体配置</strong><span>商户运营可以查看角色、语气、目标和边界，但不能修改或停用配置。</span></div>}
      {form ? <>
        <div className="smart-reply-card on"><div><h3>表达边界</h3><p>客户可见回复仍禁止暴露智能服务、机器人、模型、自动客服身份；业务不确定时，以页面或人工确认为准。</p></div>{canEdit && <button className={form.enabled ? "ghost" : ""} onClick={() => setForm({ ...form, enabled: !form.enabled })}>{form.enabled ? "停用配置" : "启用配置"}</button>}</div>
        <div className="form-grid elevated-form agent-profile-grid">
          {fields.map(([key, title, help]) => <label key={key}>{title}<textarea disabled={!canEdit} value={String(form[key] ?? "")} placeholder={help} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /><small>{help}</small></label>)}
        </div>
        <div className="toolbar sticky-actions">{canEdit && <AsyncButton onClick={save} busyText="保存中...">保存智能体配置</AsyncButton>}<AsyncButton onClick={load} busyText="刷新中..."><RefreshCw size={16}/>刷新</AsyncButton></div>
        <details className="config-version-panel agent-version-panel">
          <summary><History size={17}/><span><strong>智能体版本记录</strong><small>{versionsLoading ? "加载中" : versions.length ? `最近 ${versions.length} 个版本` : "保存后会自动记录"}</small></span></summary>
          <div className="config-version-list">
            {!versionsLoading && !versions.length && <div className="empty-state">暂无智能体版本记录。</div>}
            {versions.map((version) => <article key={version.id} className="config-version-row">
              <div><strong>版本 {version.version}</strong><span>{version.note || "保存智能体配置"}</span></div>
              <p>{version.changedKeys.length ? version.changedKeys.map(label).join("、") : "未记录变更字段"}</p>
              <small>{version.createdBy || "系统"} · {formatDateTime(version.createdAt)}</small>
              {canEdit && <ConfirmActionButton className="ghost" busyText="恢复中..." title={`确认恢复智能体版本 ${version.version}？`} detail="恢复后，角色、语气、目标、边界和转人工条件都会回到该版本，并影响后续真实回复、模拟训练和复盘。" confirmText="恢复此版本" onConfirm={() => restoreVersion(version)}>恢复</ConfirmActionButton>}
            </article>)}
          </div>
        </details>
      </> : <div className="empty-state">正在加载智能体配置...</div>}
    </div>
  </section>;
}
