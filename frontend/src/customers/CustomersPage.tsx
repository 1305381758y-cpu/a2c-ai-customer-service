import React, { useState } from "react";

import { api, loadRows, useRows, withQuery } from "../app/api.js";
import { ConversationExportBar } from "../conversations/ConversationExport.js";
import { CustomerConversationHistory } from "./CustomerConversationHistory.js";
import type { Conversation, Customer, Filters, MerchantCountry } from "../types.js";
import { ConfirmActionButton, FilterBar, Table } from "../ui/components.js";
import { countryLabel, formatConversationDate, label, languageName } from "../ui/formatters.js";
import { Pagination, useClientPagination } from "../ui/Pagination.js";
import { notify, notifyExportStarted } from "../ui/toast.js";

type CustomersPageProps = {
  platform?: boolean;
  renderConversation: (conversation: Conversation, reloadHistory: () => Promise<void>) => React.ReactNode;
};

export function CustomersPage({ platform = false, renderConversation }: CustomersPageProps) {
  const base = platform ? "/api/admin/customers" : "/api/merchant/customers";
  const [countries] = useRows<MerchantCountry>("/api/merchant/countries");
  const defaultRange = todayBeijingDateRange();
  const [filters, setFilters] = useState<Filters>({ merchantId: "", countryId: "", status: "", language: "", q: "", startAt: defaultRange.startAt, endAt: defaultRange.endAt, limit: "50000" });
  const queryFilters = platform ? filters : { countryId: filters.countryId, status: filters.status, language: filters.language, q: filters.q, startAt: filters.startAt, endAt: filters.endAt, limit: filters.limit };
  const rowsUrl = withQuery(base, queryFilters);
  const [rows, setRows] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pager = useClientPagination(rows, 20);
  const [selected, setSelected] = useState<Customer | null>(null);
  const compactColumns = platform
    ? ["merchantId", "countryName", "customerKey", "lastA2CAccountPhone", "stage", "conversationCount", "lastSeenAt"]
    : ["countryName", "customerKey", "lastA2CAccountPhone", "stage", "conversationCount", "lastSeenAt"];
  const fullColumns = platform
    ? ["merchantId", "countryName", "customerKey", "nickname", "lastA2CAccountPhone", "language", "stage", "extractedPhone", "extractedTelegram", "extractedWhatsApp", "status", "conversationCount", "lastSeenAt"]
    : ["countryName", "customerKey", "nickname", "lastA2CAccountPhone", "language", "stage", "extractedPhone", "extractedTelegram", "extractedWhatsApp", "status", "conversationCount", "lastSeenAt"];
  const columns = selected ? compactColumns : fullColumns;
  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api<{ rows: Customer[]; total: number }>(rowsUrl);
      setRows(result.rows);
      setTotal(result.total);
      pager.setPage(1);
    } catch (err) {
      setRows([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : "客户数据加载失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };
  React.useEffect(() => { void reload(); }, [rowsUrl]);
  const deleteSelected = async () => {
    if (!selected) return;
    const url = platform
      ? `/api/admin/customers/${encodeURIComponent(selected.customerKey)}?merchantId=${encodeURIComponent(selected.merchantId || "default")}`
      : `/api/merchant/customers/${encodeURIComponent(selected.customerKey)}`;
    const result = await api<{ conversationsDeleted: number; messagesDeleted: number }>(url, { method: "DELETE" });
    notify("success", "客户已彻底删除", `已删除 ${result.conversationsDeleted} 个会话、${result.messagesDeleted} 条消息`);
    setSelected(null);
    await reload();
  };
  const exportBase = platform ? "/api/admin/conversations/export" : "/api/merchant/conversations/export";
  const scopedExportFilters = platform
    ? { merchantId: filters.merchantId, countryId: filters.countryId, status: filters.status, language: filters.language, startAt: filters.startAt, endAt: filters.endAt, limit: "50000" }
    : { countryId: filters.countryId, status: filters.status, language: filters.language, startAt: filters.startAt, endAt: filters.endAt, limit: "50000" };

  return (
    <div className={selected ? "split work-split" : "single-column work-split"}>
      <section className="work-panel customer-list-panel">
        <div className="customer-export-top">
          <ConversationExportBar base={exportBase} scopedFilters={scopedExportFilters} scopedLabel="当前筛选" onExportStarted={notifyExportStarted} />
        </div>
        <div className="table-helper">默认筛选北京时间今天有过消息或更新的客户；右上角可切换页面时间显示为北京时间或国家时间。可搜索客户账号、昵称、接收账号、手机号、TG/WhatsApp。当前筛选共 {total} 个客户。</div>
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          fields={platform ? ["merchantId", "q", "countryId", "status", "language", "startAt", "endAt", "limit"] : ["q", "countryId", "status", "language", "startAt", "endAt", "limit"]}
          selects={{ countryId: ["", ...countries.map((country) => country.id)], status: ["", "active", "human_handoff"] }}
          onApply={reload}
        />
        <Table
          rows={pager.rows}
          columns={columns}
          onRow={setSelected}
          selectedKey={selected?.id}
          rowKey={(row) => row.id}
          loading={loading}
          error={error}
          onRetry={reload}
          emptyTitle="暂无客户数据"
          emptyDetail="当前筛选条件下没有客户。可以调整时间、状态或搜索条件后重试。"
        />
        <Pagination pager={pager} />
      </section>
      {selected && (
        <section className="detail-panel customer-detail-panel">
          <div>
            <div className="detail-title-row">
              <div>
                <h3>{selected.customerKey}</h3>
                <p>{countryLabel(selected.countryName)} · {selected.nickname || "无昵称"} · {label(selected.status)} · {languageName(selected.language)}</p>
              </div>
              <ConfirmActionButton
                className="danger"
                busyText="删除中..."
                title="确认彻底删除客户？"
                detail={`客户 ${selected.customerKey} 的所有会话、聊天记录、记忆和接管记录都会一起删除，此操作不可恢复。`}
                confirmText="彻底删除"
                onConfirm={deleteSelected}
              >
                删除客户
              </ConfirmActionButton>
            </div>
            <div className="form-grid">
              <label>首次接收账号<input readOnly value={selected.firstA2CAccountPhone || ""} /></label>
              <label>最近接收账号<input readOnly value={selected.lastA2CAccountPhone || ""} /></label>
              <label>手机号<input readOnly value={selected.extractedPhone || ""} /></label>
              <label>Telegram<input readOnly value={selected.extractedTelegram || ""} /></label>
              <label>WhatsApp<input readOnly value={selected.extractedWhatsApp || ""} /></label>
              <label>会话数<input readOnly value={String(selected.conversationCount || 0)} /></label>
              <label>最近会话ID<input readOnly value={selected.lastConversationId || ""} /></label>
            </div>
            <p>客户档案由回调自动创建和更新；删除客户会同步清理该客户所有会话、消息、记忆和接管记录。</p>
          </div>
          <CustomerConversationHistory
            platform={platform}
            customer={selected}
            loadRows={loadRows}
            withQuery={withQuery}
            helpers={{ formatConversationDate, countryLabel, languageName, label }}
            renderConversation={renderConversation}
          />
        </section>
      )}
    </div>
  );
}

function todayBeijingDateRange() {
  const now = new Date();
  const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const today = `${beijing.getUTCFullYear()}-${pad(beijing.getUTCMonth() + 1)}-${pad(beijing.getUTCDate())}`;
  beijing.setUTCDate(beijing.getUTCDate() + 1);
  const tomorrow = `${beijing.getUTCFullYear()}-${pad(beijing.getUTCMonth() + 1)}-${pad(beijing.getUTCDate())}`;
  return { startAt: `${today}T00:00:00`, endAt: `${tomorrow}T00:00:00` };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
