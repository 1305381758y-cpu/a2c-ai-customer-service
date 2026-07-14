import { useState } from "react";
import { Plus } from "lucide-react";

import { api } from "../app/api.js";
import type { Merchant, MerchantCountry, User } from "../types.js";
import { AsyncButton, CountrySettingsEditor, Editor, Table } from "../ui/components.js";
import { coercePatch } from "../ui/form.js";
import { notify } from "../ui/toast.js";

export type MerchantUser = User & { status?: string };

type MerchantDetailPanelProps = {
  merchant: Merchant;
  detailError: string;
  selectedCountry: MerchantCountry | null;
  users: MerchantUser[];
  selectedUser: MerchantUser | null;
  onMerchantChange: (merchant: Merchant | null) => void;
  onCountryChange: (country: MerchantCountry | null) => void;
  onUserChange: (user: MerchantUser | null) => void;
  onReloadMerchants: () => Promise<void>;
  onReloadDetail: (merchantId?: string) => Promise<void>;
};

export function MerchantDetailPanel({
  merchant,
  detailError,
  selectedCountry,
  users,
  selectedUser,
  onMerchantChange,
  onCountryChange,
  onUserChange,
  onReloadMerchants,
  onReloadDetail
}: MerchantDetailPanelProps) {
  const [userForm, setUserForm] = useState({ email: "", name: "", password: "Merchant123456", role: "merchant_admin" });

  return <div className="merchant-detail">
    {detailError && <div className="error" role="alert">商户详情加载失败：{detailError}</div>}
    <Editor title="商户设置" value={merchant} fields={["name", "status"]} selects={{ status: ["active", "disabled"] }} deleteTitle="确认彻底删除商户？" deleteDetail={`商户“${merchant.name}”的账号、国家、客户、会话、样本、知识库、素材和配置都会被删除，此操作不可恢复。`} deleteConfirmText="彻底删除" onSave={async (patch) => {
      const saved = await api<Merchant>(`/api/admin/merchants/${merchant.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      onMerchantChange(saved);
      await onReloadMerchants();
    }} onDelete={merchant.id === "default" ? undefined : async () => {
      await api(`/api/admin/merchants/${merchant.id}`, { method: "DELETE" });
      onMerchantChange(null);
      onCountryChange(null);
      onUserChange(null);
      await onReloadMerchants();
      notify("success", "商户已彻底删除");
    }} />
    <div className="form-section">
      <h4>国家 / 市场配置</h4>
      {selectedCountry ? <CountrySettingsEditor value={selectedCountry} onSave={async (patch) => {
        const saved = await api<MerchantCountry>(`/api/admin/merchants/${merchant.id}/countries/${selectedCountry.id}`, { method: "PATCH", body: JSON.stringify(coercePatch(patch)) });
        onCountryChange(saved);
        await onReloadDetail(merchant.id);
      }} /> : <div className="empty-state compact">暂无国家配置</div>}
    </div>
    <div className="form-section">
      <h4>商户登录账号</h4>
      <div className="toolbar wrap compact-create">
        <input placeholder="登录邮箱" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
        <input placeholder="姓名" value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
        <input placeholder="初始密码" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
        <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}><option value="merchant_admin">商户管理员</option><option value="merchant_operator">商户运营</option></select>
        <AsyncButton disabled={!userForm.email.trim() || !userForm.name.trim() || userForm.password.length < 8} busyText="新增中..." onClick={async () => {
          await api("/api/admin/users", { method: "POST", body: JSON.stringify({ ...userForm, merchantId: merchant.id }) });
          setUserForm({ email: "", name: "", password: "Merchant123456", role: "merchant_admin" });
          await onReloadDetail(merchant.id);
        }}><Plus size={16}/>新增账号</AsyncButton>
      </div>
      <Table rows={users} columns={["email", "name", "role", "status"]} onRow={onUserChange} selectedKey={selectedUser?.id} rowKey={(row) => row.id} />
      {selectedUser && <Editor onClose={() => onUserChange(null)} title="账号设置" value={{ name: selectedUser.name, role: selectedUser.role, status: selectedUser.status || "active", merchantId: merchant.id, password: "" }} fields={["name", "role", "status", "password"]} selects={{ role: ["merchant_admin", "merchant_operator"], status: ["active", "disabled"] }} deleteTitle="确认删除后台账号？" deleteDetail={`删除账号 ${selectedUser.email} 后，该用户将不能再登录后台。商户数据不会删除。`} deleteConfirmText="删除账号" onSave={async (patch) => {
        if (!patch.password) delete patch.password;
        const saved = await api<MerchantUser>(`/api/admin/users/${selectedUser.id}`, { method: "PATCH", body: JSON.stringify({ ...patch, merchantId: merchant.id }) });
        onUserChange(saved);
        await onReloadDetail(merchant.id);
      }} onDelete={async () => {
        await api(`/api/admin/users/${selectedUser.id}`, { method: "DELETE" });
        onUserChange(null);
        await onReloadDetail(merchant.id);
        notify("success", "账号已删除");
      }} />}
    </div>
    <div className="notice">A2C、智能供应商和 TG 密钥仍在“配置”页维护；这里负责商户、国家和登录账号的增删改查。</div>
  </div>;
}
