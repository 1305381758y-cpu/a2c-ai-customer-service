import React, { useState } from "react";

import { api, useRows, withQuery } from "../app/api.js";
import { ConversationExportBar } from "../conversations/ConversationExport.js";
import type { Conversation, Customer, Filters, MerchantCountry } from "../types.js";
import { FilterBar, Table } from "../ui/components.js";
import type { TimeDisplayMode } from "../ui/formatters.js";
import { Pagination } from "../ui/Pagination.js";
import { notify, notifyExportStarted } from "../ui/toast.js";
import { CustomerDetailPanel } from "./CustomerDetailPanel.js";
import { customerActiveCountry, customerColumns, customerExportFilters, customerQueryFilters, customerTimeLabelFor, customerTimeZoneFor, todayBeijingDateRange } from "./CustomerPageHelpers.js";

type CustomersPageProps = {
  platform?: boolean;
  timeMode: TimeDisplayMode;
  renderConversation: (conversation: Conversation, reloadHistory: () => Promise<void>) => React.ReactNode;
};

export function CustomersPage({ platform = false, timeMode, renderConversation }: CustomersPageProps) {
  const base = platform ? "/api/admin/customers" : "/api/merchant/customers";
  const [countries] = useRows<MerchantCountry>(platform ? "/api/admin/countries" : "/api/merchant/countries");
  const defaultRange = todayBeijingDateRange();
  const defaultFilters: Filters = { merchantId: "", countryId: "", status: "", language: "", q: "", startAt: defaultRange.startAt, endAt: defaultRange.endAt };
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const activeCountry = customerActiveCountry(countries, filters.countryId || "");
  const customerTimeZone = customerTimeZoneFor(platform, timeMode, activeCountry);
  const customerTimeLabel = customerTimeLabelFor(platform, timeMode, activeCountry);
  const queryFilters = customerQueryFilters(platform, filters, customerTimeZone, page, pageSize);
  const rowsUrl = withQuery(base, queryFilters);
  const [rows, setRows] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Customer | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pager = {
    rows,
    page,
    pageSize,
    total,
    totalPages,
    setPage: (nextPage: number) => setPage(Math.min(Math.max(nextPage, 1), totalPages)),
    setPageSize: (nextPageSize: number) => {
      setPageSize(nextPageSize);
      setPage(1);
    }
  };
  const columns = customerColumns(platform, Boolean(selected));
  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api<{ rows: Customer[]; total: number }>(rowsUrl);
      setRows(result.rows);
      setTotal(result.total);
    } catch (err) {
      setRows([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : "客户数据加载失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };
  React.useEffect(() => { void reload(); }, [rowsUrl]);
  React.useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
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
  const scopedExportFilters = customerExportFilters(platform, filters, customerTimeZone);

  return (
    <div className={selected ? "split work-split" : "single-column work-split"}>
      <section className="work-panel customer-list-panel">
        <div className="customer-export-top">
          <ConversationExportBar base={exportBase} scopedFilters={scopedExportFilters} scopedLabel="当前筛选" onExportStarted={notifyExportStarted} />
        </div>
        <div className="table-helper">默认筛选今天有过消息或更新的客户；当前筛选时间按{customerTimeLabel}解释。可搜索客户账号、昵称、接收账号、手机号、TG/WhatsApp。当前筛选共 {total} 个客户。</div>
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          fields={platform ? ["merchantId", "q", "countryId", "status", "language", "startAt", "endAt"] : ["q", "countryId", "status", "language", "startAt", "endAt"]}
          selects={{ countryId: ["", ...countries.map((country) => country.id)], status: ["", "active", "human_handoff"] }}
          resetValues={defaultFilters}
          onApply={async () => { setPage(1); await reload(); }}
        />
        <Table
          rows={rows}
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
        <CustomerDetailPanel platform={platform} customer={selected} onDelete={deleteSelected} renderConversation={renderConversation} />
      )}
    </div>
  );
}
