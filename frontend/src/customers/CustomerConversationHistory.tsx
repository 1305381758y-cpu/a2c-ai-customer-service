import { useEffect, useState } from "react";
import type React from "react";
import type { Conversation, Customer } from "../types.js";
import { Pagination, useClientPagination } from "../ui/Pagination.js";
import { ClosePanelButton } from "../ui/components.js";

type CustomerConversationHistoryProps = {
  platform: boolean;
  customer: Customer;
  loadRows: <T>(url: string) => Promise<T[]>;
  withQuery: (base: string, filters: Record<string, string>) => string;
  renderConversation: (conversation: Conversation, reload: () => Promise<void>) => React.ReactNode;
  helpers: {
    formatConversationDate: (value: string, country?: unknown) => string;
    countryLabel: (value: unknown) => string;
    languageName: (value: unknown) => string;
    label: (value: string) => string;
  };
};

export function CustomerConversationHistory({
  platform,
  customer,
  loadRows,
  withQuery,
  renderConversation,
  helpers
}: CustomerConversationHistoryProps) {
  const base = platform ? "/api/admin/conversations" : "/api/merchant/conversations";
  const filters = platform
    ? { merchantId: customer.merchantId, customerPhone: customer.customerKey, limit: "50000" }
    : { customerPhone: customer.customerKey, limit: "50000" };
  const rowsUrl = withQuery(base, filters);
  const [rows, setRows] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [historyClosed, setHistoryClosed] = useState(false);
  const pager = useClientPagination(rows, 10);

  const reload = async () => {
    setRows(await loadRows<Conversation>(rowsUrl));
    pager.setPage(1);
  };

  useEffect(() => {
    setHistoryClosed(false);
    setSelected(null);
  }, [customer.customerKey, customer.merchantId]);

  useEffect(() => {
    let cancelled = false;
    loadRows<Conversation>(rowsUrl)
      .then((nextRows) => {
        if (!cancelled) setRows(nextRows);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [rowsUrl, loadRows]);

  useEffect(() => {
    if (!historyClosed && !selected && rows.length) setSelected(rows[0]);
    if (selected && !rows.some((row) => row.id === selected.id)) setSelected(rows[0] || null);
  }, [rows, selected, historyClosed]);

  return <div className="customer-conversation-history">
    <div className="section-title-row">
      <div><h3>该客户全部会话</h3><p>按最近消息排序，包含这个客户在不同客服账号下产生的所有对话。</p></div>
      <span className="status-pill neutral">共 {rows.length} 条</span>
    </div>
    <div className="customer-conversation-grid">
      <div className="customer-conversation-list">
        {pager.rows.map((row) => <button key={row.id} type="button" className={`customer-conversation-item ${selected?.id === row.id ? "active" : ""}`} onClick={() => { setHistoryClosed(false); setSelected(row); }}>
          <span className="customer-conversation-item-main">
            <strong>{row.a2cAccountPhone || "未识别客服账号"}</strong>
            <small>{row.updatedAt ? helpers.formatConversationDate(row.updatedAt, row.countryCode || row.countryName || row.countryId) : "未知时间"}</small>
          </span>
          <span className="customer-conversation-tags">
            <span>{helpers.countryLabel(row.countryName)}</span>
            <span>{helpers.languageName(row.language)}</span>
            <span>{helpers.label(row.stage)}</span>
            <span>{helpers.label(row.handoffStatus)}</span>
          </span>
        </button>)}
        {!pager.rows.length && <div className="empty-state compact">该客户暂无会话记录</div>}
        <Pagination pager={pager} />
      </div>
      {selected ? <div className="nested-detail-view"><div className="section-heading-row"><strong>会话详情</strong><ClosePanelButton onClose={() => { setSelected(null); setHistoryClosed(true); }} /></div>{renderConversation(selected, reload)}</div> : <div className="empty-state">选择一条会话查看完整聊天记录</div>}
    </div>
  </div>;
}
