import React, { useEffect, useState } from "react";

import { api, useRows, withQuery } from "../app/api.js";
import type { Filters, MerchantCountry, OperationLog } from "../types.js";
import { FilterBar, ResourceErrorNotice, Table } from "../ui/components.js";
import { countryLabel, timeDisplayModeLabel, timeZoneForCountry, type TimeDisplayMode } from "../ui/formatters.js";
import { Pagination } from "../ui/Pagination.js";
import { todayDateTimeRange } from "../ui/timeFilters.js";

const ACTIONS = ["", "create", "update", "delete", "import", "sync", "restore", "enable", "send", "mark_read"];
const RESOURCES = ["", "merchant_config", "agent_profile", "script_flow", "training_material", "training_sample", "knowledge", "invite_code", "teacher_tg_link", "a2c_account", "country", "customer", "conversation", "user", "merchant", "intent_learning"];

export function OperationLogsPage({ platform = false, timeMode }: { platform?: boolean; timeMode: TimeDisplayMode }) {
  const base = platform ? "/api/admin/operation-logs" : "/api/merchant/operation-logs";
  const defaultFilters: Filters = { merchantId: "", q: "", action: "", resourceType: "", status: "", ...todayDateTimeRange("Asia/Shanghai") };
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [rows, setRows] = useState<OperationLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countries, , countriesState] = useRows<MerchantCountry>(platform ? "/api/admin/countries" : "/api/merchant/countries");
  const activeCountry = countries.find((country) => country.status === "active") || countries[0];
  const timeZone = !platform && timeMode === "country" && activeCountry ? timeZoneForCountry(activeCountry) : "Asia/Shanghai";
  const timeLabel = !platform && timeMode === "country" && activeCountry ? `${countryLabel(activeCountry.name)}时间` : timeDisplayModeLabel("beijing");
  const url = withQuery(base, { ...filters, timeZone, limit: String(pageSize), offset: String((page - 1) * pageSize) });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api<{ rows: OperationLog[]; total: number }>(url);
      setRows(result.rows);
      setTotal(result.total);
    } catch (err) {
      setRows([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : "操作日志加载失败");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void reload(); }, [url]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  return <section className="single-column work-split operation-log-page">
    <div className="work-panel">
      <ResourceErrorNotice label="国家时间配置" error={countriesState.error} onRetry={countriesState.reload} />
      <div className="section-title"><div><h2>操作日志</h2><p>追踪后台新增、修改、删除、导入、同步、恢复、启用和发送操作。日志不记录密码、密钥或请求正文。当前筛选时间按{timeLabel}解释。</p></div><span className="status-pill neutral">共 {total} 条</span></div>
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        fields={platform ? ["merchantId", "q", "action", "resourceType", "status", "startAt", "endAt"] : ["q", "action", "resourceType", "status", "startAt", "endAt"]}
        selects={{ action: ACTIONS, resourceType: RESOURCES, status: ["", "success", "error"] }}
        resetValues={defaultFilters}
        onApply={async () => { setPage(1); await reload(); }}
      />
      <Table rows={rows} columns={["actorName", "actorRole", "action", "resourceType", "targetId", "status", "httpStatus", "createdAt"]} loading={loading} error={error} onRetry={reload} emptyTitle="暂无操作日志" emptyDetail="完成后台新增、修改、删除、同步或恢复操作后，记录会显示在这里。" />
      <Pagination pager={{ rows, page, pageSize, total, totalPages, setPage: (value) => setPage(Math.min(Math.max(1, value), totalPages)), setPageSize: (value) => { setPageSize(value); setPage(1); } }} />
    </div>
  </section>;
}
