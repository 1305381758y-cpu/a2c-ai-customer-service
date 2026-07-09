import React, { useEffect, useMemo, useState } from "react";

import { api, loadRows, useRows, withQuery } from "../app/api.js";
import { ConversationAccountList } from "./ConversationAccountList.js";
import { ConversationCustomerList } from "./ConversationCustomerList.js";
import { ConversationDetail } from "./ConversationDetail.js";
import { PlatformConversations } from "./PlatformConversations.js";
import { ProactiveConversationDetail } from "./ProactiveConversationDetail.js";
import type { A2CAccount, Conversation, Filters, UnreadSummary } from "../types.js";
import { AsyncButton, FilterBar } from "../ui/components.js";
import { countryLabel, formatConversationDate, label, languageName, type TimeDisplayMode } from "../ui/formatters.js";
import { useClientPagination } from "../ui/Pagination.js";
import { notify, notifyExportStarted } from "../ui/toast.js";
import { conversationExportFilters, conversationTimeZoneFor, filterConversationAccounts } from "./ConversationPageHelpers.js";

export function Conversations({ platform = false, handoffs = false, timeMode }: { platform?: boolean; handoffs?: boolean; timeMode: TimeDisplayMode }) {
  return platform ? <PlatformConversations handoffs={handoffs} /> : <MerchantConversations handoffs={handoffs} timeMode={timeMode} />;
}

