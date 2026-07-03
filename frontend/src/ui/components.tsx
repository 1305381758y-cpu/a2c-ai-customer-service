import React, { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Search, X } from "lucide-react";

import type { Filters, MerchantCountry } from "../types.js";
import { COUNTRY_PRESETS, displayValue, inferCountryProfile, label, languageName, optionLabel, translateSystemMessage } from "./formatters.js";
import { notify } from "./toast.js";

export function Table<T extends Record<string, any>>({ rows, columns, onRow, selectedKey, rowKey }: { rows: T[]; columns: string[]; onRow?: (row: T) => void; selectedKey?: string | number; rowKey?: (row: T, index: number) => string | number }) {
  const [internalSelected, setInternalSelected] = useState<string | number | undefined>();
  const activeKey = selectedKey ?? internalSelected;
  return <div className="table"><table><thead><tr>{columns.map((c) => <th key={c}>{label(c)}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, i) => { const key = rowKey?.(row, i) ?? row.id ?? i; return <tr key={key} className={`${onRow ? "clickable" : ""} ${activeKey !== undefined && String(key) === String(activeKey) ? "selected" : ""}`} onClick={() => { if (!onRow) return; setInternalSelected(key); onRow(row); }}>{columns.map((c) => <td key={c}>{displayValue(c, row[c])}</td>)}</tr>; }) : <tr className="empty-row"><td colSpan={columns.length}>暂无数据</td></tr>}</tbody></table></div>;
}

export function AsyncButton({ children, busyText, onClick, className, disabled = false }: { children: React.ReactNode; busyText: string; onClick: () => Promise<void>; className?: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  return <button className={className} disabled={busy || disabled} aria-busy={busy} onClick={async () => { if (busy || disabled) return; setBusy(true); setDone(false); try { await onClick(); setDone(true); window.setTimeout(() => setDone(false), 900); } catch (err) { notify("error", "操作失败", translateSystemMessage(err instanceof Error ? err.message : "未知错误")); } finally { setBusy(false); } }}>{busy ? <><Loader2 size={16} className="spin"/>{busyText}</> : done ? <><CheckCircle2 size={16}/>已完成</> : children}</button>;
}

export function Editor({ title, value, fields, selects, onSave, onDelete }: { title: string; value: Record<string, any>; fields: string[]; selects?: Record<string, string[]>; onSave: (patch: Record<string, any>) => Promise<void>; onDelete?: () => Promise<void> }) {
  const [draft, setDraft] = useState<Record<string, any>>(value);
  useEffect(() => setDraft(value), [value]);
  return <div><h3>{title}</h3><div className="form-grid">{fields.map((field) => <label key={field}>{label(field)}{selects?.[field] ? <select value={String(draft[field] ?? "")} onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}>{selects[field].map((option) => <option key={option} value={option}>{label(option)}</option>)}</select> : <input value={String(draft[field] ?? "")} onChange={(e) => setDraft({ ...draft, [field]: e.target.value })} />}</label>)}</div><div className="toolbar"><AsyncButton busyText="保存中..." onClick={() => onSave(draft)}>保存</AsyncButton>{onDelete && <AsyncButton className="danger" busyText="删除中..." onClick={onDelete}>删除</AsyncButton>}</div></div>;
}

export function CountryPresetDatalist() {
  return <datalist id="merchant-country-presets">{COUNTRY_PRESETS.map((item) => <option key={item.code} value={item.name} />)}</datalist>;
}

export function CountrySettingsEditor({ value, onSave }: { value: MerchantCountry; onSave: (patch: Record<string, any>) => Promise<void> }) {
  const [draft, setDraft] = useState<Record<string, any>>(value);
  useEffect(() => setDraft(value), [value]);
  const updateName = (name: string) => {
    const inferred = inferCountryProfile(name);
    setDraft({ ...draft, name, code: inferred.code, defaultLanguage: inferred.defaultLanguage });
  };
  return <div><h3>国家设置</h3><div className="form-grid">
    <label>国家<input list="merchant-country-presets" placeholder="输入或选择国家，例如：巴西" value={String(draft.name ?? "")} onChange={(e) => updateName(e.target.value)} /></label>
    <label>国家代码<input readOnly value={String(draft.code ?? "")} /></label>
    <label>默认语言<input readOnly value={languageName(draft.defaultLanguage)} /></label>
    <label>{label("platformRegisterUrl")}<input value={String(draft.platformRegisterUrl ?? "")} onChange={(e) => setDraft({ ...draft, platformRegisterUrl: e.target.value })} /></label>
    <label>{label("tgRegisterGuideUrl")}<input value={String(draft.tgRegisterGuideUrl ?? "")} onChange={(e) => setDraft({ ...draft, tgRegisterGuideUrl: e.target.value })} /></label>
    <label>{label("requirePlatformAccount")}<select value={String(draft.requirePlatformAccount ?? true)} onChange={(e) => setDraft({ ...draft, requirePlatformAccount: e.target.value })}><option value="true">需要开户注册</option><option value="false">不需要开户注册</option></select></label>
    <label>{label("requirePhone")}<select value={String(draft.requirePhone ?? true)} onChange={(e) => setDraft({ ...draft, requirePhone: e.target.value })}><option value="true">需要手机号</option><option value="false">不需要手机号</option></select></label>
    <label>{label("requireTelegram")}<select value={String(draft.requireTelegram ?? true)} onChange={(e) => setDraft({ ...draft, requireTelegram: e.target.value })}><option value="true">需要TG</option><option value="false">不需要TG</option></select></label>
    <label>{label("requireWhatsApp")}<select value={String(draft.requireWhatsApp ?? false)} onChange={(e) => setDraft({ ...draft, requireWhatsApp: e.target.value })}><option value="false">不需要WS</option><option value="true">需要WS</option></select></label>
    <label>{label("status")}<select value={String(draft.status ?? "active")} onChange={(e) => setDraft({ ...draft, status: e.target.value })}><option value="active">启用</option><option value="disabled">停用</option></select></label>
  </div><div className="toolbar"><AsyncButton busyText="保存中..." onClick={() => onSave(draft)}>保存</AsyncButton></div></div>;
}

export function FilterBar({ filters, setFilters, fields, selects = {}, onApply }: { filters: Filters; setFilters: (filters: Filters) => void; fields: string[]; selects?: Record<string, string[]>; onApply: () => Promise<void> }) {
  return <div className="toolbar wrap filters">{fields.map((field) => {
    if (selects[field]) return <select key={field} value={filters[field] || ""} onChange={(e) => setFilters({ ...filters, [field]: e.target.value })}>{selects[field].map((option) => <option key={option} value={option}>{option ? optionLabel(field, option) : label(field)}</option>)}</select>;
    const isTimeFilter = field === "startAt" || field === "endAt";
    return <input key={field} type={isTimeFilter ? "datetime-local" : "text"} step={isTimeFilter ? 1 : undefined} placeholder={label(field)} aria-label={label(field)} value={filters[field] || ""} onChange={(e) => setFilters({ ...filters, [field]: e.target.value })} />;
  })}<AsyncButton onClick={onApply} busyText="筛选中..."><Search size={16}/>筛选</AsyncButton><button className="ghost" onClick={() => { const reset = Object.fromEntries(Object.keys(filters).map((key) => [key, key === "limit" ? "100" : ""])); setFilters(reset); }}><X size={16}/>重置</button></div>;
}
