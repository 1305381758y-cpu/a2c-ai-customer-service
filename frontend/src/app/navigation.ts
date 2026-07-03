import type { LucideIcon } from "lucide-react";
import { Bot, Building2, Contact, FileText, Lightbulb, MessageSquare, Settings, Upload, Users, Workflow } from "lucide-react";

import type { User } from "../types.js";

export type AppView =
  | "dashboard"
  | "merchants"
  | "users"
  | "config"
  | "agentProfile"
  | "customers"
  | "scriptFlows"
  | "intentLearning"
  | "training"
  | "simulator"
  | "materials"
  | "knowledge"
  | "samples"
  | "conversations"
  | "handoffs";

export type NavItem = {
  key: AppView;
  label: string;
  description: string;
  icon: LucideIcon;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export const merchantTrainingViews: AppView[] = ["materials", "knowledge", "samples"];

const platformSections: NavSection[] = [
  {
    title: "运营",
    items: [
      { key: "dashboard", label: "总览", description: "平台核心指标", icon: Bot },
      { key: "conversations", label: "会话", description: "查看全部客户对话", icon: MessageSquare },
      { key: "handoffs", label: "接管", description: "人工跟进队列", icon: Workflow },
      { key: "customers", label: "客户", description: "客户记录与历史", icon: Contact },
    ],
  },
  {
    title: "商户",
    items: [
      { key: "merchants", label: "商户", description: "创建和维护商户", icon: Building2 },
      { key: "users", label: "后台账号", description: "账号与权限", icon: Users },
      { key: "config", label: "配置", description: "通道和密钥", icon: Settings },
    ],
  },
  {
    title: "智能训练",
    items: [
      { key: "agentProfile", label: "智能体配置", description: "角色、边界和语气", icon: Bot },
      { key: "scriptFlows", label: "话本流程", description: "流程节点和话术", icon: Workflow },
      { key: "intentLearning", label: "意图学习", description: "优化识别规则", icon: Lightbulb },
      { key: "materials", label: "素材", description: "训练资料", icon: FileText },
      { key: "knowledge", label: "知识库", description: "业务知识", icon: Workflow },
      { key: "samples", label: "样本", description: "优秀对话", icon: Upload },
    ],
  },
];

const merchantSections: NavSection[] = [
  {
    title: "今日工作",
    items: [
      { key: "dashboard", label: "总览", description: "消息、接管和回复", icon: Bot },
      { key: "conversations", label: "会话", description: "处理客户对话", icon: MessageSquare },
      { key: "handoffs", label: "接管", description: "人工跟进队列", icon: Workflow },
      { key: "customers", label: "客户", description: "客户记录与历史", icon: Contact },
    ],
  },
  {
    title: "训练",
    items: [
      { key: "training", label: "训练中心", description: "上传话本和资料", icon: Upload },
      { key: "simulator", label: "模拟训练", description: "内部演练不触发真实发送", icon: MessageSquare },
      { key: "agentProfile", label: "智能体配置", description: "角色、边界和语气", icon: Bot },
      { key: "scriptFlows", label: "话本流程", description: "流程节点和话术", icon: Workflow },
      { key: "intentLearning", label: "意图学习", description: "优化识别规则", icon: Lightbulb },
    ],
  },
  {
    title: "设置",
    items: [
      { key: "config", label: "设置", description: "国家、账号和密钥", icon: Settings },
    ],
  },
];

export function getNavSections(user: User): NavSection[] {
  return user.role === "platform_admin" ? platformSections : merchantSections;
}

export function normalizeViewForUser(user: User, view: string): AppView {
  const requested = (view || "dashboard") as AppView;
  if (user.role !== "platform_admin" && merchantTrainingViews.includes(requested)) return "training";
  const keys = new Set(getNavSections(user).flatMap((section) => section.items.map((item) => item.key)));
  return keys.has(requested) ? requested : "dashboard";
}

export function findNavItem(sections: NavSection[], view: AppView): NavItem {
  return sections.flatMap((section) => section.items).find((item) => item.key === view) ?? sections[0].items[0];
}

export function roleName(role: string) {
  return ({ platform_admin: "平台管理员", merchant_admin: "商户管理员", merchant_operator: "商户运营" } as Record<string, string>)[role] || role;
}
