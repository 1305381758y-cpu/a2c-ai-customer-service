import type React from "react";
import { RefreshCw } from "lucide-react";
import type { A2CAccount } from "../types.js";
import { AccountPagination, type PagerState } from "../ui/Pagination.js";

type AccountPager = PagerState & { rows: A2CAccount[] };

type ConversationAccountListProps = {
  accounts: A2CAccount[];
  filteredAccounts: A2CAccount[];
  selectedAccount: A2CAccount | null;
  accountKeyword: string;
  accountStatus: string;
  pager: AccountPager;
  accountUnread: (apiPhone: string) => number;
  countryLabel: (value: unknown) => string;
  onKeywordChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onSelectAccount: (account: A2CAccount) => void;
  renderSyncButton: (children: React.ReactNode) => React.ReactNode;
};

export function ConversationAccountList({
  accounts,
  filteredAccounts,
  selectedAccount,
  accountKeyword,
  accountStatus,
  pager,
  accountUnread,
  countryLabel,
  onKeywordChange,
  onStatusChange,
  onSelectAccount,
  renderSyncButton
}: ConversationAccountListProps) {
  return <section className="account-list">
    <div className="account-list-head">
      <div>
        <h3>客服账号</h3>
        <span>{accounts.length ? `共 ${accounts.length} 个` : "未同步"}</span>
      </div>
      {renderSyncButton(<><RefreshCw size={14}/>同步</>)}
    </div>
    {accounts.length ? <>
      <div className="account-list-filter">
        <input
          value={accountKeyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          placeholder="搜索账号/名称"
        />
        <select value={accountStatus} onChange={(event) => onStatusChange(event.target.value)}>
          <option value="">全部</option>
          <option value="enabled">启用</option>
          <option value="disabled">停用</option>
        </select>
      </div>
      <div className="account-list-meta">筛选 {filteredAccounts.length} 个 · 第 {pager.page}/{pager.totalPages} 页</div>
      <div className="stack-list account-scroll-list">
        {pager.rows.map((account) => {
          const unreadCount = accountUnread(account.apiPhone);
          return <button key={account.id} className={`list-item account-card ${selectedAccount?.id === account.id ? "active" : ""}`} onClick={() => onSelectAccount(account)}>
            <strong title={account.verifiedName || account.apiPhone}>
              {account.verifiedName || account.apiPhone}
              {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
            </strong>
            <span title={account.apiPhone}>{account.apiPhone}</span>
            <small>{countryLabel(account.countryName)} · {account.enabled ? "启用" : "停用"}</small>
          </button>;
        })}
        {!filteredAccounts.length && <div className="empty-state">没有符合筛选条件的客服账号。</div>}
      </div>
      <AccountPagination pager={pager} />
    </> : <div className="empty-state">配置 A2C 密钥后点击同步账号；同步后可从这里选择客服账号主动发消息。</div>}
  </section>;
}
