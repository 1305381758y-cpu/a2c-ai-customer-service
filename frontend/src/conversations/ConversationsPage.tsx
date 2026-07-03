import { useEffect, useMemo, useRef, useState } from "react";

import { api, loadRows, useRows, withQuery } from "../app/api.js";
import type { A2CAccount, ChatMessage, Conversation, ConversationReviewResponse, CustomerMemory, Filters, UnreadSummary } from "../types.js";
import { AsyncButton, FilterBar, Table } from "../ui/components.js";
import { countryLabel, formatConversationDate, formatTime, label, languageName, localizeSystemText, normalizeText, replyModeLabel, translateSystemMessage } from "../ui/formatters.js";
import { Pagination, useClientPagination } from "../ui/Pagination.js";
import { notify, notifyExportStarted } from "../ui/toast.js";
import { ConversationAccountList } from "./ConversationAccountList.js";
import { ConversationComposer } from "./ConversationComposer.js";
import { ConversationCustomerList } from "./ConversationCustomerList.js";
import { ConversationDetailHeader } from "./ConversationDetailHeader.js";
import { ConversationExportBar } from "./ConversationExport.js";
import { ConversationMemoryCard } from "./ConversationMemoryCard.js";
import { ConversationReviewCard } from "./ConversationReviewCard.js";
import { MessageTimeline } from "./MessageTimeline.js";
import { ProactiveConversationDetail } from "./ProactiveConversationDetail.js";

export function ConversationsPage({ platform = false, handoffs = false }: { platform?: boolean; handoffs?: boolean }) {
  return platform ? <PlatformConversations handoffs={handoffs} /> : <MerchantConversations handoffs={handoffs} />;
}

function PlatformConversations({ handoffs = false }: { handoffs?: boolean }) {
  const base = "/api/admin/conversations";
  const [filters, setFiltersState] = useState<Filters>({ merchantId: "", status: handoffs ? "human_handoff" : "", handoffStatus: handoffs ? "pending" : "", language: "", limit: "100" });
  const rowsUrl = withQuery(base, filters);
  const [rows, setRows] = useRows<Conversation>(rowsUrl);
  const pager = useClientPagination(rows, 20);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const reload = async () => { setRows(await loadRows(rowsUrl)); pager.setPage(1); };
  const setFilters = (next: Filters) => {
    setFiltersState(handoffs ? { ...next, status: "human_handoff", handoffStatus: "pending" } : next);
  };
  return <div className={selected ? "split conversation-admin-layout work-split" : "single-column work-split"}><section className="work-panel"><ConversationExportBar base="/api/admin/conversations/export" scopedFilters={{ ...filters, limit: "50000" }} scopedLabel="当前筛选" onExportStarted={notifyExportStarted} />{handoffs && <div className="conversation-list-toolbar"><span className="status-pill warning">只显示待接管</span></div>}<FilterBar filters={filters} setFilters={setFilters} fields={handoffs ? ["merchantId", "language", "limit"] : ["merchantId", "status", "handoffStatus", "language", "limit"]} selects={{ status: ["", "active", "human_handoff"], handoffStatus: ["", "pending", "processing", "done"] }} onApply={reload} /><Table rows={pager.rows} columns={["merchantId", "countryName", "customerPhone", "nickname", "language", "stage", "status", "handoffStatus"]} onRow={setSelected} selectedKey={selected?.id} rowKey={(row) => row.id} /><Pagination pager={pager} /></section>{selected && <section className="detail-panel"><ConversationDetail platform conversation={selected} refresh={async () => setRows(await loadRows(rowsUrl))} onDeleted={async () => { setSelected(null); await reload(); }} /></section>}</div>;
}

