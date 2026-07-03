import React, { useEffect, useState } from "react";
import { Bot, Contact, MessageSquare, Search } from "lucide-react";
import { withQuery } from "../app/api.js";
import type { Filters } from "../types.js";

type ApiClient = <T>(url: string, options?: RequestInit) => Promise<T>;

export function Dashboard({ platform, api }: { platform: boolean; api: ApiClient }) {
  const [data, setData] = useState<Record<string, number>>({});
  const [filters, setFilters] = useState<Filters>({ startAt: "", endAt: "" });
  const endpoint = platform ? "/api/admin/dashboard" : "/api/merchant/dashboard";
  const reload = () => api<Record<string, number>>(withQuery(endpoint, filters)).then(setData);

  useEffect(() => {
    reload();
  }, [api, platform]);

  return <div className="dashboard-page">
    <section className="dashboard-filter">
      <div>
        <h3>运营总览</h3>
        <p>所有总量都使用数据库 COUNT(*) 统计，不受列表分页或展示数量限制。</p>
      </div>
      <div className="toolbar wrap">
        <input type="date" aria-label="开始日期" value={filters.startAt || ""} onChange={(event) => setFilters({ ...filters, startAt: event.target.value })} />
        <input type="date" aria-label="结束日期" value={filters.endAt || ""} onChange={(event) => setFilters({ ...filters, endAt: event.target.value })} />
        <button onClick={reload}><Search size={16}/>筛选时间</button>
      </div>
    </section>
    <div className="metric-section-title">累计总量</div>
    <MetricGrid keys={["customers", "conversations", "customerMessages", "replies"]} data={data} platform={platform} />
    <div className="metric-section-title">今日，北京时间</div>
    <MetricGrid keys={["todayCustomers", "todayConversations", "todayCustomerMessages", "todayReplies"]} data={data} platform={platform} />
    <div className="metric-section-title">昨日，北京时间</div>
    <MetricGrid keys={["yesterdayCustomers", "yesterdayConversations", "yesterdayCustomerMessages", "yesterdayReplies"]} data={data} platform={platform} />
    <div className="metric-section-title">筛选时间</div>
    <MetricGrid keys={["rangeCustomers", "rangeConversations", "rangeCustomerMessages", "rangeReplies"]} data={data} platform={platform} />
  </div>;
}

function MetricGrid({ keys, data, platform }: { keys: string[]; data: Record<string, number>; platform: boolean }) {
  return <div className="grid metrics">{keys.map((key) => {
    const Icon = metricIcon(key);
    return <section key={key} className="metric-card">
      <div className="metric-top"><span>{dashboardLabel(key, platform)}</span><i><Icon size={19}/></i></div>
      <strong>{data[key] ?? 0}</strong>
      <small>{dashboardHint(key, platform)}</small>
    </section>;
  })}</div>;
}

function metricIcon(key: string) {
  return ({
    customers: Contact,
    todayCustomers: Contact,
    yesterdayCustomers: Contact,
    rangeCustomers: Contact,
    conversations: MessageSquare,
    todayConversations: MessageSquare,
    yesterdayConversations: MessageSquare,
    rangeConversations: MessageSquare,
    customerMessages: MessageSquare,
    todayCustomerMessages: MessageSquare,
    yesterdayCustomerMessages: MessageSquare,
    rangeCustomerMessages: MessageSquare,
    replies: Bot,
    todayReplies: Bot,
    yesterdayReplies: Bot,
    rangeReplies: Bot,
    messages: MessageSquare
  } as Record<string, typeof Bot>)[key] || Bot;
}

function dashboardLabel(key: string, platform: boolean) {
  return ({
    customers: "客户总数",
    conversations: "会话总数",
    customerMessages: "客户消息总条数",
    replies: "已回复消息总条数",
    todayCustomers: "今日客户数",
    todayConversations: "今日会话数",
    todayCustomerMessages: "今日客户消息条数",
    todayReplies: "今日已回复消息条数",
    yesterdayCustomers: "昨日客户数",
    yesterdayConversations: "昨日会话数",
    yesterdayCustomerMessages: "昨日客户消息条数",
    yesterdayReplies: "昨日已回复消息条数",
    rangeCustomers: "筛选客户数",
    rangeConversations: "筛选会话数",
    rangeCustomerMessages: "筛选客户消息条数",
    rangeReplies: "筛选已回复消息条数"
  } as Record<string, string>)[key] || key;
}

function dashboardHint(key: string, platform: boolean) {
  return ({
    customers: "不限制数量的累计客户档案",
    conversations: "累计创建的全部会话",
    customerMessages: "客户发来的全部消息",
    replies: "客服、自动回复和人工发送的全部消息",
    todayCustomers: "按北京时间统计今日活跃客户",
    todayConversations: "按北京时间统计今日新增会话",
    todayCustomerMessages: "按北京时间统计今日客户消息",
    todayReplies: "按北京时间统计今日客服已发送消息",
    yesterdayCustomers: "按北京时间统计昨日活跃客户",
    yesterdayConversations: "按北京时间统计昨日新增会话",
    yesterdayCustomerMessages: "按北京时间统计昨日客户消息",
    yesterdayReplies: "按北京时间统计昨日客服已发送消息",
    rangeCustomers: "按上方筛选日期统计客户",
    rangeConversations: "按上方筛选日期统计会话",
    rangeCustomerMessages: "按上方筛选日期统计客户消息",
    rangeReplies: "按上方筛选日期统计客服已发送消息"
  } as Record<string, string>)[key] || "实时运营指标";
}
