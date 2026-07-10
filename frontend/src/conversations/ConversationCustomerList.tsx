import type React from "react";
import { CheckCheck, ChevronsLeft, ChevronsRight, FileText, Pin, PinOff } from "lucide-react";
import type { A2CAccount, Conversation, Filters } from "../types.js";
import { Pagination, type PagerState } from "../ui/Pagination.js";
import { ConversationExportBar, downloadConversationExport, EXPORT_ALL_FILTERS } from "./ConversationExport.js";

type ConversationPager = PagerState & { rows: Conversation[] };

type DraftCustomer = {
  customerPhone: string;
  nickname: string;
};

type ConversationCustomerListProps = {
  handoffs: boolean;
  collapsed: boolean;
  selectedAccount: A2CAccount | null;
  selectedConversation: Conversation | null;
  exportBase: string;
  exportFilters?: Filters;
  pager: ConversationPager;
  totalRows: number;
  loading?: boolean;
  loadError?: string | null;
  newCustomer: DraftCustomer;
  error: string;
  accountUnread: (apiPhone: string) => number;
  conversationUnread: (conversationId: string) => number;
  countryLabel: (value: unknown) => string;
  languageName: (value: string) => string;
  label: (value: string) => string;
  formatConversationDate: (value: string, country?: unknown) => string;
  onToggleCollapsed: () => void;
  onMarkAllRead: () => Promise<void>;
  onTogglePin: (conversation: Conversation) => Promise<void>;
  onOpenConversation: (conversation: Conversation) => void;
  onNewCustomerChange: (value: DraftCustomer) => void;
  onOpenNewCustomer: () => void;
  onRetry?: () => Promise<void> | void;
  onExportStarted: (format: "csv" | "jsonl") => void;
  renderFilterBar: () => React.ReactNode;
};

export function ConversationCustomerList({
  handoffs,
  collapsed,
  selectedAccount,
  selectedConversation,
  exportBase,
  exportFilters,
  pager,
  totalRows,
  loading = false,
  loadError = null,
  newCustomer,
  error,
  accountUnread,
  conversationUnread,
  countryLabel,
  languageName,
  label,
  formatConversationDate,
  onToggleCollapsed,
  onMarkAllRead,
  onTogglePin,
  onOpenConversation,
  onNewCustomerChange,
  onOpenNewCustomer,
  onRetry,
  onExportStarted,
  renderFilterBar
}: ConversationCustomerListProps) {
  const selectedAccountUnread = selectedAccount ? accountUnread(selectedAccount.apiPhone) : 0;

  return <section className="customer-list">
    <div className="panel-title">
      <h3>客户</h3>
      {!collapsed && <span>{selectedAccount ? `${countryLabel(selectedAccount.countryName)} · ${selectedAccount.apiPhone}` : "未选择客服账号"}</span>}
      <button className="ghost icon-only" title={collapsed ? "展开客户列表" : "收起客户列表"} onClick={onToggleCollapsed}>{collapsed ? <ChevronsRight size={16}/> : <ChevronsLeft size={16}/>}</button>
    </div>
    {!collapsed && <>
      <div className="customer-list-controls">
        <div className="conversation-list-toolbar">
          <button className="export-primary compact-action" onClick={() => downloadConversationExport(exportBase, EXPORT_ALL_FILTERS, "csv", onExportStarted)}><FileText size={15}/>导出全部</button>
          {exportFilters && <button className="ghost compact-action" onClick={() => downloadConversationExport(exportBase, exportFilters, "csv", onExportStarted)}><FileText size={15}/>导出当前账号</button>}
          <button className="ghost" disabled={!selectedAccount || !selectedAccountUnread} onClick={onMarkAllRead}><CheckCheck size={15}/>一键已读</button>
          {handoffs && <span className="status-pill warning">只显示待接管</span>}
        </div>
        <details className="conversation-tools export-tool">
          <summary>更多导出格式</summary>
          <ConversationExportBar base={exportBase} scopedFilters={exportFilters} scopedLabel={selectedAccount ? "当前客服账号" : "当前账号"} compact onExportStarted={onExportStarted} />
        </details>
        <details className="conversation-tools">
          <summary>筛选客户</summary>
          {renderFilterBar()}
        </details>
        <details className="conversation-tools">
          <summary>主动新建对话</summary>
          <div className="proactive-panel compact">
            <input placeholder="客户号码 / A2C 客户标识" value={newCustomer.customerPhone} onChange={(event) => onNewCustomerChange({ ...newCustomer, customerPhone: event.target.value })} />
            <input placeholder="昵称，可选" value={newCustomer.nickname} onChange={(event) => onNewCustomerChange({ ...newCustomer, nickname: event.target.value })} />
            <button disabled={!selectedAccount} onClick={onOpenNewCustomer}>打开对话框</button>
            {error && <div className="error">{error}</div>}
          </div>
        </details>
        <div className="table-helper">当前筛选共 {totalRows} 个客户会话，列表展示前 {pager.total} 个。</div>
      </div>
      <div className="stack-list conversation-list">
        {loading && <div className="empty-state">客户会话加载中...</div>}
        {!loading && loadError && <div className="empty-state error-state"><strong>客户会话加载失败</strong><span>{loadError}</span>{onRetry && <button className="ghost" onClick={() => void onRetry()}>重新加载</button>}</div>}
        {!loading && !loadError && pager.rows.map((row) => {
          const unreadCount = conversationUnread(row.id);
          return <div key={row.id} role="button" tabIndex={0} className={`conversation-row ${row.pinnedAt ? "pinned" : ""} ${unreadCount > 0 ? "unread" : ""} ${selectedConversation?.id === row.id ? "active" : ""}`} onClick={() => onOpenConversation(row)} onKeyDown={(event) => { if (event.key === "Enter") onOpenConversation(row); }}>
            <span className="conversation-row-main">
              <strong title={row.nickname || row.customerPhone}>{row.pinnedAt && <Pin size={13}/>} {row.nickname || row.customerPhone}</strong>
              {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
              <button className="ghost icon-only pin-button" title={row.pinnedAt ? "取消置顶" : "置顶会话"} onClick={(event) => { event.stopPropagation(); void onTogglePin(row); }}>{row.pinnedAt ? <PinOff size={13}/> : <Pin size={13}/>}</button>
            </span>
            <span className="conversation-row-phone" title={row.customerPhone}>{row.customerPhone || "未记录客户号"}</span>
            <span className="conversation-row-meta">
              <span>{countryLabel(row.countryName)}</span>
              <span>{languageName(row.language)}</span>
              <span>{label(row.stage)}</span>
              <span>{label(row.handoffStatus)}</span>
              {row.updatedAt && <span>{formatConversationDate(row.updatedAt, row.countryCode || row.countryName || row.countryId)}</span>}
            </span>
          </div>;
        })}
        {!loading && !loadError && !totalRows && <div className="empty-state">这个客服账号下还没有客户会话。可以等待客户发消息，或主动打开新客户对话框。</div>}
      </div>
      <Pagination pager={pager} />
    </>}
  </section>;
}
