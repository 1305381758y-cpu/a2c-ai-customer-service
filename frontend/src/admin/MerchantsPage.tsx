import { useEffect, useState } from "react";

import { useRows } from "../app/api.js";
import type { Merchant, MerchantCountry, User } from "../types.js";
import { CountryPresetDatalist, Table } from "../ui/components.js";
import { inferCountryProfile } from "../ui/formatters.js";
import { createMerchantFromForm, loadAdminMerchants, loadMerchantDetail } from "./adminMerchantsApi.js";
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
    const detail = await loadMerchantDetail(merchantId);
    setCountries(detail.countries);
    setUsers(detail.users);
    setSelectedCountry((current) => detail.countries.find((item) => item.id === current?.id) || detail.countries[0] || null);
    setSelectedUser((current) => detail.users.find((item) => item.id === current?.id) || null);
  };
  useEffect(() => { reloadMerchantDetail().catch(() => null); }, [selected?.id]);
  const createMerchant = async () => {
    const { merchant, loginMessage } = await createMerchantFromForm(form);
    setCreatedLogin(loginMessage);
    setSelected(merchant || null);
    setForm({ ...form, name: "", adminEmail: "", adminName: "", adminPassword: "Merchant123456" });
    setRows(await loadAdminMerchants());
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
