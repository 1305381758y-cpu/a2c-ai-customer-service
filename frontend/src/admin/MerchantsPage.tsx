import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { api, loadRows, useRows, withQuery } from "../app/api.js";
import type { Merchant, MerchantCountry, User } from "../types.js";
import { AsyncButton, CountryPresetDatalist, CountrySettingsEditor, Editor, Table } from "../ui/components.js";
import { coercePatch } from "../ui/form.js";
import { inferCountryProfile, languageName } from "../ui/formatters.js";
import { notify } from "../ui/toast.js";

export function MerchantsPage() {
  const [rows, setRows] = useRows<Merchant>("/api/admin/merchants");
  const [form, setForm] = useState({
    name: "",
    countryCode: "br",
    countryName: "巴西",
    defaultLanguage: "pt-BR",
    platformRegisterUrl: "",
    tgRegisterGuideUrl: "",
    requirePlatformAccount: "true",
    requirePhone: "true",
    requireTelegram: "true",
    requireWhatsApp: "false",
    adminEmail: "",
    adminName: "",
    adminPassword: "Merchant123456"
  });
  const [createdLogin, setCreatedLogin] = useState("");
  const [selected, setSelected] = useState<Merchant | null>(null);
  const [countries, setCountries] = useState<MerchantCountry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<MerchantCountry | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState({ email: "", name: "", password: "Merchant123456", role: "merchant_admin" });
  const update = (key: keyof typeof form, value: string) => setForm({ ...form, [key]: value });
  const updateCountryName = (value: string) => {
    const inferred = inferCountryProfile(value);
    setForm({ ...form, countryName: value, countryCode: inferred.code, defaultLanguage: inferred.defaultLanguage });
  };
  const reloadMerchantDetail = async (merchantId = selected?.id) => {
    if (!merchantId) {
      setCountries([]);
      setUsers([]);
      return;
    }
    const [nextCountries, nextUsers] = await Promise.all([
      loadRows<MerchantCountry>(`/api/admin/merchants/${merchantId}/countries`),
      loadRows<User>(withQuery("/api/admin/users", { merchantId }))
    ]);
    setCountries(nextCountries);
    setUsers(nextUsers);
    setSelectedCountry((current) => nextCountries.find((item) => item.id === current?.id) || nextCountries[0] || null);
    setSelectedUser((current) => nextUsers.find((item) => item.id === current?.id) || null);
  };
  useEffect(() => { reloadMerchantDetail().catch(() => null); }, [selected?.id]);
  const createMerchant = async () => {
    const payload = {
      name: form.name.trim(),
      country: {
        code: form.countryCode.trim() || "default",
        name: form.countryName.trim() || "默认国家",
        defaultLanguage: form.defaultLanguage,
        platformRegisterUrl: form.platformRegisterUrl.trim(),
        tgRegisterGuideUrl: form.tgRegisterGuideUrl.trim(),
        requirePlatformAccount: form.requirePlatformAccount === "true",
        requirePhone: form.requirePhone === "true",
        requireTelegram: form.requireTelegram === "true",
        requireWhatsApp: form.requireWhatsApp === "true"
      },
      adminUser: form.adminEmail.trim() ? {
        email: form.adminEmail.trim(),
        name: form.adminName.trim() || `${form.name.trim()}管理员`,
        password: form.adminPassword
      } : undefined
    };
    const result = await api<{ merchant?: Merchant; adminUser?: User } | Merchant>("/api/admin/merchants", { method: "POST", body: JSON.stringify(payload) });
    const merchant = "merchant" in result ? result.merchant : result;
    setCreatedLogin(payload.adminUser ? `商户已创建。商户端登录邮箱：${payload.adminUser.email}；初始密码：${payload.adminUser.password}` : "商户已创建，暂未创建商户端登录账号。");
    setSelected(merchant || null);
    setForm({ ...form, name: "", adminEmail: "", adminName: "", adminPassword: "Merchant123456" });
    setRows(await loadRows("/api/admin/merchants"));
    if (merchant?.id) await reloadMerchantDetail(merchant.id);
  };
  return <div className="split merchant-admin-layout"><CountryPresetDatalist />
    <section className="work-panel">
      <div className="merchant-create-panel">
        <div className="panel-heading">
          <div><h3>新增商户开户</h3><p>一次填写商户、国家/市场和商户端管理员账号，创建后商户可直接登录配置。</p></div>
        </div>
        <div className="form-section">
          <h4>商户基础信息</h4>
          <div className="form-grid compact-fields">
            <label>商户名称<input placeholder="例如：阿斯顿" value={form.name} onChange={(e) => update("name", e.target.value)} /></label>
          </div>
        </div>
        <div className="form-section">
          <h4>国家 / 市场</h4>
          <div className="form-grid compact-fields">
            <label>国家<input list="merchant-country-presets" placeholder="输入或选择国家，例如：巴西" value={form.countryName} onChange={(e) => updateCountryName(e.target.value)} /></label>
            <label>国家代码<input readOnly value={form.countryCode} /></label>
            <label>默认语言<input readOnly value={languageName(form.defaultLanguage)} /></label>
            <label>开户链接<input placeholder="开户链接，可后续在配置页修改" value={form.platformRegisterUrl} onChange={(e) => update("platformRegisterUrl", e.target.value)} /></label>
            <label>TG注册说明<input placeholder="Telegram 下载或注册说明链接" value={form.tgRegisterGuideUrl} onChange={(e) => update("tgRegisterGuideUrl", e.target.value)} /></label>
          </div>
          <div className="target-grid">
            {[
              ["requirePlatformAccount", "要求平台开户"],
              ["requirePhone", "要求手机号"],
              ["requireTelegram", "要求Telegram"],
              ["requireWhatsApp", "要求WhatsApp"]
            ].map(([key, text]) => <label key={key}>{text}<select value={(form as any)[key]} onChange={(e) => update(key as keyof typeof form, e.target.value)}><option value="true">需要</option><option value="false">不需要</option></select></label>)}
          </div>
        </div>
        <div className="form-section">
          <h4>商户端登录账号</h4>
          <div className="form-grid compact-fields">
            <label>登录邮箱<input placeholder="merchant@example.com" value={form.adminEmail} onChange={(e) => update("adminEmail", e.target.value)} /></label>
            <label>管理员姓名<input placeholder="默认用“商户名管理员”" value={form.adminName} onChange={(e) => update("adminName", e.target.value)} /></label>
            <label>初始密码<input value={form.adminPassword} onChange={(e) => update("adminPassword", e.target.value)} /></label>
          </div>
        </div>
        <div className="toolbar sticky-actions merchant-create-actions">
          <AsyncButton disabled={!form.name.trim() || Boolean(form.adminEmail.trim()) && form.adminPassword.length < 8} busyText="创建中..." onClick={createMerchant}><Plus size={16}/>创建商户</AsyncButton>
          {createdLogin && <span className="success-text">{createdLogin}</span>}
        </div>
      </div>
      <Table rows={rows} columns={["name", "status", "id"]} onRow={setSelected} selectedKey={selected?.id} rowKey={(row) => row.id} />
    </section>
    <section className="detail-panel">{selected ? <div className="merchant-detail">
      <Editor title="商户设置" value={selected} fields={["name", "status"]} selects={{ status: ["active", "disabled"] }} onSave={async (patch) => {
        const saved = await api<Merchant>(`/api/admin/merchants/${selected.id}`, { method: "PATCH", body: JSON.stringify(patch) });
        setSelected(saved);
        setRows(await loadRows("/api/admin/merchants"));
      }} onDelete={selected.id === "default" ? undefined : async () => {
        if (!window.confirm(`确认彻底删除商户“${selected.name}”？该商户的账号、国家、客户、会话、样本、知识库、素材和配置都会被删除。`)) return;
        await api(`/api/admin/merchants/${selected.id}`, { method: "DELETE" });
        setSelected(null);
        setSelectedCountry(null);
        setSelectedUser(null);
        await setRows(await loadRows("/api/admin/merchants"));
        notify("success", "商户已彻底删除");
      }} />
      <div className="form-section">
        <h4>国家 / 市场配置</h4>
        {selectedCountry ? <CountrySettingsEditor value={selectedCountry} onSave={async (patch) => {
          const saved = await api<MerchantCountry>(`/api/admin/merchants/${selected.id}/countries/${selectedCountry.id}`, { method: "PATCH", body: JSON.stringify(coercePatch(patch)) });
          setSelectedCountry(saved);
          await reloadMerchantDetail(selected.id);
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
            await api("/api/admin/users", { method: "POST", body: JSON.stringify({ ...userForm, merchantId: selected.id }) });
            setUserForm({ email: "", name: "", password: "Merchant123456", role: "merchant_admin" });
            await reloadMerchantDetail(selected.id);
          }}><Plus size={16}/>新增账号</AsyncButton>
        </div>
        <Table rows={users as any[]} columns={["email", "name", "role", "status"]} onRow={(row) => setSelectedUser(row as User)} selectedKey={selectedUser?.id} rowKey={(row) => row.id} />
        {selectedUser && <Editor title="账号设置" value={{ name: selectedUser.name, role: selectedUser.role, status: (selectedUser as any).status || "active", merchantId: selected.id, password: "" }} fields={["name", "role", "status", "password"]} selects={{ role: ["merchant_admin", "merchant_operator"], status: ["active", "disabled"] }} onSave={async (patch) => {
          if (!patch.password) delete patch.password;
          const saved = await api<User>(`/api/admin/users/${selectedUser.id}`, { method: "PATCH", body: JSON.stringify({ ...patch, merchantId: selected.id }) });
          setSelectedUser(saved);
          await reloadMerchantDetail(selected.id);
        }} onDelete={async () => {
          if (!window.confirm(`确认删除账号 ${selectedUser.email}？`)) return;
          await api(`/api/admin/users/${selectedUser.id}`, { method: "DELETE" });
          setSelectedUser(null);
          await reloadMerchantDetail(selected.id);
          notify("success", "账号已删除");
        }} />}
      </div>
      <div className="notice">A2C、AI供应商 和 TG 密钥仍在“配置”页维护；这里负责商户、国家和登录账号的增删改查。</div>
    </div> : <div className="empty-state">选择商户后可修改名称和状态。新增商户时可以同时创建国家和商户端登录账号。</div>}</section>
  </div>;
}
