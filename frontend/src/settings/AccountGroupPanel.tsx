import { useEffect, useMemo, useState } from "react";
import { CheckCheck, FolderPlus, Link2, Plus, Search, Users, X } from "lucide-react";

import { api, loadRows } from "../app/api.js";
import type { A2CAccount, A2CAccountGroup, InviteCode, InviteTeacherBinding, MerchantCountry, TeacherTgLink } from "../types.js";
import { AsyncButton, ConfirmActionButton } from "../ui/components.js";
import { countryLabel, displayValue } from "../ui/formatters.js";
import { notify } from "../ui/toast.js";

const GROUPS_URL = "/api/merchant/a2c/account-groups";

export function AccountGroupPanel({ accounts, countries, teacherTgLinks, reloadAccounts }: { accounts: A2CAccount[]; countries: MerchantCountry[]; teacherTgLinks: TeacherTgLink[]; reloadAccounts: () => Promise<void> }) {
  const [groups, setGroups] = useState<A2CAccountGroup[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [countryId, setCountryId] = useState("");
  const [error, setError] = useState("");
  const reload = async () => {
    try {
      setError("");
      const rows = await loadRows<A2CAccountGroup>(GROUPS_URL);
      setGroups(rows);
      setSelectedId((current) => current && rows.some((row) => row.id === current) ? current : rows[0]?.id ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "客服分组加载失败");
    }
  };
  useEffect(() => { void reload(); }, []);
  const selected = groups.find((group) => group.id === selectedId);
  return <section className="account-group-section">
    <div className="section-title-row">
      <div><h3>客服账号分组</h3><p>同一分组内的客服账号共享邀请码池。邀请码可重复使用，并可限定后续分配的导师链接。</p></div>
      <span className="status-pill neutral">{groups.length} 个分组</span>
    </div>
    <div className="account-group-create">
      <label>分组名称<input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：巴西开户注册组" /></label>
      <label>国家<select value={countryId || countries[0]?.id || ""} onChange={(event) => setCountryId(event.target.value)}>{countries.map((country) => <option key={country.id} value={country.id}>{countryLabel(country.name)}</option>)}</select></label>
      <AsyncButton disabled={!name.trim() || !countries.length} busyText="创建中..." onClick={async () => {
        const created = await api<A2CAccountGroup>(GROUPS_URL, { method: "POST", body: JSON.stringify({ name, countryId: countryId || countries[0]?.id }) });
        setName("");
        await reload();
        setSelectedId(created.id);
        notify("success", "客服分组已创建");
      }}><FolderPlus size={16}/>新建分组</AsyncButton>
    </div>
    {error && <div className="empty-state compact error-state"><strong>客服分组加载失败</strong><span>{error}</span><button className="ghost" onClick={() => void reload()}>重新加载</button></div>}
    {!error && <div className="account-group-workspace">
      <nav className="account-group-list" aria-label="客服账号分组">
        {groups.map((group) => <button key={group.id} className={group.id === selectedId ? "active" : ""} onClick={() => setSelectedId(group.id)}>
          <strong>{group.name}</strong><span>{group.accountCount} 个账号 · {group.inviteCodeCount} 个邀请码</span>
        </button>)}
        {!groups.length && <div className="empty-state compact">暂无分组。先创建分组，再选择客服账号和邀请码。</div>}
      </nav>
      <div className="account-group-detail">
        {selected ? <AccountGroupEditor key={selected.id} group={selected} accounts={accounts} countries={countries} teacherTgLinks={teacherTgLinks} reloadGroups={reload} reloadAccounts={reloadAccounts} /> : <div className="empty-state compact">选择一个分组后可配置成员、邀请码和导师链接。</div>}
      </div>
    </div>}
  </section>;
}

function AccountGroupEditor({ group, accounts, countries, teacherTgLinks, reloadGroups, reloadAccounts }: { group: A2CAccountGroup; accounts: A2CAccount[]; countries: MerchantCountry[]; teacherTgLinks: TeacherTgLink[]; reloadGroups: () => Promise<void>; reloadAccounts: () => Promise<void> }) {
  const [draft, setDraft] = useState({ name: group.name, countryId: group.countryId, status: group.status });
  const [memberIds, setMemberIds] = useState<number[]>(accounts.filter((account) => account.groupId === group.id).map((account) => account.id));
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [codeDraft, setCodeDraft] = useState({ codes: "", registerUrl: "", reusable: true });
  const [membersOpen, setMembersOpen] = useState(true);
  const [invitesOpen, setInvitesOpen] = useState(true);
  const codesUrl = `${GROUPS_URL}/${group.id}/invite-codes`;
  const reloadCodes = async () => setCodes(await loadRows<InviteCode>(codesUrl));
  useEffect(() => { void reloadCodes(); }, [codesUrl]);
  useEffect(() => setMemberIds(accounts.filter((account) => account.groupId === group.id).map((account) => account.id)), [accounts, group.id]);
  const eligibleAccounts = useMemo(() => accounts.filter((account) => !account.groupId || account.groupId === group.id), [accounts, group.id]);
  return <div className="account-group-editor">
    <div className="account-group-fields">
      <label>名称<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
      <label>国家<select value={draft.countryId} onChange={(event) => setDraft({ ...draft, countryId: event.target.value })}>{countries.map((country) => <option key={country.id} value={country.id}>{countryLabel(country.name)}</option>)}</select></label>
      <label>状态<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as "active" | "disabled" })}><option value="active">启用</option><option value="disabled">停用</option></select></label>
      <div className="account-group-actions">
        <AsyncButton busyText="保存中..." onClick={async () => { await api(`${GROUPS_URL}/${group.id}`, { method: "PATCH", body: JSON.stringify(draft) }); await reloadGroups(); notify("success", "分组信息已保存"); }}>保存分组</AsyncButton>
        <ConfirmActionButton className="danger" busyText="删除中..." title="确认删除客服分组？" detail="删除分组后，成员账号会变为未分组；分组邀请码和导师绑定会一并删除，历史会话分配记录仍保留。" confirmText="删除分组" onConfirm={async () => { await api(`${GROUPS_URL}/${group.id}`, { method: "DELETE" }); await reloadAccounts(); await reloadGroups(); notify("success", "客服分组已删除"); }}>删除</ConfirmActionButton>
      </div>
    </div>
    <details open={membersOpen} onToggle={(event) => setMembersOpen(event.currentTarget.open)} className="group-config-block">
      <summary><Users size={16}/>分组成员 <span>{memberIds.length} 个</span></summary>
      <div className="account-member-grid">
        {eligibleAccounts.map((account) => <label key={account.id}><input type="checkbox" checked={memberIds.includes(account.id)} onChange={(event) => setMemberIds(event.target.checked ? [...memberIds, account.id] : memberIds.filter((id) => id !== account.id))} /><span><strong>{account.verifiedName || account.apiPhone}</strong><small>{account.apiPhone}</small></span></label>)}
        {!eligibleAccounts.length && <div className="empty-state compact">没有可加入该分组的客服账号。</div>}
      </div>
      <AsyncButton busyText="保存中..." onClick={async () => { await api(`${GROUPS_URL}/${group.id}/accounts`, { method: "PUT", body: JSON.stringify({ accountIds: memberIds }) }); await reloadAccounts(); await reloadGroups(); notify("success", "分组成员已保存"); }}>保存成员</AsyncButton>
    </details>
    <details open={invitesOpen} onToggle={(event) => setInvitesOpen(event.currentTarget.open)} className="group-config-block">
      <summary><Link2 size={16}/>共享邀请码 <span>{codes.length} 个</span></summary>
      <div className="group-invite-import">
        <label>邀请码<textarea value={codeDraft.codes} onChange={(event) => setCodeDraft({ ...codeDraft, codes: event.target.value })} placeholder="一行一个邀请码" /></label>
        <label>注册链接<input value={codeDraft.registerUrl} onChange={(event) => setCodeDraft({ ...codeDraft, registerUrl: event.target.value })} placeholder="可包含 {code}" /></label>
        <div className="group-invite-import-actions">
          <label className="inline-check"><input type="checkbox" checked={codeDraft.reusable} onChange={(event) => setCodeDraft({ ...codeDraft, reusable: event.target.checked })} />允许重复使用</label>
          <AsyncButton disabled={!codeDraft.codes.trim()} busyText="导入中..." onClick={async () => { const result = await api<{ imported: number; rows: InviteCode[] }>(`${codesUrl}/import`, { method: "POST", body: JSON.stringify(codeDraft) }); setCodes(result.rows); setCodeDraft({ ...codeDraft, codes: "" }); await reloadGroups(); notify("success", "分组邀请码已导入", `已处理 ${result.imported} 个邀请码`); }}><Plus size={16}/>导入邀请码</AsyncButton>
        </div>
      </div>
      <div className="group-invite-list">
        {codes.map((code) => <GroupInviteEditor key={code.id} code={code} teacherTgLinks={teacherTgLinks.filter((link) => link.countryId === group.countryId)} reload={async () => { await reloadCodes(); await reloadGroups(); }} />)}
        {!codes.length && <div className="empty-state compact">暂无共享邀请码。导入后，同组账号会优先从这里分配。</div>}
      </div>
    </details>
  </div>;
}

