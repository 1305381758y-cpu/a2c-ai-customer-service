import { useEffect, useState } from "react";

import { api, loadRows, withQuery } from "../app/api.js";
import type { Merchant, MerchantCountry, User } from "../types.js";
import { CountryPresetDatalist, Table } from "../ui/components.js";
import { MerchantDetailPanel, type MerchantUser } from "./MerchantDetailPanel.js";
import { buildCreateMerchantPayload, createDefaultMerchantForm, MerchantCreatePanel } from "./MerchantCreatePanel.js";

export function MerchantsPage() {
  const [rows, setRows] = useState<Merchant[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState("");
  const [form, setForm] = useState(createDefaultMerchantForm);
  const [createdLogin, setCreatedLogin] = useState("");
  const [selected, setSelected] = useState<Merchant | null>(null);
  const [countries, setCountries] = useState<MerchantCountry[]>([]);
  const [users, setUsers] = useState<MerchantUser[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<MerchantCountry | null>(null);
  const [selectedUser, setSelectedUser] = useState<MerchantUser | null>(null);
  const reloadMerchants = async () => {
    setRowsLoading(true);
    setRowsError(null);
    try {
      setRows(await loadRows("/api/admin/merchants"));
    } catch (err) {
      setRows([]);
      setRowsError(err instanceof Error ? err.message : "商户列表加载失败，请稍后重试。");
    } finally {
      setRowsLoading(false);
    }
  };
  useEffect(() => { void reloadMerchants(); }, []);
  const reloadMerchantDetail = async (merchantId = selected?.id) => {
    setDetailError("");
    if (!merchantId) {
      setCountries([]);
      setUsers([]);
      return;
    }
    const [nextCountries, nextUsers] = await Promise.all([
      loadRows<MerchantCountry>(`/api/admin/merchants/${merchantId}/countries`),
      loadRows<MerchantUser>(withQuery("/api/admin/users", { merchantId }))
    ]);
    setCountries(nextCountries);
    setUsers(nextUsers);
    setSelectedCountry((current) => nextCountries.find((item) => item.id === current?.id) || nextCountries[0] || null);
    setSelectedUser((current) => nextUsers.find((item) => item.id === current?.id) || null);
  };
  useEffect(() => {
    reloadMerchantDetail().catch((err) => setDetailError(err instanceof Error ? err.message : "商户详情加载失败"));
  }, [selected?.id]);
  const createMerchant = async () => {
    const payload = buildCreateMerchantPayload(form);
    const result = await api<{ merchant?: Merchant; adminUser?: User } | Merchant>("/api/admin/merchants", { method: "POST", body: JSON.stringify(payload) });
    const merchant = "merchant" in result ? result.merchant : result;
    setCreatedLogin(payload.adminUser ? `商户已创建。商户端登录邮箱：${payload.adminUser.email}；初始密码：${payload.adminUser.password}` : "商户已创建，暂未创建商户端登录账号。");
    setSelected(merchant || null);
    setForm({ ...form, name: "", adminEmail: "", adminName: "", adminPassword: "Merchant123456" });
    await reloadMerchants();
    if (merchant?.id) await reloadMerchantDetail(merchant.id);
  };
  return <div className="split merchant-admin-layout"><CountryPresetDatalist />
    <section className="work-panel">
      <MerchantCreatePanel form={form} createdLogin={createdLogin} onChange={setForm} onCreate={createMerchant} />
      <Table rows={rows} columns={["name", "status", "id"]} onRow={setSelected} selectedKey={selected?.id} rowKey={(row) => row.id} loading={rowsLoading} error={rowsError} onRetry={reloadMerchants} emptyTitle="暂无商户" emptyDetail="创建商户后，会在这里显示商户列表。" />
    </section>
    <section className="detail-panel">{selected ? <MerchantDetailPanel merchant={selected} detailError={detailError} selectedCountry={selectedCountry} users={users} selectedUser={selectedUser} onMerchantChange={setSelected} onCountryChange={setSelectedCountry} onUserChange={setSelectedUser} onReloadMerchants={reloadMerchants} onReloadDetail={reloadMerchantDetail} /> : <div className="empty-state">选择商户后可修改名称和状态。新增商户时可以同时创建国家和商户端登录账号。</div>}</section>
  </div>;
}
