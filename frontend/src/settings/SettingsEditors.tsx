import React, { useEffect, useState } from "react";
import { Copy, Upload } from "lucide-react";

import { api } from "../app/api.js";
import type { TeacherTgLink } from "../types.js";
import { AsyncButton, ConfirmActionButton, Table } from "../ui/components.js";
import { label } from "../ui/formatters.js";
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
