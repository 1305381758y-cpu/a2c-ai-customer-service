import { useEffect, useMemo, useState } from "react";

import { api, loadRows, useRows, withQuery } from "../app/api.js";
import type { A2CAccount, Conversation, Filters, UnreadSummary } from "../types.js";
import { useClientPagination } from "../ui/Pagination.js";
import { notify } from "../ui/toast.js";

type DraftCustomer = {
  customerPhone: string;
  nickname: string;
};

export function useMerchantConversationsController({ handoffs = false }: { handoffs?: boolean }) {
  const [accounts, setAccounts] = useRows<A2CAccount>("/api/merchant/a2c/accounts");
  const [unread, setUnread] = useState<UnreadSummary[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<A2CAccount | null>(null);
  const [filters, setFiltersState] = useState<Filters>({ status: handoffs ? "human_handoff" : "", handoffStatus: handoffs ? "pending" : "", language: "", limit: "100" });
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [draftCustomer, setDraftCustomer] = useState<DraftCustomer | null>(null);
  const [newCustomer, setNewCustomer] = useState<DraftCustomer>({ customerPhone: "", nickname: "" });
  const [customerCollapsed, setCustomerCollapsed] = useState(false);
  const [accountKeyword, setAccountKeywordState] = useState("");
  const [accountStatus, setAccountStatusState] = useState("");
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

  const setAccountKeyword = (value: string) => {
    setAccountKeywordState(value);
    accountPager.setPage(1);
  };
  const setAccountStatus = (value: string) => {
    setAccountStatusState(value);
    accountPager.setPage(1);
  };
  const setFilters = (next: Filters) => {
    setFiltersState(handoffs ? { ...next, status: "human_handoff", handoffStatus: "pending" } : next);
  };
  const syncAccounts = async () => {
    await api("/api/merchant/a2c/accounts/sync", { method: "POST" });
    await reloadAccounts();
  };
  const onConversationCreated = async (conversation: Conversation) => {
    setSelected(conversation);
    setDraftCustomer(null);
    setNewCustomer({ customerPhone: "", nickname: "" });
    await reloadRows();
    await reloadUnread();
  };

  return {
    accountKeyword,
    accountPager,
    accountStatus,
    accountUnread,
    accounts,
    conversationUnread,
    customerCollapsed,
    draftCustomer,
    error,
    exportBase: "/api/merchant/conversations/export",
    exportFilters: selectedAccount ? { ...filters, a2cAccountPhone: selectedAccount.apiPhone, limit: "50000" } : undefined,
    filteredAccounts,
    filters,
    newCustomer,
    onConversationCreated,
    openConversation,
    openNewCustomer,
    pager,
    reloadRows,
    reloadUnread,
    selected,
    selectedAccount,
    setAccountKeyword,
    setAccountStatus,
    setCustomerCollapsed,
    setFilters,
    setNewCustomer,
    setSelected,
    setSelectedAccount,
    syncAccounts,
    togglePin,
    markAllRead,
    totalRows: rows.length
  };
}
