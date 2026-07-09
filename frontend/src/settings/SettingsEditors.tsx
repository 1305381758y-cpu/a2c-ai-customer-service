import React, { useEffect, useState } from "react";
import { Copy, Plus, Upload } from "lucide-react";

import { api, loadRows } from "../app/api.js";
import type { A2CAccount, InviteCode, MerchantCountry, TeacherTgLink } from "../types.js";
import { AsyncButton, ConfirmActionButton, Table } from "../ui/components.js";
import { countryLabel, displayValue, formatDateTime, label } from "../ui/formatters.js";
import { notify } from "../ui/toast.js";

type ConfigForm = Record<string, string | boolean>;
type ConfigFlagKey = "smartReplyEnabled" | "trainingSimulationEnabled" | "strictScriptFlowEnabled";

export function ConfigSwitchCards({ form, saveConfigFlag }: { form: ConfigForm; saveConfigFlag: (key: ConfigFlagKey, value: boolean, successMessage: string) => Promise<void> }) {
  return <>
    <div className={`smart-reply-card ${form.smartReplyEnabled === false ? "off" : "on"}`}>
      <div><h3>智能自动回复</h3><p>{form.smartReplyEnabled === false ? "已关闭：系统只接收消息、翻译、更新记忆和触发接管，不会自动回复客户。" : "已开启：客户消息会自动调用智能服务，并通过当前 A2C 客服账号回复。"}</p></div>
      <ConfirmActionButton className={form.smartReplyEnabled === false ? "" : "ghost"} busyText="保存中..." title={form.smartReplyEnabled === false ? "确认开启智能回复？" : "确认关闭智能回复？"} detail={form.smartReplyEnabled === false ? "开启后，真实客户消息会按当前 A2C 客服账号自动回复。请确认 A2C、智能供应商、话本和邀请码配置都已正确。" : "关闭后，系统仍会接收客户消息和更新记录，但不会自动回复真实客户。"} confirmText={form.smartReplyEnabled === false ? "开启智能回复" : "关闭智能回复"} onConfirm={() => saveConfigFlag("smartReplyEnabled", form.smartReplyEnabled === false, form.smartReplyEnabled === false ? "智能回复已开启" : "智能回复已关闭")}>{form.smartReplyEnabled === false ? "开启智能回复" : "关闭智能回复"}</ConfirmActionButton>
    </div>
    <div className={`smart-reply-card ${form.trainingSimulationEnabled ? "on" : "off"}`}>
      <div><h3>模拟训练模式</h3><p>{form.trainingSimulationEnabled ? "已开启：真实 A2C 消息只会进入内部训练并生成记录，不会真实回复客户，也不会通知接管群。" : "已关闭：真实 A2C 消息会按当前配置正常自动回复客户。"}</p></div>
      <ConfirmActionButton className={form.trainingSimulationEnabled ? "ghost" : ""} busyText="保存中..." title={form.trainingSimulationEnabled ? "确认关闭模拟训练？" : "确认开启模拟训练？"} detail={form.trainingSimulationEnabled ? "关闭后，真实 A2C 消息会恢复按当前配置自动回复客户。请确认线上配置已经准备好。" : "开启后，真实 A2C 消息只进入内部训练，不会真实回复客户，也不会通知接管群。适合测试前排查流程。"} confirmText={form.trainingSimulationEnabled ? "关闭模拟训练" : "开启模拟训练"} onConfirm={() => saveConfigFlag("trainingSimulationEnabled", !form.trainingSimulationEnabled, form.trainingSimulationEnabled ? "模拟训练已关闭" : "模拟训练已开启")}>{form.trainingSimulationEnabled ? "关闭模拟训练" : "开启模拟训练"}</ConfirmActionButton>
    </div>
    <div className={`smart-reply-card ${form.strictScriptFlowEnabled ? "on" : "off"}`}>
      <div><h3>话本流程</h3><p>{form.strictScriptFlowEnabled ? "已开启：客户每回复一次，系统会按话本主动推进到下一步，不会掉到普通自由回复。" : "已关闭：非指定商户可能走普通回复；如要固定按开户注册话本推进，请开启。"}</p></div>
      <ConfirmActionButton className={form.strictScriptFlowEnabled ? "ghost" : ""} busyText="保存中..." title={form.strictScriptFlowEnabled ? "确认关闭话本流程？" : "确认开启话本流程？"} detail={form.strictScriptFlowEnabled ? "关闭后，客户可能不再按固定开户注册流程推进，而是走普通回复或兜底逻辑。" : "开启后，客户回复会优先按当前启用话本流程推进。请确认话本流程、注册链接、邀请码和导师 TG 链接配置正确。"} confirmText={form.strictScriptFlowEnabled ? "关闭话本流程" : "开启话本流程"} onConfirm={() => saveConfigFlag("strictScriptFlowEnabled", !form.strictScriptFlowEnabled, form.strictScriptFlowEnabled ? "话本流程已关闭" : "话本流程已开启")}>{form.strictScriptFlowEnabled ? "关闭话本流程" : "开启话本流程"}</ConfirmActionButton>
    </div>
  </>;
}

