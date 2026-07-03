import { useState } from "react";
import { Plus } from "lucide-react";

import { useRows } from "../app/api.js";
import type { Filters, User } from "../types.js";
import { AsyncButton, Editor, Table } from "../ui/components.js";
import { label } from "../ui/formatters.js";
import { notify } from "../ui/toast.js";
import { adminUsersUrl, createAdminUser, deleteAdminUser, loadAdminUsers, updateAdminUser } from "./adminUsersApi.js";

const defaultForm = {
  email: "",
  name: "",
  password: "Admin123456",
  role: "merchant_admin",
  merchantId: "default"
};

export function UsersPage() {
  const [filters, setFilters] = useState<Filters>({ merchantId: "" });
  const usersUrl = adminUsersUrl(filters);
  const [rows, setRows] = useRows<User>(usersUrl);
  const [form, setForm] = useState(defaultForm);
  const [selected, setSelected] = useState<User | null>(null);
  const reload = async () => setRows(await loadAdminUsers(filters));

  const create = async () => {
    await createAdminUser(form);
    setForm({ ...defaultForm, merchantId: form.merchantId });
    await reload();
    notify("success", "用户已新增");
  };

  const remove = selected ? async () => {
    if (!window.confirm(`确认删除账号 ${selected.email}？`)) return;
    await deleteAdminUser(selected.id);
    setSelected(null);
    await reload();
    notify("success", "用户已删除");
  } : undefined;

  return <div className="split">
    <section>
      <div className="toolbar wrap">
        <input placeholder="按商户ID筛选" value={filters.merchantId} onChange={(e) => setFilters({ merchantId: e.target.value })} />
        <AsyncButton busyText="筛选中..." onClick={reload}>筛选</AsyncButton>
      </div>
      <div className="toolbar wrap">
        {(["email", "name", "password", "merchantId"] as const).map((key) => (
          <input key={key} placeholder={label(key)} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
        ))}
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="merchant_admin">{label("merchant_admin")}</option>
          <option value="merchant_operator">{label("merchant_operator")}</option>
          <option value="platform_admin">{label("platform_admin")}</option>
        </select>
        <AsyncButton disabled={!form.email.trim() || !form.name.trim() || form.password.length < 8} busyText="新增中..." onClick={create}><Plus size={16}/>新增用户</AsyncButton>
      </div>
      <Table rows={rows} columns={["email", "name", "role", "merchantId", "status"]} onRow={setSelected} selectedKey={selected?.id} rowKey={(row) => row.id} />
    </section>
    <section>
      {selected ? <Editor
        title="用户设置"
        value={{ name: selected.name, status: (selected as User & { status?: string }).status || "active", role: selected.role, merchantId: selected.merchantId || "", password: "" }}
        fields={["name", "status", "role", "merchantId", "password"]}
        selects={{ status: ["active", "disabled"], role: ["platform_admin", "merchant_admin", "merchant_operator"] }}
        onSave={async (patch) => {
          await updateAdminUser(selected.id, patch);
          await reload();
          notify("success", "用户设置已保存");
        }}
        onDelete={remove}
      /> : <p>选择用户后可停用、改角色、重置密码或删除账号。</p>}
    </section>
  </div>;
}
