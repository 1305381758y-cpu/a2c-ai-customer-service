import React, { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import type { AgentProfile, Merchant, Toast } from "../types.js";

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

  useEffect(() => {
    if (!platform) {
      setMerchants([]);
      return;
    }
    loadRows<Merchant>("/api/admin/merchants").then(setMerchants).catch((err) => setError(err instanceof Error ? err.message : "商户列表加载失败"));
  }, [loadRows, platform]);

  const load = async () => setForm(await api<AgentProfile>(url));

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "加载 Agent 配置失败"));
  }, [url]);

  const fields: Array<[keyof AgentProfile, string, string]> = [
    ["agentName", "Agent名称", "例如：开户注册接待专员"],
    ["roleDefinition", "角色定义", "说明这个客服是谁，有什么经验，负责什么"],
    ["toneStyle", "语气风格", "例如：简短、口语化、耐心、像真人聊天"],
    ["coreGoal", "核心目标", "这个 Agent 最终要帮客户完成什么"],
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
      setMessage("Agent 配置已保存，后续话本流程、普通回复和模拟训练都会使用这份设定。");
      notify("success", "Agent 配置已保存");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    }
  };

  return <section className="single-column">
    <div className="work-panel">
      <div className="section-title"><div><h2>商户 Agent 配置</h2><p>流程仍由话本状态机控制，这里只控制人设、语气、边界和转人工口径。</p></div>{form && <span className={`status-pill ${form.enabled ? "ok" : "neutral"}`}>{form.enabled ? "已启用" : "已停用"}</span>}</div>
      {platform && <select value={merchantId} onChange={(e) => setMerchantId(e.target.value)}>{merchants.map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}</select>}
      {error && <div className="error">{error}</div>}
      {message && <div className="notice">{message}</div>}
      {form ? <>
        <div className="smart-reply-card on"><div><h3>表达边界</h3><p>客户可见回复仍禁止暴露 AI、机器人、模型、自动客服身份；业务不确定时，以页面或人工确认为准。</p></div><button className={form.enabled ? "ghost" : ""} disabled={!canEdit} onClick={() => setForm({ ...form, enabled: !form.enabled })}>{form.enabled ? "停用配置" : "启用配置"}</button></div>
        <div className="form-grid elevated-form agent-profile-grid">
          {fields.map(([key, title, help]) => <label key={key}>{title}<textarea disabled={!canEdit} value={String(form[key] ?? "")} placeholder={help} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /><small>{help}</small></label>)}
        </div>
        <div className="toolbar sticky-actions"><AsyncButton disabled={!canEdit} onClick={save} busyText="保存中...">保存 Agent 配置</AsyncButton><AsyncButton onClick={load} busyText="刷新中..."><RefreshCw size={16}/>刷新</AsyncButton></div>
      </> : <div className="empty-state">正在加载 Agent 配置...</div>}
    </div>
  </section>;
}
