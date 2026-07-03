import { useMemo, useState } from "react";

import type { A2CAccount, MerchantCountry } from "../types.js";
import { countryLabel } from "../ui/formatters.js";
import { Pagination, useClientPagination } from "../ui/Pagination.js";
import { A2CAccountCard } from "./A2CAccountCard.js";

export function A2CAccountsSection({
  accounts,
  countries,
  platform,
  onToggleAccount,
}: {
  accounts: A2CAccount[];
  countries: MerchantCountry[];
  platform: boolean;
  onToggleAccount: (account: A2CAccount) => Promise<void>;
}) {
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [countryId, setCountryId] = useState("");
  const filteredAccounts = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return accounts.filter((account) => {
      const haystack = [account.apiPhone, account.verifiedName, account.countryName, account.countryCode, account.wabaId].join(" ").toLowerCase();
      if (normalizedKeyword && !haystack.includes(normalizedKeyword)) return false;
      if (status === "enabled" && !account.enabled) return false;
      if (status === "disabled" && account.enabled) return false;
      if (countryId && account.countryId !== countryId) return false;
      return true;
    });
  }, [accounts, countryId, keyword, status]);
  const pager = useClientPagination(filteredAccounts, 12);

  return <div className="memory">
    <div className="account-section-head">
      <div>
        <h3>A2C客服账号与邀请码池</h3>
        <p>客服账号会自动归属到商户国家。每个客服账号可以绑定多个邀请码，客户注册后邀请码会从可用池里移除。</p>
      </div>
      <span>已保存 {accounts.length} 个账号</span>
    </div>
    <div className="account-filter-bar">
      <label>搜索账号<input value={keyword} onChange={(event) => { setKeyword(event.target.value); pager.setPage(1); }} placeholder="手机号、名称、WABA ID" /></label>
      <label>状态<select value={status} onChange={(event) => { setStatus(event.target.value); pager.setPage(1); }}><option value="">全部状态</option><option value="enabled">启用</option><option value="disabled">停用</option></select></label>
      <label>国家<select value={countryId} onChange={(event) => { setCountryId(event.target.value); pager.setPage(1); }}><option value="">全部国家</option>{countries.map((country) => <option key={country.id} value={country.id}>{countryLabel(country.name)}</option>)}</select></label>
    </div>
    <div className="config-account-meta">当前筛选 {filteredAccounts.length} 个账号，显示第 {(pager.page - 1) * pager.pageSize + (pager.total ? 1 : 0)} - {Math.min(pager.page * pager.pageSize, pager.total)} 个。</div>
    <div className="account-grid">
      {pager.rows.map((account) => <A2CAccountCard key={account.id} account={account} countries={countries} platform={platform} onToggle={() => onToggleAccount(account)} />)}
      {!accounts.length && <div className="empty-state">填写并保存 A2C 密钥后，点击“同步A2C客服账号”。同步成功后这里会出现每个客服账号的邀请码池。</div>}
      {accounts.length > 0 && !filteredAccounts.length && <div className="empty-state">没有符合筛选条件的客服账号，换个手机号、状态或国家试试。</div>}
    </div>
    <Pagination pager={pager} />
  </div>;
}