function MerchantConversations({ handoffs = false, timeMode }: { handoffs?: boolean; timeMode: TimeDisplayMode }) {
  const [accounts, setAccounts] = useRows<A2CAccount>("/api/merchant/a2c/accounts");
  const [unread, setUnread] = useState<UnreadSummary[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<A2CAccount | null>(null);
  const [filters, setFiltersState] = useState<Filters>({ status: handoffs ? "human_handoff" : "", handoffStatus: handoffs ? "pending" : "", language: "", limit: "100" });
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [draftCustomer, setDraftCustomer] = useState<{ customerPhone: string; nickname: string } | null>(null);
  const [newCustomer, setNewCustomer] = useState({ customerPhone: "", nickname: "" });
  const [customerCollapsed, setCustomerCollapsed] = useState(false);
  const [accountKeyword, setAccountKeyword] = useState("");
  const [accountStatus, setAccountStatus] = useState("");
  const [error, setError] = useState("");
  const conversationTimeZone = conversationTimeZoneFor(selectedAccount, timeMode);
  const rowsUrl = selectedAccount
    ? withQuery("/api/merchant/conversations", { ...filters, timeZone: conversationTimeZone, a2cAccountPhone: selectedAccount.apiPhone })
    : "";
  const [rows, setRows] = useState<Conversation[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const pager = useClientPagination(rows, 10);
  const filteredAccounts = useMemo(() => {
    return filterConversationAccounts(accounts, { keyword: accountKeyword, status: accountStatus });
  }, [accounts, accountKeyword, accountStatus]);
  const accountPager = useClientPagination(filteredAccounts, 10);

  useEffect(() => {
    if (!selectedAccount && accounts.length) setSelectedAccount(accounts.find((account) => account.enabled) || accounts[0]);
  }, [accounts, selectedAccount]);
  useEffect(() => {
    const loadUnread = () => api<{ rows: UnreadSummary[] }>("/api/merchant/conversations/unread-summary").then((res) => setUnread(res.rows)).catch(() => null);
    loadUnread();
    const timer = window.setInterval(loadUnread, 4000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setSelected(null);
    setDraftCustomer(null);
  }, [selectedAccount?.apiPhone]);

  const reloadAccounts = async () => {
    setAccounts(await loadRows("/api/merchant/a2c/accounts"));
    accountPager.setPage(1);
  };
  const reloadUnread = async () => {
    const res = await api<{ rows: UnreadSummary[] }>("/api/merchant/conversations/unread-summary");
    setUnread(res.rows);
  };
  const reloadRows = async () => {
    if (!selectedAccount || !rowsUrl) {
      setRows([]);
      setTotalRows(0);
      setRowsError(null);
      return;
    }
    setRowsLoading(true);
    setRowsError(null);
    try {
      const result = await api<{ rows: Conversation[]; total: number }>(rowsUrl);
      const nextRows = result.rows;
      setRows(nextRows);
      setTotalRows(result.total);
      setSelected((current) => current ? nextRows.find((row) => row.id === current.id) || current : current);
    } catch (err) {
      setRows([]);
      setTotalRows(0);
      setRowsError(err instanceof Error ? err.message : "客户会话加载失败，请稍后重试。");
    } finally {
      setRowsLoading(false);
    }
  };
  useEffect(() => { void reloadRows(); }, [rowsUrl]);
  useEffect(() => {
    if (!selectedAccount) return;
    let cancelled = false;
    const pollRows = async () => {
      const result = await api<{ rows: Conversation[]; total: number }>(rowsUrl).catch(() => null);
      if (!result || cancelled) return;
      const nextRows = result.rows;
      setRowsError(null);
      setRows(nextRows);
      setTotalRows(result.total);
      setSelected((current) => current ? nextRows.find((row) => row.id === current.id) || current : current);
    };
    const timer = window.setInterval(() => void pollRows(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [rowsUrl, selectedAccount?.apiPhone]);
  const markAllRead = async () => {
    if (!selectedAccount) return;
    const result = await api<{ updated: number }>("/api/merchant/conversations/read-all", {
      method: "POST",
      body: JSON.stringify({ a2cAccountPhone: selectedAccount.apiPhone })
    });
    notify("success", "已全部标为已读", `已处理 ${result.updated} 个未读会话`);
    await reloadRows();
    await reloadUnread();
  };
  const togglePin = async (conversation: Conversation) => {
    const pinned = !conversation.pinnedAt;
    await api(`/api/merchant/conversations/${conversation.id}/pin`, { method: "POST", body: JSON.stringify({ pinned }) });
    notify("success", pinned ? "会话已置顶" : "已取消置顶");
    await reloadRows();
  };
  const accountUnread = (apiPhone: string) => unread.find((item) => item.a2cAccountPhone === apiPhone)?.unreadCount || 0;
  const conversationUnread = (conversationId: string) => unread.flatMap((item) => item.conversations).find((item) => item.conversationId === conversationId)?.unreadCount || 0;
  const markConversationRead = async (conversationId: string) => {
    await api(`/api/merchant/conversations/${conversationId}/read`, { method: "POST" });
    await reloadRows();
    await reloadUnread();
  };
  const openConversation = (conversation: Conversation) => {
    setSelected(conversation);
    setDraftCustomer(null);
    if (conversationUnread(conversation.id) > 0 || conversation.unreadCount > 0) {
      void markConversationRead(conversation.id).catch(() => null);
    }
  };
  const selectedUnread = selected ? conversationUnread(selected.id) : 0;
  useEffect(() => {
    if (!selected?.id || selectedUnread <= 0) return;
    void markConversationRead(selected.id).catch(() => null);
  }, [selected?.id, selectedUnread]);
  const openNewCustomer = () => {
    setError("");
    const customerPhone = newCustomer.customerPhone.trim();
    if (!customerPhone) {
      setError("请先填写客户号码。");
      return;
    }
    setSelected(null);
    setDraftCustomer({ customerPhone, nickname: newCustomer.nickname.trim() });
  };

  const exportFilters = conversationExportFilters(filters, conversationTimeZone, selectedAccount);
  const setFilters = (next: Filters) => {
    setFiltersState(handoffs ? { ...next, status: "human_handoff", handoffStatus: "pending" } : next);
  };
  const exportBase = "/api/merchant/conversations/export";

  return <div className={`conversation-workspace ${customerCollapsed ? "customers-collapsed" : ""}`}>
    <ConversationAccountList
      accounts={accounts}
      filteredAccounts={filteredAccounts}
      selectedAccount={selectedAccount}
      accountKeyword={accountKeyword}
      accountStatus={accountStatus}
      pager={accountPager}
      accountUnread={accountUnread}
      countryLabel={countryLabel}
      onKeywordChange={(value) => {
        setAccountKeyword(value);
        accountPager.setPage(1);
      }}
      onStatusChange={(value) => {
        setAccountStatus(value);
        accountPager.setPage(1);
      }}
      onSelectAccount={setSelectedAccount}
      renderSyncButton={(children) => <AsyncButton className="sync-compact-button" busyText="同步中..." onClick={async () => { await api("/api/merchant/a2c/accounts/sync", { method: "POST" }); await reloadAccounts(); }}>{children}</AsyncButton>}
    />
    <ConversationCustomerList
      handoffs={handoffs}
      collapsed={customerCollapsed}
      selectedAccount={selectedAccount}
      selectedConversation={selected}
      exportBase={exportBase}
      exportFilters={exportFilters}
      pager={pager}
      totalRows={totalRows}
      loading={rowsLoading}
      loadError={rowsError}
      newCustomer={newCustomer}
      error={error}
      accountUnread={accountUnread}
      conversationUnread={conversationUnread}
      countryLabel={countryLabel}
      languageName={languageName}
      label={label}
      formatConversationDate={formatConversationDate}
      onToggleCollapsed={() => setCustomerCollapsed(!customerCollapsed)}
      onMarkAllRead={markAllRead}
      onTogglePin={togglePin}
      onOpenConversation={openConversation}
      onNewCustomerChange={setNewCustomer}
      onOpenNewCustomer={openNewCustomer}
      onRetry={reloadRows}
      onExportStarted={notifyExportStarted}
      renderFilterBar={() => <FilterBar filters={filters} setFilters={setFilters} fields={handoffs ? ["language", "startAt", "endAt", "limit"] : ["status", "handoffStatus", "language", "startAt", "endAt", "limit"]} selects={{ status: ["", "active", "human_handoff"], handoffStatus: ["", "pending", "processing", "done"] }} onApply={reloadRows} />}
    />
    <section className="chat-pane">{selected ? <ConversationDetail conversation={selected} refresh={async () => { await reloadRows(); await reloadUnread(); }} onDeleted={async () => { setSelected(null); await reloadRows(); await reloadUnread(); }} /> : selectedAccount && draftCustomer ? <ProactiveConversationDetail account={selectedAccount} target={draftCustomer} onCreated={async (conversation) => { setSelected(conversation); setDraftCustomer(null); setNewCustomer({ customerPhone: "", nickname: "" }); await reloadRows(); await reloadUnread(); }} /> : <div className="empty-chat export-empty-state"><h3>选择客户开始对话</h3><p>左侧选择客服账号，中间选择客户；也可以使用顶部工具条一键导出全部线上对话用于复盘、训练或交给同事分析。</p></div>}</section>
  </div>;
}
