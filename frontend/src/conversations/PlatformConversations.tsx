import React, { useEffect, useState } from "react";

import { api, withQuery } from "../app/api.js";
import type { Conversation, Filters } from "../types.js";
import { FilterBar, Table } from "../ui/components.js";
import { Pagination } from "../ui/Pagination.js";
import { notifyExportStarted } from "../ui/toast.js";
import { ConversationDetail } from "./ConversationDetail.js";
import { ConversationExportBar } from "./ConversationExport.js";

export function PlatformConversations({ handoffs = false }: { handoffs?: boolean }) {
  const base = "/api/admin/conversations";
  const [filters, setFiltersState] = useState<Filters>({ merchantId: "", status: handoffs ? "human_handoff" : "", handoffStatus: handoffs ? "pending" : "", language: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const rowsUrl = withQuery(base, { ...filters, limit: String(pageSize), offset: String((page - 1) * pageSize) });
  const [rows, setRows] = useState<Conversation[]>([]);
  const [total, setTotal] = useState(0);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pager = { rows, page, pageSize, total, totalPages, setPage: (value: number) => setPage(Math.min(Math.max(1, value), totalPages)), setPageSize: (value: number) => { setPageSize(value); setPage(1); } };
  const [selected, setSelected] = useState<Conversation | null>(null);
  const reload = async () => {
    setRowsLoading(true);
    setRowsError(null);
    try {
      const result = await api<{ rows: Conversation[]; total: number }>(rowsUrl);
      setRows(result.rows);
      setTotal(result.total);
    } catch (err) {
      setRows([]);
      setTotal(0);
      setRowsError(err instanceof Error ? err.message : "会话加载失败，请稍后重试。");
    } finally {
      setRowsLoading(false);
    }
  };
  useEffect(() => { void reload(); }, [rowsUrl]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const setFilters = (next: Filters) => {
    setFiltersState(handoffs ? { ...next, status: "human_handoff", handoffStatus: "pending" } : next);
    setPage(1);
  };
  return <div className={selected ? "split conversation-admin-layout work-split" : "single-column work-split"}>
    <section className="work-panel">
      <ConversationExportBar base="/api/admin/conversations/export" scopedFilters={{ ...filters, limit: "50000" }} scopedLabel="当前筛选" onExportStarted={notifyExportStarted} />
      {handoffs && <div className="conversation-list-toolbar"><span className="status-pill warning">只显示待接管</span></div>}
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        fields={handoffs ? ["merchantId", "language", "startAt", "endAt"] : ["merchantId", "status", "handoffStatus", "language", "startAt", "endAt"]}
        selects={{ status: ["", "active", "human_handoff"], handoffStatus: ["", "pending", "processing", "done"] }}
        onApply={reload}
      />
      <div className="table-helper">当前筛选共 {total} 个会话，当前页展示 {rows.length} 个。</div>
      <Table
        rows={rows}
        columns={["merchantId", "countryName", "customerPhone", "nickname", "language", "stage", "status", "handoffStatus"]}
        onRow={setSelected}
        selectedKey={selected?.id}
        rowKey={(row) => row.id}
        loading={rowsLoading}
        error={rowsError}
        onRetry={reload}
        emptyTitle={handoffs ? "暂无待接管会话" : "暂无会话"}
        emptyDetail={handoffs ? "客户触发人工接管后会显示在这里。" : "客户发送消息后，会话会显示在这里。"}
      />
      <Pagination pager={pager} />
    </section>
    {selected && <section className="detail-panel">
      <ConversationDetail
        platform
        conversation={selected}
        refresh={async () => {
          const result = await api<{ rows: Conversation[]; total: number }>(rowsUrl);
          setRows(result.rows);
          setTotal(result.total);
        }}
        onDeleted={async () => {
          setSelected(null);
          await reload();
        }}
      />
    </section>}
  </div>;
}