function GroupInviteEditor({ code, teacherTgLinks, reload }: { code: InviteCode; teacherTgLinks: TeacherTgLink[]; reload: () => Promise<void> }) {
  const [draft, setDraft] = useState({ code: code.code, registerUrl: code.registerUrl, status: code.status, reusable: code.reusable !== false });
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<number[]>([]);
  const [bindingsOpen, setBindingsOpen] = useState(false);
  const [teacherSearch, setTeacherSearch] = useState("");
  const bindingUrl = `/api/merchant/a2c/invite-codes/group/${code.id}/teacher-links`;
  const loadBindings = async () => {
    try {
      setSelectedTeacherIds((await loadRows<InviteTeacherBinding>(bindingUrl)).map((row) => row.teacherTgLinkId));
    } catch (cause) {
      notify("error", "导师绑定加载失败", cause instanceof Error ? cause.message : "请稍后重试");
    }
  };
  useEffect(() => { void loadBindings(); }, [bindingUrl]);
  const filteredTeacherLinks = useMemo(() => {
    const keyword = teacherSearch.trim().toLocaleLowerCase();
    if (!keyword) return teacherTgLinks;
    return teacherTgLinks.filter((link) => `${link.label ?? ""} ${link.url}`.toLocaleLowerCase().includes(keyword));
  }, [teacherSearch, teacherTgLinks]);
  const saveInvite = async () => {
    await api(`/api/merchant/a2c/group-invite-codes/${code.id}`, { method: "PATCH", body: JSON.stringify(draft) });
    await api(bindingUrl, { method: "PUT", body: JSON.stringify({ teacherTgLinkIds: selectedTeacherIds }) });
    await reload();
    notify("success", "邀请码和导师绑定已保存");
  };
  return <article className="group-invite-row">
    <header className="group-invite-card-header">
      <div className="group-invite-card-title">
        <strong>{code.code}</strong>
        <span className={`status-pill ${code.status === "available" ? "ok" : "neutral"}`}>{displayValue("status", code.status)}</span>
        <span className="usage-label">已分配 {code.usageCount ?? 0} 次</span>
      </div>
      <div className="group-invite-card-actions">
        <AsyncButton busyText="保存中..." onClick={saveInvite}>保存</AsyncButton>
        <ConfirmActionButton className="danger" busyText="删除中..." title="确认删除共享邀请码？" detail={`邀请码 ${code.code} 删除后不再分配；已产生的会话绑定记录仍保留。`} confirmText="删除邀请码" onConfirm={async () => { await api(`/api/merchant/a2c/group-invite-codes/${code.id}`, { method: "DELETE" }); await reload(); notify("success", "共享邀请码已删除"); }}>删除</ConfirmActionButton>
      </div>
    </header>
    <div className="group-invite-row-main">
      <label>邀请码<input value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} /></label>
      <label>注册链接<input value={draft.registerUrl} onChange={(event) => setDraft({ ...draft, registerUrl: event.target.value })} /></label>
      <label>状态<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="available">可用</option><option value="disabled">停用</option></select></label>
      <label className="inline-check"><input type="checkbox" checked={draft.reusable} onChange={(event) => setDraft({ ...draft, reusable: event.target.checked })} />可复用</label>
    </div>
    <details open={bindingsOpen} onToggle={(event) => setBindingsOpen(event.currentTarget.open)} className="teacher-binding-section">
      <summary><span><Link2 size={16}/>绑定导师链接</span><span className="teacher-binding-count">已选 {selectedTeacherIds.length} / {teacherTgLinks.length}</span></summary>
      <div className="teacher-binding-toolbar">
        <label className="teacher-search"><Search size={16}/><input value={teacherSearch} onChange={(event) => setTeacherSearch(event.target.value)} placeholder="搜索导师名称或链接" /></label>
        <button className="ghost" type="button" disabled={!filteredTeacherLinks.length} onClick={() => setSelectedTeacherIds(Array.from(new Set([...selectedTeacherIds, ...filteredTeacherLinks.map((link) => link.id)])))}><CheckCheck size={16}/>全选筛选结果</button>
        <button className="ghost" type="button" disabled={!selectedTeacherIds.length} onClick={() => setSelectedTeacherIds([])}><X size={16}/>清空选择</button>
      </div>
      <div className="teacher-binding-grid">
        {filteredTeacherLinks.map((link) => <label key={link.id} title={link.url}><input type="checkbox" checked={selectedTeacherIds.includes(link.id)} onChange={(event) => setSelectedTeacherIds(event.target.checked ? [...selectedTeacherIds, link.id] : selectedTeacherIds.filter((id) => id !== link.id))} /><span className="teacher-link-copy"><strong>{link.label || link.url}</strong>{link.label && <small className="teacher-link-url">{link.url}</small>}<small>优先级 {link.priority} · 轮询 {link.rotationCount}</small></span></label>)}
        {!teacherTgLinks.length && <div className="empty-state compact">当前国家还没有导师链接，请先在“TG接管”中添加。</div>}
        {!!teacherTgLinks.length && !filteredTeacherLinks.length && <div className="empty-state compact">没有匹配的导师链接。</div>}
      </div>
    </details>
  </article>;
}
