import { useEffect, useState } from "react";

import { api } from "../app/api.js";
import type { TeacherTgLink } from "../types.js";
import { AsyncButton, ConfirmActionButton, Table } from "../ui/components.js";
import { notify } from "../ui/toast.js";

type TeacherTgDraft = { urls: string; priority: string; rotationCount: string };

export function TeacherTgLinksPanel({
  links,
  draft,
  endpoint,
  reload,
  onDraftChange,
  onImport
}: {
  links: TeacherTgLink[];
  draft: TeacherTgDraft;
  endpoint: string;
  reload: () => Promise<void>;
  onDraftChange: (draft: TeacherTgDraft) => void;
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

function TeacherTgLinkEditor({ link, endpoint, reload }: { link: TeacherTgLink; endpoint: string; reload: () => Promise<void> }) {
  const [draft, setDraft] = useState({ label: link.label || "", url: link.url, priority: String(link.priority), rotationCount: String(link.rotationCount), status: link.status });
  useEffect(() => setDraft({ label: link.label || "", url: link.url, priority: String(link.priority), rotationCount: String(link.rotationCount), status: link.status }), [link.id, link.label, link.url, link.priority, link.rotationCount, link.status]);
  return <article>
    <strong>{draft.label || "未命名导师"} · 已分配 {link.assignedCount} 次</strong>
    <div className="toolbar wrap">
      <input placeholder="导师备注名" value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} />
      <input className="wide" placeholder="老师TG链接" value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} />
      <input type="number" placeholder="优先级" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })} />
      <input type="number" min="1" placeholder="轮询次数" value={draft.rotationCount} onChange={(event) => setDraft({ ...draft, rotationCount: event.target.value })} />
      <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="active">启用</option><option value="disabled">停用</option></select>
      <AsyncButton busyText="保存中..." onClick={async () => { await api(`${endpoint}/${link.id}`, { method: "PATCH", body: JSON.stringify({ ...draft, priority: Number(draft.priority || 0), rotationCount: Number(draft.rotationCount || 1) }) }); await reload(); notify("success", "老师TG链接已保存"); }}>保存</AsyncButton>
      <ConfirmActionButton className="danger" busyText="删除中..." title="确认删除导师 TG 链接？" detail="删除后新客户不会再分配到这条导师链接；已分配过的老客户仍保留历史绑定记录。" confirmText="删除链接" onConfirm={async () => { await api(`${endpoint}/${link.id}`, { method: "DELETE" }); await reload(); notify("success", "老师TG链接已删除"); }}>删除</ConfirmActionButton>
    </div>
  </article>;
}
