import React, { useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { api, loadRows } from "../app/api.js";
import type { A2CAccount, InviteCode, MerchantCountry } from "../types.js";
import { AsyncButton, ConfirmActionButton } from "../ui/components.js";
import { countryLabel, displayValue, formatDateTime, label } from "../ui/formatters.js";
import { Pagination, type PagerState } from "../ui/Pagination.js";
import { notify } from "../ui/toast.js";
import { inviteCodeEndpoints, inviteCodeStatusCounts } from "./InviteCodePanelHelpers.js";

export function A2CAccountsPanel({
  accounts,
  filteredAccounts,
  pager,
  countries,
  platform,
  accountKeyword,
  accountStatus,
  accountCountryId,
  onKeywordChange,
  onStatusChange,
  onCountryChange,
  onToggle,
  onCountry
}: {
  accounts: A2CAccount[];
  filteredAccounts: A2CAccount[];
  pager: PagerState & { rows: A2CAccount[] };
  countries: MerchantCountry[];
  platform: boolean;
  accountKeyword: string;
  accountStatus: string;
  accountCountryId: string;
  onKeywordChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onCountryChange: (value: string) => void;
  onToggle: (account: A2CAccount) => Promise<void>;
  onCountry: (account: A2CAccount, countryId: string) => Promise<void>;
}) {
  return <div className="memory">
    <div className="account-section-head">
      <div><h3>A2C客服账号与邀请码池</h3><p>客服账号会自动归属到商户国家。每个客服账号可以绑定多个邀请码，客户注册后邀请码会从可用池里移除。</p></div>
      <span>已保存 {accounts.length} 个账号</span>
    </div>
    <div className="account-filter-bar">
      <label>搜索账号<input value={accountKeyword} onChange={(event) => onKeywordChange(event.target.value)} placeholder="手机号、名称、WABA ID" /></label>
      <label>状态<select value={accountStatus} onChange={(event) => onStatusChange(event.target.value)}><option value="">全部状态</option><option value="enabled">启用</option><option value="disabled">停用</option></select></label>
      <label>国家<select value={accountCountryId} onChange={(event) => onCountryChange(event.target.value)}><option value="">全部国家</option>{countries.map((country) => <option key={country.id} value={country.id}>{countryLabel(country.name)}</option>)}</select></label>
    </div>
    <div className="account-list-meta">当前筛选 {filteredAccounts.length} 个账号，显示第 {(pager.page - 1) * pager.pageSize + (pager.total ? 1 : 0)} - {Math.min(pager.page * pager.pageSize, pager.total)} 个。</div>
    <div className="account-grid">
      {pager.rows.map((row) => <A2CAccountCard key={row.id} account={row} countries={countries} platform={platform} onToggle={() => onToggle(row)} onCountry={(countryId) => onCountry(row, countryId)} />)}
      {!accounts.length && <div className="empty-state">填写并保存 A2C 密钥后，点击“同步A2C客服账号”。同步成功后这里会出现每个客服账号的邀请码池。</div>}
      {accounts.length > 0 && !filteredAccounts.length && <div className="empty-state">没有符合筛选条件的客服账号，换个手机号、状态或国家试试。</div>}
    </div>
    <Pagination pager={pager} />
  </div>;
}

export function A2CAccountCard({ account, countries, platform, onToggle, onCountry }: { account: A2CAccount; countries: MerchantCountry[]; platform: boolean; onToggle: () => Promise<void>; onCountry: (countryId: string) => Promise<void> }) {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [codesError, setCodesError] = useState("");
  const [draft, setDraft] = useState({ codes: "", registerUrl: "" });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const endpoints = inviteCodeEndpoints(platform, account.id);
  const reload = async () => {
    setCodesError("");
    try {
      setCodes(await loadRows<InviteCode>(endpoints.accountCodes));
    } catch (err) {
      setCodes([]);
      setCodesError(err instanceof Error ? err.message : "邀请码池加载失败");
    }
  };
  useEffect(() => { void reload(); }, [endpoints.accountCodes]);
  const selectedCode = codes.find((item) => item.id === selectedId) || codes[0] || null;
  useEffect(() => {
    if (!codes.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !codes.some((item) => item.id === selectedId)) setSelectedId(codes[0].id);
  }, [codes, selectedId]);
  const stats = inviteCodeStatusCounts(codes);
  return <article className="account-panel">
    <div className="account-panel-head">
      <div><strong>{account.verifiedName || account.apiPhone}</strong><span>{account.apiPhone} · {countryLabel(account.countryName)} · {account.enabled ? "启用" : "停用"}</span></div>
      <ConfirmActionButton busyText="处理中..." title={account.enabled ? "确认停用客服账号？" : "确认启用客服账号？"} detail={account.enabled ? "停用后，该 A2C 客服账号不会再用于自动回复和分配邀请码；已有会话记录仍会保留。" : "启用后，该 A2C 客服账号会参与自动回复和邀请码分配，请确认账号国家和邀请码池配置正确。"} confirmText={account.enabled ? "停用账号" : "启用账号"} onConfirm={onToggle}>{account.enabled ? "停用账号" : "启用账号"}</ConfirmActionButton>
    </div>
    <div className="account-settings-row">
      <label className="account-country">归属国家<select aria-label={`${account.apiPhone}归属国家`} value={account.countryId || countries[0]?.id || ""} onChange={(event) => void onCountry(event.target.value)}>{countries.map((country) => <option key={country.id} value={country.id}>{countryLabel(country.name)}</option>)}</select></label>
      <div className="invite-stats"><span>可用 {stats.available}</span><span>已分配 {stats.reserved}</span><span>已使用 {stats.used}</span><span>停用 {stats.disabled}</span></div>
    </div>
    <details className="invite-panel">
      <summary>管理邀请码池</summary>
      <div className="invite-console">
        <div className="invite-import">
          <label>批量导入<textarea placeholder="一行一个邀请码；也支持逗号、空格分隔" value={draft.codes} onChange={(event) => setDraft({ ...draft, codes: event.target.value })} /></label>
          <label>注册链接模板<input placeholder="例如 https://example.com/register?code={code}" value={draft.registerUrl} onChange={(event) => setDraft({ ...draft, registerUrl: event.target.value })} /></label>
          <AsyncButton disabled={!draft.codes.trim()} busyText="保存中..." onClick={async () => { const result = await api<{ imported: number; rows: InviteCode[] }>(`${endpoints.accountCodes}/import`, { method: "POST", body: JSON.stringify(draft) }); setCodes(result.rows); setDraft({ codes: "", registerUrl: draft.registerUrl }); notify("success", "邀请码池已保存", `已处理 ${result.imported} 个邀请码`); }}><Plus size={16}/>导入</AsyncButton>
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
            {selectedCode ? <InviteCodeEditor code={selectedCode} endpoint={endpoints.codeBase} reload={reload} /> : <div className="empty-state compact">选择一个邀请码后可编辑注册链接、状态和删除。</div>}
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
      <label>邀请码<input aria-label="邀请码" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} /></label>
      <label>状态<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="available">{label("available")}</option><option value="reserved">{label("reserved")}</option><option value="used">{label("used")}</option><option value="disabled">{label("disabled")}</option></select></label>
      <label className="wide">注册链接<input aria-label="注册链接" value={draft.registerUrl} placeholder="不填时使用国家/商户开户链接；可包含 {code}" onChange={(event) => setDraft({ ...draft, registerUrl: event.target.value })} /></label>
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
