import { Bot, Contact, MessageSquare } from "lucide-react";

import { MetricCard } from "../ui/MetricCard.js";

export function MetricGrid({ keys, data, timeLabel }: { keys: string[]; data: Record<string, number>; timeLabel: string }) {
  return <div className="grid metrics">{keys.map((key) => {
    const Icon = metricIcon(key);
    return <MetricCard key={key} title={dashboardLabel(key)} value={formatMetricValue(key, data[key] ?? 0)} detail={dashboardHint(key, timeLabel)} icon={Icon} />;
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

function dashboardLabel(key: string) {
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

function dashboardHint(key: string, timeLabel: string) {
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