export function WebhookCopyCard({ a2cWebhookUrl, onCopied }: { a2cWebhookUrl: string; onCopied: () => void }) {
  return <div className="memory highlighted">
    <h3>A2C Webhook地址</h3>
    <p>把这个地址填写到该商户的 A2C Webhook 配置里。</p>
    <div className="copy-row">
      <label>{label("a2cWebhookUrl")}<input readOnly value={a2cWebhookUrl} onFocus={(e) => e.currentTarget.select()} /></label>
      <AsyncButton onClick={async () => { await navigator.clipboard.writeText(a2cWebhookUrl); onCopied(); notify("success", "已复制 Webhook 地址"); }} busyText="复制中..."><Copy size={16}/>复制</AsyncButton>
    </div>
  </div>;
}

export function TutorialImageUploadCard({ imageUrl, file, onFileChange, onUpload }: { imageUrl: string; file: File | null; onFileChange: (file: File | null) => void; onUpload: () => Promise<void> }) {
  return <div className="memory tutorial-upload-card">
    <div>
      <h3>注册教程图片</h3>
      <p>商户只需要上传图片。客户问“怎么注册”“我不会”“有教程吗”时，系统会自动把这张图发给客户。</p>
    </div>
    <div className="tutorial-upload-layout">
      <div className="tutorial-preview">
        {imageUrl ? <img src={imageUrl} alt="注册教程图片预览" /> : <span>还未上传注册教程图片</span>}
      </div>
      <div className="tutorial-upload-actions">
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => onFileChange(event.target.files?.[0] || null)} />
        <AsyncButton disabled={!file} busyText="上传中..." onClick={onUpload}><Upload size={16}/>上传图片</AsyncButton>
        <small>{file ? `已选择：${file.name}` : "支持 PNG、JPG、WEBP、GIF；上传后会替换当前教程图。"}</small>
      </div>
    </div>
  </div>;
}

export function TeacherTgLinksPanel({
  links,
  draft,
  endpoint,
  reload,
  onDraftChange,
  onImport
}: {
  links: TeacherTgLink[];
  draft: { urls: string; priority: string; rotationCount: string };
  endpoint: string;
  reload: () => Promise<void>;
  onDraftChange: (draft: { urls: string; priority: string; rotationCount: string }) => void;
  onImport: () => Promise<void>;
}) {
  return <div className="memory compact-panel">
    <div className="section-title-row">
      <div>
        <h3>老师TG链接池</h3>
        <p>话本流程第 9 步会从这里自动分配老师 Telegram 链接。同一客户首次分配后会绑定固定导师，后续不会切换。</p>
      </div>
      <span className="status-pill neutral">已配置 {links.length} 条</span>
    </div>
    <div className="toolbar wrap">
      <label className="wide">批量导入<textarea placeholder="一行一个老师TG链接，例如：https://t.me/teacher_username" value={draft.urls} onChange={(event) => onDraftChange({ ...draft, urls: event.target.value })} /></label>
      <label>优先级<input type="number" value={draft.priority} onChange={(event) => onDraftChange({ ...draft, priority: event.target.value })} /></label>
      <label>轮询次数<input type="number" min="1" value={draft.rotationCount} onChange={(event) => onDraftChange({ ...draft, rotationCount: event.target.value })} /></label>
      <AsyncButton onClick={onImport} busyText="导入中...">导入链接</AsyncButton>
    </div>
    <small>分配规则：按优先级从高到低排列；轮询次数表示这一轮里该链接连续出现几次。例如 A 轮询 2、B 轮询 1，则分配顺序为 A、A、B，然后循环。</small>
    <Table rows={links} columns={["label", "url", "priority", "rotationCount", "assignedCount", "status"]} rowKey={(row) => row.id} />
    <div className="messages material-items">
      {links.map((link) => <TeacherTgLinkEditor key={link.id} link={link} endpoint={endpoint} reload={reload} />)}
    </div>
  </div>;
}

