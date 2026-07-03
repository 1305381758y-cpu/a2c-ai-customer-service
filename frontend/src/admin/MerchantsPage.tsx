import { useEffect, useState } from "react";

import { api, loadRows, useRows, withQuery } from "../app/api.js";
import type { Merchant, MerchantCountry, User } from "../types.js";
import { CountryPresetDatalist, Table } from "../ui/components.js";
import { inferCountryProfile } from "../ui/formatters.js";
import { MerchantCreatePanel, type MerchantCreateForm } from "./MerchantCreatePanel.js";
import { MerchantDetailPanel } from "./MerchantDetailPanel.js";

export function MerchantsPage() {
  const [rows, setRows] = useRows<Merchant>("/api/admin/merchants");
  const [form, setForm] = useState<MerchantCreateForm>({
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
      <MerchantCreatePanel form={form} createdLogin={createdLogin} onCreate={createMerchant} onUpdate={update} onUpdateCountryName={updateCountryName} />
      <Table rows={rows} columns={["name", "status", "id"]} onRow={setSelected} selectedKey={selected?.id} rowKey={(row) => row.id} />
    </section>
    <MerchantDetailPanel
      selected={selected}
      selectedCountry={selectedCountry}
      selectedUser={selectedUser}
      users={users}
      userForm={userForm}
      onClearSelection={() => { setSelected(null); setSelectedCountry(null); setSelectedUser(null); }}
      onReloadDetail={reloadMerchantDetail}
      onSelectUser={setSelectedUser}
      onSetMerchant={setSelected}
      onSetRows={setRows}
      onSetSelectedCountry={setSelectedCountry}
      onSetUserForm={setUserForm}
    />
  </div>;
}
