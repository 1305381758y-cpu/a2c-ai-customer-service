import { AsyncButton, FilterBar } from "../ui/components.js";
import { countryLabel, formatConversationDate, label, languageName } from "../ui/formatters.js";
import { notifyExportStarted } from "../ui/toast.js";
import { ConversationAccountList } from "./ConversationAccountList.js";
import { ConversationCustomerList } from "./ConversationCustomerList.js";
import { ConversationDetail } from "./ConversationDetail.js";
import { ProactiveConversationDetail } from "./ProactiveConversationDetail.js";
import { useMerchantConversationsController } from "./useMerchantConversationsController.js";

export function MerchantConversationsPage({ handoffs = false }: { handoffs?: boolean }) {
  const controller = useMerchantConversationsController({ handoffs });

  return <div className={`conversation-workspace ${controller.customerCollapsed ? "customers-collapsed" : ""}`}>
    <ConversationAccountList
      accounts={controller.accounts}
      filteredAccounts={controller.filteredAccounts}
      selectedAccount={controller.selectedAccount}
      accountKeyword={controller.accountKeyword}
      accountStatus={controller.accountStatus}
      pager={controller.accountPager}
      accountUnread={controller.accountUnread}
      countryLabel={countryLabel}
      onKeywordChange={controller.setAccountKeyword}
      onStatusChange={controller.setAccountStatus}
      onSelectAccount={controller.setSelectedAccount}
      renderSyncButton={(children) => <AsyncButton className="sync-compact-button" busyText="同步中..." onClick={controller.syncAccounts}>{children}</AsyncButton>}
    />
    <ConversationCustomerList
      handoffs={handoffs}
      collapsed={controller.customerCollapsed}
      selectedAccount={controller.selectedAccount}
      selectedConversation={controller.selected}
      exportBase={controller.exportBase}
      exportFilters={controller.exportFilters}
      pager={controller.pager}
      totalRows={controller.totalRows}
      newCustomer={controller.newCustomer}
      error={controller.error}
      accountUnread={controller.accountUnread}
      conversationUnread={controller.conversationUnread}
      countryLabel={countryLabel}
      languageName={languageName}
      label={label}
      formatConversationDate={formatConversationDate}
      onToggleCollapsed={() => controller.setCustomerCollapsed(!controller.customerCollapsed)}
      onMarkAllRead={controller.markAllRead}
      onTogglePin={controller.togglePin}
      onOpenConversation={controller.openConversation}
      onNewCustomerChange={controller.setNewCustomer}
      onOpenNewCustomer={controller.openNewCustomer}
      onExportStarted={notifyExportStarted}
      renderFilterBar={() => <FilterBar filters={controller.filters} setFilters={controller.setFilters} fields={handoffs ? ["language", "limit"] : ["status", "handoffStatus", "language", "limit"]} selects={{ status: ["", "active", "human_handoff"], handoffStatus: ["", "pending", "processing", "done"] }} onApply={controller.reloadRows} />}
    />
    <section className="chat-pane">{controller.selected ? <ConversationDetail conversation={controller.selected} refresh={async () => { await controller.reloadRows(); await controller.reloadUnread(); }} onDeleted={async () => { controller.setSelected(null); await controller.reloadRows(); await controller.reloadUnread(); }} /> : controller.selectedAccount && controller.draftCustomer ? <ProactiveConversationDetail account={controller.selectedAccount} target={controller.draftCustomer} onCreated={controller.onConversationCreated} /> : <div className="empty-chat export-empty-state"><h3>选择客户开始对话</h3><p>左侧选择客服账号，中间选择客户；也可以使用顶部工具条一键导出全部线上对话用于复盘、训练或交给同事分析。</p></div>}</section>
  </div>;
}