export function TeacherTgLinkEditor({ link, endpoint, reload }: { link: TeacherTgLink; endpoint: string; reload: () => Promise<void> }) {
  const [draft, setDraft] = useState({ label: link.label || "", url: link.url, priority: String(link.priority), rotationCount: String(link.rotationCount), status: link.status });
  useEffect(() => setDraft({ label: link.label || "", url: link.url, priority: String(link.priority), rotationCount: String(link.rotationCount), status: link.status }), [link.id, link.label, link.url, link.priority, link.rotationCount, link.status]);
  return <article>
    <strong>{draft.label || "未命名导师"} · 已分配 {link.assignedCount} 次</strong>
    <div className="toolbar wrap">
      <input placeholder="导师备注名" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
      <input className="wide" placeholder="老师TG链接" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
      <input type="number" placeholder="优先级" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })} />
      <input type="number" min="1" placeholder="轮询次数" value={draft.rotationCount} onChange={(e) => setDraft({ ...draft, rotationCount: e.target.value })} />
      <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}><option value="active">启用</option><option value="disabled">停用</option></select>
      <AsyncButton busyText="保存中..." onClick={async () => { await api(`${endpoint}/${link.id}`, { method: "PATCH", body: JSON.stringify({ ...draft, priority: Number(draft.priority || 0), rotationCount: Number(draft.rotationCount || 1) }) }); await reload(); notify("success", "老师TG链接已保存"); }}>保存</AsyncButton>
      <ConfirmActionButton className="danger" busyText="删除中..." title="确认删除导师 TG 链接？" detail="删除后新客户不会再分配到这条导师链接；已分配过的老客户仍保留历史绑定记录。" confirmText="删除链接" onConfirm={async () => { await api(`${endpoint}/${link.id}`, { method: "DELETE" }); await reload(); notify("success", "老师TG链接已删除"); }}>删除</ConfirmActionButton>
    </div>
  </article>;
}

export function A2CAccountCard({ account, countries, platform, onToggle, onCountry }: { account: A2CAccount; countries: MerchantCountry[]; platform: boolean; onToggle: () => Promise<void>; onCountry: (countryId: string) => Promise<void> }) {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [codesError, setCodesError] = useState("");
  const [draft, setDraft] = useState({ codes: "", registerUrl: "" });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const endpoint = platform ? `/api/admin/a2c/accounts/${account.id}/invite-codes` : `/api/merchant/a2c/accounts/${account.id}/invite-codes`;
  const codeEndpoint = platform ? "/api/admin/invite-codes" : "/api/merchant/invite-codes";
  const reload = async () => {
    setCodesError("");
    try {
      setCodes(await loadRows<InviteCode>(endpoint));
    } catch (err) {
      setCodes([]);
      setCodesError(err instanceof Error ? err.message : "邀请码池加载失败");
    }
  };
  useEffect(() => { void reload(); }, [endpoint]);
  const selectedCode = codes.find((item) => item.id === selectedId) || codes[0] || null;
  useEffect(() => {
    if (!codes.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !codes.some((item) => item.id === selectedId)) setSelectedId(codes[0].id);
  }, [codes, selectedId]);
  const stats = {
    available: codes.filter((item) => item.status === "available").length,
    reserved: codes.filter((item) => item.status === "reserved").length,
    used: codes.filter((item) => item.status === "used").length,
    disabled: codes.filter((item) => item.status === "disabled").length
  };
  return <article className="account-panel">
    <div className="account-panel-head">
      <div><strong>{account.verifiedName || account.apiPhone}</strong><span>{account.apiPhone} · {countryLabel(account.countryName)} · {account.enabled ? "启用" : "停用"}</span></div>
      <ConfirmActionButton busyText="处理中..." title={account.enabled ? "确认停用客服账号？" : "确认启用客服账号？"} detail={account.enabled ? "停用后，该 A2C 客服账号不会再用于自动回复和分配邀请码；已有会话记录仍会保留。" : "启用后，该 A2C 客服账号会参与自动回复和邀请码分配，请确认账号国家和邀请码池配置正确。"} confirmText={account.enabled ? "停用账号" : "启用账号"} onConfirm={onToggle}>{account.enabled ? "停用账号" : "启用账号"}</ConfirmActionButton>
    </div>
    <div className="account-settings-row">
      <div className="account-country">归属国家：{countryLabel(account.countryName || countries[0]?.name || "默认国家")}</div>
      <div className="invite-stats"><span>可用 {stats.available}</span><span>已分配 {stats.reserved}</span><span>已使用 {stats.used}</span><span>停用 {stats.disabled}</span></div>
    </div>
    <details className="invite-panel">
      <summary>管理邀请码池</summary>
      <div className="invite-console">
        <div className="invite-import">
          <label>批量导入<textarea placeholder="一行一个邀请码；也支持逗号、空格分隔" value={draft.codes} onChange={(e) => setDraft({ ...draft, codes: e.target.value })} /></label>
          <label>注册链接模板<input placeholder="例如 https://example.com/register?code={code}" value={draft.registerUrl} onChange={(e) => setDraft({ ...draft, registerUrl: e.target.value })} /></label>
          <AsyncButton disabled={!draft.codes.trim()} busyText="保存中..." onClick={async () => { const result = await api<{ imported: number; rows: InviteCode[] }>(`${endpoint}/import`, { method: "POST", body: JSON.stringify(draft) }); setCodes(result.rows); setDraft({ codes: "", registerUrl: draft.registerUrl }); notify("success", "邀请码池已保存", `已处理 ${result.imported} 个邀请码`); }}><Plus size={16}/>导入</AsyncButton>
        </div>
        <div className="invite-manager">
          <div className="invite-list">
            <div className="invite-list-head"><span>邀请码</span><span>状态</span><span>客户</span></div>
            {codesError && <div className="empty-state compact error-state"><strong>邀请码池加载失败</strong><span>{codesError}</span><button className="ghost" onClick={() => void reload()}>重新加载</button></div>}
            {!codesError && codes.map((code) => <button key={code.id} className={selectedCode?.id === code.id ? "active" : ""} onClick={() => setSelectedId(code.id)}>
              <strong>{code.code}</strong>
              {displayValue("status", code.status)}
              <small>{code.assignedCustomerKey || "未绑定"}</small>
            </button>)}
            {!codesError && !codes.length && <div className="empty-state compact">暂无邀请码，先在上方批量导入。</div>}
          </div>
          <div className="invite-detail">
            {selectedCode ? <InviteCodeEditor code={selectedCode} endpoint={codeEndpoint} reload={reload} /> : <div className="empty-state compact">选择一个邀请码后可编辑注册链接、状态和删除。</div>}
          </div>
        </div>
      </div>
    </details>
  </article>;
}

