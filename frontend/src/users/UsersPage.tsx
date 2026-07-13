import React, { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";

import { api, loadRows, useRows, withQuery } from "../app/api.js";
import type { Filters, Merchant } from "../types.js";
import { AsyncButton, Editor, Table } from "../ui/components.js";
import { coercePatch } from "../ui/form.js";
import { label } from "../ui/formatters.js";
import { notify } from "../ui/toast.js";

export function UsersPage() {
  const [merchants] = useRows<Merchant>("/api/admin/merchants");
  const [filters, setFilters] = useState<Filters>({ merchantId: "" });
  const usersUrl = withQuery("/api/admin/users", filters);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", name: "", password: "Admin123456", role: "merchant_admin", merchantId: "default" });
  const [selected, setSelected] = useState<Record<string, string> | null>(null);
  const reload = async () => {
    setRowsLoading(true);
    setRowsError(null);
    try {
      setRows(await loadRows(usersUrl));
    } catch (err) {
      setRows([]);
      setRowsError(err instanceof Error ? err.message : "用户列表加载失败，请稍后重试。");
    } finally {
      setRowsLoading(false);
    }
  };
  useEffect(() => { void reload(); }, [usersUrl]);
  const createUser = async () => {
    await api("/api/admin/users", { method: "POST", body: JSON.stringify(form) });
    setForm({ ...form, email: "", name: "", password: "Admin123456" });
    await reload();
    notify("success", "用户已新增");
  };
  return <div className="split work-split">
    <section className="work-panel">
      <div className="toolbar wrap">
        <select value={filters.merchantId} onChange={(e) => setFilters({ merchantId: e.target.value })}><option value="">全部商户</option>{merchants.map((merchant) => <option value={merchant.id} key={merchant.id}>{merchant.name}</option>)}</select>
        <AsyncButton busyText="筛选中..." onClick={reload}><Search size={16}/>筛选</AsyncButton>
      </div>
      <div className="toolbar wrap compact-create">
        {["email", "name", "password"].map((key) => <input key={key} placeholder={label(key)} value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />)}
        <select value={form.merchantId} onChange={(e) => setForm({ ...form, merchantId: e.target.value })}><option value="">不绑定商户</option>{merchants.map((merchant) => <option value={merchant.id} key={merchant.id}>{merchant.name}</option>)}</select>
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="merchant_admin">{label("merchant_admin")}</option>
          <option value="merchant_operator">{label("merchant_operator")}</option>
          <option value="platform_admin">{label("platform_admin")}</option>
        </select>
        <AsyncButton disabled={!form.email.trim() || !form.name.trim() || form.password.length < 8} busyText="新增中..." onClick={createUser}><Plus size={16}/>新增用户</AsyncButton>
      </div>
      <Table rows={rows} columns={["email", "name", "role", "merchantId", "status"]} onRow={setSelected} selectedKey={selected?.id} rowKey={(row) => row.id} loading={rowsLoading} error={rowsError} onRetry={reload} emptyTitle="暂无用户" emptyDetail="新增平台管理员、商户管理员或商户运营后，会显示在这里。" />
    </section>
    <section className="detail-panel">
      {selected ? <Editor
        title="用户设置"
        value={{ name: selected.name, status: selected.status, role: selected.role, merchantId: selected.merchantId || "", password: "" }}
        fields={["name", "status", "role", "merchantId", "password"]}
        selects={{ status: ["active", "disabled"], role: ["platform_admin", "merchant_admin", "merchant_operator"] }}
        deleteTitle="确认删除后台用户？"
        deleteDetail={`删除用户 ${selected.email} 后，该账号将无法登录后台。商户和客户数据不会删除。`}
        deleteConfirmText="删除用户"
        onSave={async (patch) => {
          if (!patch.password) delete patch.password;
          const saved = await api<Record<string, string>>(`/api/admin/users/${selected.id}`, { method: "PATCH", body: JSON.stringify(coercePatch(patch)) });
          setSelected(saved);
          await reload();
        }}
        onDelete={async () => {
          await api(`/api/admin/users/${selected.id}`, { method: "DELETE" });
          setSelected(null);
          await reload();
          notify("success", "用户已删除");
        }}
      /> : <div className="empty-state">选择用户后可停用、改角色、重置密码或删除账号。</div>}
    </section>
  </div>;
}
