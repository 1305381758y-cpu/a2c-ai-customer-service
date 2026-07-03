import React, { useEffect, useState } from "react";
import { Bot, Building2, Contact, MessageSquare, Upload, Users, Workflow } from "lucide-react";

import { loadDashboardMetrics, type DashboardMetrics } from "./dashboardApi.js";

export function Dashboard({ platform }: { platform: boolean }) {
  const [data, setData] = useState<DashboardMetrics>({});

  useEffect(() => {
    loadDashboardMetrics(platform).then(setData);
  }, [platform]);

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
    merchants: Building2,
    customers: Contact,
    conversations: MessageSquare,
    handoffs: Workflow,
    samples: Upload,
    users: Users,
    aiReplies: Bot,
    messages: MessageSquare
  } as Record<string, typeof Bot>)[key] || Bot;
}

function dashboardLabel(key: string, platform: boolean) {
  if (!platform && key === "samples") return "学习内容";
  if (!platform && key === "aiReplies") return "智能回复";
  return ({
    merchants: "商户",
    customers: "客户",
    conversations: "会话",
    handoffs: "接管",
    samples: "样本",
    users: "后台账号",
    aiReplies: "AI回复",
    messages: "消息"
  } as Record<string, string>)[key] || key;
}

function dashboardHint(key: string, platform: boolean) {
  if (!platform && key === "samples") return "已学习并可参考的内容";
  if (!platform && key === "aiReplies") return "自动处理客户消息次数";
  return ({
    merchants: "当前平台商户总量",
    customers: "已沉淀客户档案",
    conversations: "累计会话记录",
    handoffs: "需要人工跟进",
    samples: "已启用训练样本",
    users: "后台可登录账号",
    aiReplies: "AI 自动回复次数",
    messages: "今日消息处理量"
  } as Record<string, string>)[key] || "实时运营指标";
}