function InviteCodeEditor({ code, endpoint, reload }: { code: InviteCode; endpoint: string; reload: () => Promise<void> }) {
  const [draft, setDraft] = useState({ code: code.code, registerUrl: code.registerUrl, status: code.status });
  useEffect(() => setDraft({ code: code.code, registerUrl: code.registerUrl, status: code.status }), [code.id, code.code, code.registerUrl, code.status]);
  return <div className="invite-editor">
    <div className="invite-editor-title"><div><strong>{code.code}</strong><span>{displayValue("status", code.status)}</span></div><small>{code.updatedAt ? `更新于 ${formatDateTime(code.updatedAt, code.countryName || code.countryId)}` : ""}</small></div>
    <div className="invite-editor-grid">
      <label>邀请码<input aria-label="邀请码" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} /></label>
      <label>状态<select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}><option value="available">{label("available")}</option><option value="reserved">{label("reserved")}</option><option value="used">{label("used")}</option><option value="disabled">{label("disabled")}</option></select></label>
      <label className="wide">注册链接<input aria-label="注册链接" value={draft.registerUrl} placeholder="不填时使用国家/商户开户链接；可包含 {code}" onChange={(e) => setDraft({ ...draft, registerUrl: e.target.value })} /></label>
    </div>
    <div className="invite-meta">
      <span>绑定客户：{code.assignedCustomerKey || "未绑定"}</span>
      <span>注册账号：{code.platformAccount || "未填写"}</span>
      <span>使用时间：{code.usedAt ? formatDateTime(code.usedAt, code.countryName || code.countryId) : "未使用"}</span>
    </div>
    <div className="invite-editor-actions">
      <AsyncButton busyText="保存中..." onClick={async () => { await api(`${endpoint}/${code.id}`, { method: "PATCH", body: JSON.stringify(draft) }); await reload(); notify("success", "邀请码已保存"); }}>保存修改</AsyncButton>
      <ConfirmActionButton className="danger" busyText="删除中..." title="确认彻底删除邀请码？" detail={`邀请码 ${code.code} 删除后不可恢复。若它已绑定客户，历史绑定记录可能仍用于排查，但不会再进入可分配池。`} confirmText="彻底删除" onConfirm={async () => { await api(`${endpoint}/${code.id}`, { method: "DELETE" }); await reload(); notify("success", "邀请码已彻底删除"); }}>彻底删除</ConfirmActionButton>
    </div>
  </div>;
}
