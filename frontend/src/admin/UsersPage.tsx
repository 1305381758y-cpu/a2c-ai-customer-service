import { useState } from "react";

import { api, loadRows, useRows, withQuery } from "../app/api.js";
import type { Filters } from "../types.js";
import { Editor, Table } from "../ui/components.js";
import { label } from "../ui/formatters.js";

export function UsersPage() {
  const [filters, setFilters] = useState<Filters>({ merchantId: "" });
  const usersUrl = withQuery("/api/admin/users", filters);
  const [rows, setRows] = useRows<Record<string, string>>(usersUrl);
  const [form, setForm] = useState({ email: "", name: "", password: "Admin123456", role: "merchant_admin", merchantId: "default" });
  const [selected, setSelected] = useState<Record<string, string> | null>(null);
  return <div className="split"><section><div className="toolbar wrap"><input placeholder="按商户ID筛选" value={filters.merchantId} onChange={(e) => setFilters({ merchantId: e.target.value })} /><button onClick={async () => setRows(await loadRows(usersUrl))}>筛选</button></div><div className="toolbar wrap">{["email","name","password","merchantId"].map((k) => <input key={k} placeholder={label(k)} value={(form as any)[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />)}<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="merchant_admin">{label("merchant_admin")}</option><option value="merchant_operator">{label("merchant_operator")}</option><option value="platform_admin">{label("platform_admin")}</option></select><button onClick={async () => { await api("/api/admin/users", { method: "POST", body: JSON.stringify(form) }); setRows(await loadRows(usersUrl)); }}>新增用户</button></div><Table rows={rows} columns={["email", "name", "role", "merchantId", "status"]} onRow={setSelected} /></section><section>{selected ? <Editor title="用户设置" value={{ name: selected.name, status: selected.status, role: selected.role, merchantId: selected.merchantId || "", password: "" }} fields={["name", "status", "role", "merchantId", "password"]} selects={{ status: ["active", "disabled"], role: ["platform_admin", "merchant_admin", "merchant_operator"] }} onSave={async (patch) => { if (!patch.password) delete patch.password; await api(`/api/admin/users/${selected.id}`, { method: "PATCH", body: JSON.stringify(patch) }); setRows(await loadRows(usersUrl)); }} /> : <p>选择用户后可停用、改角色或重置密码。</p>}</section></div>;
}
