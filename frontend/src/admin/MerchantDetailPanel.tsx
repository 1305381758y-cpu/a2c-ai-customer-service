import { Plus } from "lucide-react";

import { api, loadRows } from "../app/api.js";
import type { Merchant, MerchantCountry, User } from "../types.js";
import { AsyncButton, CountrySettingsEditor, Editor, Table } from "../ui/components.js";
import { coercePatch } from "../ui/form.js";
import { notify } from "../ui/toast.js";

type UserForm = {
  email: string;
  name: string;
  password: string;
  role: string;
};

type MerchantDetailPanelProps = {
  selected: Merchant | null;
  selectedCountry: MerchantCountry | null;
  selectedUser: User | null;
  users: User[];
  userForm: UserForm;
  onClearSelection: () => void;
  onReloadDetail: (merchantId?: string) => Promise<void>;
  onSelectUser: (user: User | null) => void;
  onSetMerchant: (merchant: Merchant | null) => void;
  onSetRows: (rows: Merchant[]) => void;
  onSetSelectedCountry: (country: MerchantCountry | null) => void;
  onSetUserForm: (form: UserForm) => void;
};

export function MerchantDetailPanel({ selected, selectedCountry, selectedUser, users, userForm, onClearSelection, onReloadDetail, onSelectUser, onSetMerchant, onSetRows, onSetSelectedCountry, onSetUserForm }: MerchantDetailPanelProps) {
  if (!selected) return <section className="detail-panel"><div className="empty-state">选择商户后可修改名称和状态。新增商户时可以同时创建国家和商户端登录账号。</div></section>;

  return <section className="detail-panel"><div className="merchant-detail">
    <Editor title="商户设置" value={selected} fields={["name", "status"]} selects={{ status: ["active", "disabled"] }} onSave={async (patch) => {
      const saved = await api<Merchant>(`/api/admin/merchants/${selected.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      onSetMerchant(saved);
      onSetRows(await loadRows("/api/admin/merchants"));
    }} onDelete={selected.id === "default" ? undefined : async () => {
      if (!window.confirm(`确认彻底删除商户“${selected.name}”？该商户的账号、国家、客户、会话、样本、知识库、素材和配置都会被删除。`)) return;
      await api(`/api/admin/merchants/${selected.id}`, { method: "DELETE" });
      onClearSelection();
      onSetRows(await loadRows("/api/admin/merchants"));
      notify("success", "商户已彻底删除");
    }} />
    <div className="form-section">
      <h4>国家 / 市场配置</h4>
      {selectedCountry ? <CountrySettingsEditor value={selectedCountry} onSave={async (patch) => {
        const saved = await api<MerchantCountry>(`/api/admin/merchants/${selected.id}/countries/${selectedCountry.id}`, { method: "PATCH", body: JSON.stringify(coercePatch(patch)) });
        onSetSelectedCountry(saved);
        await onReloadDetail(selected.id);
      }} /> : <div className="empty-state compact">暂无国家配置</div>}
    </div>
    <div className="form-section">
      <h4>商户登录账号</h4>
      <div className="toolbar wrap compact-create">
        <input placeholder="登录邮箱" value={userForm.email} onChange={(e) => onSetUserForm({ ...userForm, email: e.target.value })} />
        <input placeholder="姓名" value={userForm.name} onChange={(e) => onSetUserForm({ ...userForm, name: e.target.value })} />
        <input placeholder="初始密码" value={userForm.password} onChange={(e) => onSetUserForm({ ...userForm, password: e.target.value })} />
        <select value={userForm.role} onChange={(e) => onSetUserForm({ ...userForm, role: e.target.value })}><option value="merchant_admin">商户管理员</option><option value="merchant_operator">商户运营</option></select>
        <AsyncButton disabled={!userForm.email.trim() || !userForm.name.trim() || userForm.password.length < 8} busyText="新增中..." onClick={async () => {
          await api("/api/admin/users", { method: "POST", body: JSON.stringify({ ...userForm, merchantId: selected.id }) });
          onSetUserForm({ email: "", name: "", password: "Merchant123456", role: "merchant_admin" });
          await onReloadDetail(selected.id);
        }}><Plus size={16}/>新增账号</AsyncButton>
      </div>
      <Table rows={users as any[]} columns={["email", "name", "role", "status"]} onRow={(row) => onSelectUser(row as User)} selectedKey={selectedUser?.id} rowKey={(row) => row.id} />
      {selectedUser && <Editor title="账号设置" value={{ name: selectedUser.name, role: selectedUser.role, status: (selectedUser as any).status || "active", merchantId: selected.id, password: "" }} fields={["name", "role", "status", "password"]} selects={{ role: ["merchant_admin", "merchant_operator"], status: ["active", "disabled"] }} onSave={async (patch) => {
        if (!patch.password) delete patch.password;
        const saved = await api<User>(`/api/admin/users/${selectedUser.id}`, { method: "PATCH", body: JSON.stringify({ ...patch, merchantId: selected.id }) });
        onSelectUser(saved);
        await onReloadDetail(selected.id);
      }} onDelete={async () => {
        if (!window.confirm(`确认删除账号 ${selectedUser.email}？`)) return;
        await api(`/api/admin/users/${selectedUser.id}`, { method: "DELETE" });
        onSelectUser(null);
        await onReloadDetail(selected.id);
        notify("success", "账号已删除");
      }} />}
    </div>
    <div className="notice">A2C、AI供应商 和 TG 密钥仍在“配置”页维护；这里负责商户、国家和登录账号的增删改查。</div>
  </div></section>;
}
