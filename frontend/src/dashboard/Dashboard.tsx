import React, { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { withQuery } from "../app/api.js";
import type { Filters, MerchantCountry } from "../types.js";
import { timeDisplayModeLabel, timeZoneForCountry, type TimeDisplayMode } from "../ui/formatters.js";
import { todayDateTimeRange } from "../ui/timeFilters.js";
import { MetricGrid } from "./DashboardMetrics.js";

type ApiClient = <T>(url: string, options?: RequestInit) => Promise<T>;

export function Dashboard({ platform, api, timeMode }: { platform: boolean; api: ApiClient; timeMode: TimeDisplayMode }) {
  const [data, setData] = useState<Record<string, number>>({});
  const [filters, setFilters] = useState<Filters>(todayDateTimeRange("Asia/Shanghai"));
  const [countries, setCountries] = useState<MerchantCountry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const endpoint = platform ? "/api/admin/dashboard" : "/api/merchant/dashboard";
  const activeCountry = countries.find((country) => country.status === "active") || countries[0];
  const statsTimeZone = timeMode === "country" && activeCountry ? timeZoneForCountry(activeCountry) : "Asia/Shanghai";
  const statsTimeLabel = timeMode === "country" && activeCountry ? `${activeCountry.name || "国家"}时间` : timeDisplayModeLabel("beijing");
  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api<Record<string, number>>(withQuery(endpoint, { ...filters, timeZone: statsTimeZone })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "总览数据加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (platform) return;
    api<{ rows: MerchantCountry[] }>("/api/merchant/countries").then((result) => setCountries(result.rows || [])).catch((err) => setError(err instanceof Error ? err.message : "国家设置加载失败"));
  }, [api, platform]);

  useEffect(() => {
    reload();
  }, [api, platform, statsTimeZone]);

  return <div className="dashboard-page">
    <section className="dashboard-filter">
      <div>
        <h3>运营总览</h3>
        <p>所有总量都使用数据库 COUNT(*) 统计，不受列表分页或展示数量限制。当前统计口径：{statsTimeLabel}。</p>
      </div>
      <div className="toolbar wrap">
        <input type="datetime-local" step={1} aria-label="开始时间" value={filters.startAt || ""} onChange={(event) => setFilters({ ...filters, startAt: event.target.value })} />
        <input type="datetime-local" step={1} aria-label="结束时间" value={filters.endAt || ""} onChange={(event) => setFilters({ ...filters, endAt: event.target.value })} />
        <button onClick={reload}><Search size={16}/>筛选时间</button>
      </div>
    </section>
    {loading && <div className="notice">正在加载总览数据...</div>}
    {error && <div className="error" role="alert">总览加载失败：{error}<button className="ghost" onClick={() => void reload()}>重新加载</button></div>}
    <div className="metric-section-title">累计总量</div>
    <MetricGrid keys={["customers", "conversations", "customerMessages", "replies", "averageMessagesPerConversation"]} data={data} timeLabel={statsTimeLabel} />
    <div className="metric-section-title">今日，{statsTimeLabel}</div>
    <MetricGrid keys={["todayCustomers", "todayConversations", "todayNewConversations", "todayRepeatConversations", "todayCustomerMessages", "todayReplies", "todayAverageMessagesPerConversation"]} data={data} timeLabel={statsTimeLabel} />
    <div className="metric-section-title">昨日，{statsTimeLabel}</div>
    <MetricGrid keys={["yesterdayCustomers", "yesterdayConversations", "yesterdayCustomerMessages", "yesterdayReplies", "yesterdayAverageMessagesPerConversation"]} data={data} timeLabel={statsTimeLabel} />
    <div className="metric-section-title">筛选时间</div>
    <MetricGrid keys={["rangeCustomers", "rangeConversations", "rangeCustomerMessages", "rangeReplies", "rangeAverageMessagesPerConversation"]} data={data} timeLabel={statsTimeLabel} />
  </div>;
}
