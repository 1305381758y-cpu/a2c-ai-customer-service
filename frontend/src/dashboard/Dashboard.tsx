import React, { useEffect, useState } from "react";
import { Bot, Contact, MessageSquare, Search } from "lucide-react";
import { withQuery } from "../app/api.js";
import type { Filters, MerchantCountry } from "../types.js";
import { timeDisplayModeLabel, timeZoneForCountry, type TimeDisplayMode } from "../ui/formatters.js";

type ApiClient = <T>(url: string, options?: RequestInit) => Promise<T>;

export function Dashboard({ platform, api, timeMode }: { platform: boolean; api: ApiClient; timeMode: TimeDisplayMode }) {
  const [data, setData] = useState<Record<string, number>>({});
  const [filters, setFilters] = useState<Filters>({ startAt: "", endAt: "" });
  const [countries, setCountries] = useState<MerchantCountry[]>([]);
  const endpoint = platform ? "/api/admin/dashboard" : "/api/merchant/dashboard";
  const activeCountry = countries.find((country) => country.status === "active") || countries[0];
  const statsTimeZone = timeMode === "country" && activeCountry ? timeZoneForCountry(activeCountry) : "Asia/Shanghai";
  const statsTimeLabel = timeMode === "country" && activeCountry ? `${activeCountry.name || "国家"}时间` : timeDisplayModeLabel("beijing");
  const reload = () => api<Record<string, number>>(withQuery(endpoint, { ...filters, timeZone: statsTimeZone })).then(setData);

  useEffect(() => {
    if (platform) return;
    api<{ rows: MerchantCountry[] }>("/api/merchant/countries").then((result) => setCountries(result.rows || [])).catch(() => setCountries([]));
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
    <div className="metric-section-title">累计总量</div>
    <MetricGrid keys={["customers", "conversations", "customerMessages", "replies", "averageMessagesPerConversation"]} data={data} platform={platform} timeLabel={statsTimeLabel} />
    <div className="metric-section-title">今日，{statsTimeLabel}</div>
    <MetricGrid keys={["todayCustomers", "todayConversations", "todayNewConversations", "todayRepeatConversations", "todayCustomerMessages", "todayReplies", "todayAverageMessagesPerConversation"]} data={data} platform={platform} timeLabel={statsTimeLabel} />
    <div className="metric-section-title">昨日，{statsTimeLabel}</div>
    <MetricGrid keys={["yesterdayCustomers", "yesterdayConversations", "yesterdayCustomerMessages", "yesterdayReplies", "yesterdayAverageMessagesPerConversation"]} data={data} platform={platform} timeLabel={statsTimeLabel} />
    <div className="metric-section-title">筛选时间</div>
    <MetricGrid keys={["rangeCustomers", "rangeConversations", "rangeCustomerMessages", "rangeReplies", "rangeAverageMessagesPerConversation"]} data={data} platform={platform} timeLabel={statsTimeLabel} />
  </div>;
}

function MetricGrid({ keys, data, platform, timeLabel }: { keys: string[]; data: Record<string, number>; platform: boolean; timeLabel: string }) {
  return <div className="grid metrics">{keys.map((key) => {
    const Icon = metricIcon(key);
    return <section key={key} className="metric-card">
      <div className="metric-top"><span>{dashboardLabel(key, platform)}</span><i><Icon size={19}/></i></div>
      <strong>{formatMetricValue(key, data[key] ?? 0)}</strong>
      <small>{dashboardHint(key, platform, timeLabel)}</small>
    </section>;
  })}</div>;
}

function formatMetricValue(key: string, value: number) {
  if (!key.includes("AverageMessagesPerConversation")) return value;
  return value.toFixed(1);
}

function metricIcon(key: string) {
  return ({
    customers: Contact,
    todayCustomers: Contact,
    yesterdayCustomers: Contact,
    rangeCustomers: Contact,
    conversations: MessageSquare,
    todayConversations: MessageSquare,
    todayNewConversations: MessageSquare,
    todayRepeatConversations: MessageSquare,
    yesterdayConversations: MessageSquare,
    rangeConversations: MessageSquare,
    customerMessages: MessageSquare,
    todayCustomerMessages: MessageSquare,
    yesterdayCustomerMessages: MessageSquare,
    rangeCustomerMessages: MessageSquare,
    replies: Bot,
    averageMessagesPerConversation: MessageSquare,
    todayReplies: Bot,
    todayAverageMessagesPerConversation: MessageSquare,
    yesterdayReplies: Bot,
    yesterdayAverageMessagesPerConversation: MessageSquare,
    rangeReplies: Bot,
    rangeAverageMessagesPerConversation: MessageSquare,
    messages: MessageSquare
  } as Record<string, typeof Bot>)[key] || Bot;
}

function dashboardLabel(key: string, platform: boolean) {
  return ({
    customers: "客户总数",
    conversations: "会话总数",
    customerMessages: "客户消息总条数",
    replies: "已回复消息总条数",
    averageMessagesPerConversation: "平均每会话消息数",
    todayCustomers: "今日新增客户数",
    todayConversations: "今日创建会话数",
    todayNewConversations: "今日新增会话数",
    todayRepeatConversations: "今日重复会话数",
    todayCustomerMessages: "今日客户消息条数",
    todayReplies: "今日已回复消息条数",
    todayAverageMessagesPerConversation: "今日平均每会话消息数",
    yesterdayCustomers: "昨日新增客户数",
    yesterdayConversations: "昨日创建会话数",
    yesterdayCustomerMessages: "昨日客户消息条数",
    yesterdayReplies: "昨日已回复消息条数",
    yesterdayAverageMessagesPerConversation: "昨日平均每会话消息数",
    rangeCustomers: "筛选新增客户数",
    rangeConversations: "筛选会话数",
    rangeCustomerMessages: "筛选客户消息条数",
    rangeReplies: "筛选已回复消息条数",
    rangeAverageMessagesPerConversation: "筛选平均每会话消息数"
  } as Record<string, string>)[key] || key;
}

function dashboardHint(key: string, platform: boolean, timeLabel: string) {
  return ({
    customers: "不限制数量的累计客户档案",
    conversations: "累计创建的全部会话",
    customerMessages: "客户发来的全部消息",
    replies: "客服、自动回复和人工发送的全部消息",
    averageMessagesPerConversation: "全部客户消息和回复 / 会话总数",
    todayCustomers: `按${timeLabel}统计今日首次进入系统的客户`,
    todayConversations: `按${timeLabel}统计今日新创建的全部会话`,
    todayNewConversations: `按${timeLabel}统计今日创建，且客户此前没有历史会话`,
    todayRepeatConversations: `按${timeLabel}统计今日创建，且客户此前已有历史会话`,
    todayCustomerMessages: `按${timeLabel}统计今日客户消息`,
    todayReplies: `按${timeLabel}统计今日客服已发送消息`,
    todayAverageMessagesPerConversation: "今日客户消息和回复 / 今日创建会话数",
    yesterdayCustomers: `按${timeLabel}统计昨日首次进入系统的客户`,
    yesterdayConversations: `按${timeLabel}统计昨日新创建会话`,
    yesterdayCustomerMessages: `按${timeLabel}统计昨日客户消息`,
    yesterdayReplies: `按${timeLabel}统计昨日客服已发送消息`,
    yesterdayAverageMessagesPerConversation: "昨日客户消息和回复 / 昨日创建会话数",
    rangeCustomers: `按上方筛选日期和${timeLabel}统计首次进入系统的客户`,
    rangeConversations: `按上方筛选日期和${timeLabel}统计会话`,
    rangeCustomerMessages: `按上方筛选日期和${timeLabel}统计客户消息`,
    rangeReplies: `按上方筛选日期和${timeLabel}统计客服已发送消息`,
    rangeAverageMessagesPerConversation: "筛选客户消息和回复 / 筛选会话数"
  } as Record<string, string>)[key] || "实时运营指标";
}