function MerchantConversations({ handoffs = false }: { handoffs?: boolean }) {
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
  const rowsUrl = selectedAccount
    ? withQuery("/api/merchant/conversations", { ...filters, a2cAccountPhone: selectedAccount.apiPhone })
    : "";
  const [rows, setRows] = useRows<Conversation>(rowsUrl || "/api/merchant/conversations?limit=1&a2cAccountPhone=__none__");
  const pager = useClientPagination(rows, 10);
  const filteredAccounts = useMemo(() => {
    const keyword = accountKeyword.trim().toLowerCase();
    return accounts.filter((account) => {
      const text = [account.verifiedName, account.apiPhone, account.countryName, account.countryCode, account.wabaId].join(" ").toLowerCase();
      if (keyword && !text.includes(keyword)) return false;
      if (accountStatus === "enabled" && !account.enabled) return false;
      if (accountStatus === "disabled" && account.enabled) return false;
      return true;
    });
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
    if (!selectedAccount) return;
    const nextRows = await loadRows<Conversation>(rowsUrl);
    setRows(nextRows);
    setSelected((current) => current ? nextRows.find((row) => row.id === current.id) || current : current);
  };
  useEffect(() => {
    if (!selectedAccount) return;
    let cancelled = false;
    const pollRows = async () => {
      const nextRows = await loadRows<Conversation>(rowsUrl).catch(() => null);
      if (!nextRows || cancelled) return;
      setRows(nextRows);
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

  const exportFilters = selectedAccount ? { ...filters, a2cAccountPhone: selectedAccount.apiPhone, limit: "50000" } : undefined;
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
      totalRows={rows.length}
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
      onExportStarted={notifyExportStarted}
      renderFilterBar={() => <FilterBar filters={filters} setFilters={setFilters} fields={handoffs ? ["language", "limit"] : ["status", "handoffStatus", "language", "limit"]} selects={{ status: ["", "active", "human_handoff"], handoffStatus: ["", "pending", "processing", "done"] }} onApply={reloadRows} />}
    />
    <section className="chat-pane">{selected ? <ConversationDetail conversation={selected} refresh={async () => { await reloadRows(); await reloadUnread(); }} onDeleted={async () => { setSelected(null); await reloadRows(); await reloadUnread(); }} /> : selectedAccount && draftCustomer ? <ProactiveConversationDetail account={selectedAccount} target={draftCustomer} onCreated={async (conversation) => { setSelected(conversation); setDraftCustomer(null); setNewCustomer({ customerPhone: "", nickname: "" }); await reloadRows(); await reloadUnread(); }} /> : <div className="empty-chat export-empty-state"><h3>选择客户开始对话</h3><p>左侧选择客服账号，中间选择客户；也可以使用顶部工具条一键导出全部线上对话用于复盘、训练或交给同事分析。</p></div>}</section>
  </div>;
}

export function ConversationDetail({ platform = false, conversation, refresh, onDeleted }: { platform?: boolean; conversation: Conversation; refresh: () => void; onDeleted?: () => Promise<void> | void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [memory, setMemory] = useState<CustomerMemory | null>(null);
  const [review, setReview] = useState<ConversationReviewResponse>({ review: null, items: [] });
  const [notes, setNotes] = useState("");
  const [send, setSend] = useState({ type: "text", content: "", url: "", caption: "", fileName: "" });
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const loadMessages = async () => {
    const res = await api<{ rows: ChatMessage[] }>(`${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversation.id}/messages?limit=100`);
    setMessages(res.rows);
  };
  useEffect(() => {
    if (!platform) api(`/api/merchant/conversations/${conversation.id}/read`, { method: "POST" }).then(() => refresh()).catch(() => null);
    loadMessages().catch(() => null);
    const timer = window.setInterval(() => loadMessages().catch(() => null), 3000);
    return () => window.clearInterval(timer);
  }, [conversation.id, platform]);
  useEffect(() => {
    const node = messagesRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length, conversation.id]);
  useEffect(() => { api<CustomerMemory>(`${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversation.id}/memory`).then((item) => { setMemory(item); setNotes(item.operatorNotes || ""); }).catch(() => { setMemory(null); setNotes(""); }); }, [conversation.id, platform]);
  const loadReview = async () => setReview(await api<ConversationReviewResponse>(`${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversation.id}/review`));
  useEffect(() => { loadReview().catch(() => setReview({ review: null, items: [] })); }, [conversation.id, platform]);
  const memoryUrl = `${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversation.id}/memory`;
  const lastOutboundPayload = [...messages].reverse().find((item) => item.direction === "outbound")?.rawPayload || {};
  const strictEnabled = lastOutboundPayload.strictFlowEnabled;
  const flowStep = conversation.flowStep || lastOutboundPayload.strictFlowStep || "未识别";
  const generate = async () => {
    setError("");
    setStatusMessage("正在生成对话复盘...");
    await api(`${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversation.id}/review`, { method: "POST" });
    await loadReview();
    setStatusMessage("对话复盘已生成。");
  };
  const apply = async (itemId: number) => {
    setError("");
    setStatusMessage("正在加入训练中心...");
    await api(`/api/merchant/conversations/${conversation.id}/review/apply`, { method: "POST", body: JSON.stringify({ itemId }) });
    await loadReview();
    setStatusMessage("候选内容已加入训练中心。");
    notify("success", "已加入训练中心");
  };
  return <div className="conversation-detail"><ConversationDetailHeader
    platform={platform}
    conversation={conversation}
    lastOutboundPayload={lastOutboundPayload}
    flowStep={flowStep}
    strictEnabled={strictEnabled}
    countryLabel={countryLabel}
    languageName={languageName}
    label={label}
    replyModeLabel={replyModeLabel}
    onHandoffStatusChange={async (handoffStatus) => {
      setError("");
      setStatusMessage("正在更新接管状态...");
      await api(`/api/merchant/handoffs/${conversation.id}`, { method: "PATCH", body: JSON.stringify({ handoffStatus }) });
      setStatusMessage("接管状态已更新。");
      await loadReview().catch(() => null);
      refresh();
    }}
    renderDeleteAction={() => <AsyncButton className="danger" busyText="删除中..." onClick={async () => { if (!window.confirm("确认彻底删除这个会话？聊天记录和接管记录会一起删除。")) return; await api(`${platform ? "/api/admin" : "/api/merchant"}/conversations/${conversation.id}`, { method: "DELETE" }); notify("success", "会话已彻底删除"); await onDeleted?.(); }}>删除会话</AsyncButton>}
  />{error && <div className="error" role="alert">{error}</div>}{statusMessage && <div className="notice" role="status">{statusMessage}</div>}<ConversationMemoryCard
    memory={memory}
    notes={notes}
    localizeSystemText={localizeSystemText}
    onNotesChange={setNotes}
    renderSaveAction={() => <AsyncButton busyText="保存中..." onClick={async () => { setError(""); const item = await api<CustomerMemory>(memoryUrl, { method: "PATCH", body: JSON.stringify({ operatorNotes: notes }) }); setMemory(item); setNotes(item.operatorNotes || ""); setStatusMessage("客户记忆已保存。"); }}>保存记忆</AsyncButton>}
  /><ConversationReviewCard platform={platform} data={review} onGenerate={generate} onApply={apply} renderAction={({ children, busyText, onClick }) => <AsyncButton onClick={onClick} busyText={busyText}>{children}</AsyncButton>} /><div className="chat-window" ref={messagesRef}>{messages.length ? <MessageTimeline messages={messages} helpers={{ formatDate: formatConversationDate, formatTime, label, languageName, normalizeText, replyModeLabel, translateSystemMessage }} /> : <div className="empty-state">暂无聊天记录</div>}</div>{!platform && <ConversationComposer value={send} onChange={setSend} renderSendAction={(disabled, children) => <AsyncButton disabled={disabled} busyText="发送中..." onClick={async () => { setError(""); setStatusMessage(""); try { await api(`/api/merchant/conversations/${conversation.id}/send`, { method: "POST", body: JSON.stringify(send) }); setSend({ ...send, content: "", url: "", caption: "" }); setStatusMessage("消息已发送。"); await loadMessages(); } catch (err) { setError(err instanceof Error ? err.message : "发送失败"); } }}>{children}</AsyncButton>} />}</div>;
}
