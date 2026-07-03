import React, { useEffect, useState } from "react";
import { Bot, Contact, MessageSquare } from "lucide-react";

type ApiClient = <T>(url: string, options?: RequestInit) => Promise<T>;

export function Dashboard({ platform, api }: { platform: boolean; api: ApiClient }) {
  const [data, setData] = useState<Record<string, number>>({});

  useEffect(() => {
    api<Record<string, number>>(platform ? "/api/admin/dashboard" : "/api/merchant/dashboard").then(setData);
  }, [api, platform]);

  return <div className="grid metrics">
    {Object.entries(data).map(([key, value]) => {
      const Icon = metricIcon(key);
      return <section key={key} className="metric-card">
        <div className="metric-top"><span>{dashboardLabel(key, platform)}</span><i><Icon size={19}/></i></div>
        <strong>{value}</strong>
        <small>{dashboardHint(key, platform)}</small>
      </section>;
    })}
  </div>;
}

function metricIcon(key: string) {
  return ({
    customers: Contact,
    todayCustomers: Contact,
    todayConversations: MessageSquare,
    todayReplies: Bot,
    messages: MessageSquare
  } as Record<string, typeof Bot>)[key] || Bot;
}

function dashboardLabel(key: string, platform: boolean) {
  return ({
    customers: "客户总数",
    todayCustomers: "今日客户数",
    todayConversations: "今日会话数",
    todayReplies: "今日已回复消息"
  } as Record<string, string>)[key] || key;
}

function dashboardHint(key: string, platform: boolean) {
  return ({
    customers: "不限制数量的累计客户档案",
    todayCustomers: "按北京时间统计今日活跃客户",
    todayConversations: "按北京时间统计今日新增会话",
    todayReplies: "按北京时间统计今日客服已发送消息"
  } as Record<string, string>)[key] || "实时运营指标";
}
