import type { LucideIcon } from "lucide-react";
import { Bot, Building2, ClipboardList, Contact, FileText, Lightbulb, MessageSquare, Settings, Sparkles, Upload, Users, Workflow } from "lucide-react";

import type { User } from "../types.js";

export type PortalView = "dashboard" | "aiCalls" | "operationLogs" | "merchants" | "users" | "config" | "agentProfile" | "customers" | "scriptFlows" | "intentLearning" | "materials" | "knowledge" | "samples" | "conversations" | "handoffs" | "training" | "simulator";

export type NavigationItem = {
  key: PortalView;
  label: string;
  icon: LucideIcon;
  group: string;
};

const PLATFORM_NAVIGATION: NavigationItem[] = [
  { key: "dashboard", label: "总览", icon: Bot, group: "平台概览" },
  { key: "aiCalls", label: "模型调用", icon: Sparkles, group: "平台概览" },
  { key: "operationLogs", label: "操作日志", icon: ClipboardList, group: "平台概览" },
  { key: "merchants", label: "商户", icon: Building2, group: "平台管理" },
  { key: "users", label: "后台账号", icon: Users, group: "平台管理" },
  { key: "config", label: "配置", icon: Settings, group: "平台管理" },
  { key: "agentProfile", label: "智能体配置", icon: Bot, group: "运营工作台" },
  { key: "customers", label: "客户", icon: Contact, group: "运营工作台" },
  { key: "conversations", label: "会话", icon: MessageSquare, group: "运营工作台" },
  { key: "handoffs", label: "接管", icon: Workflow, group: "运营工作台" },
  { key: "scriptFlows", label: "话本流程", icon: Workflow, group: "训练与规则" },
  { key: "intentLearning", label: "意图学习", icon: Lightbulb, group: "训练与规则" },
  { key: "materials", label: "素材", icon: FileText, group: "训练与规则" },
  { key: "knowledge", label: "知识库", icon: Workflow, group: "训练与规则" },
  { key: "samples", label: "样本", icon: Upload, group: "训练与规则" }
];

const MERCHANT_NAVIGATION: NavigationItem[] = [
  { key: "dashboard", label: "总览", icon: Bot, group: "运营" },
  { key: "conversations", label: "会话", icon: MessageSquare, group: "运营" },
  { key: "customers", label: "客户", icon: Contact, group: "运营" },
  { key: "handoffs", label: "接管", icon: Workflow, group: "运营" },
  { key: "training", label: "训练中心", icon: Upload, group: "训练与规则" },
  { key: "simulator", label: "模拟训练", icon: MessageSquare, group: "训练与规则" },
  { key: "scriptFlows", label: "话本流程", icon: Workflow, group: "训练与规则" },
  { key: "intentLearning", label: "意图学习", icon: Lightbulb, group: "训练与规则" },
  { key: "agentProfile", label: "智能体配置", icon: Bot, group: "配置" },
  { key: "config", label: "设置", icon: Settings, group: "配置" },
  { key: "aiCalls", label: "模型调用", icon: Sparkles, group: "配置" },
  { key: "operationLogs", label: "操作日志", icon: ClipboardList, group: "配置" }
];

const MERCHANT_OPERATOR_NAVIGATION: NavigationItem[] = [
  { key: "dashboard", label: "总览", icon: Bot, group: "运营工作台" },
  { key: "agentProfile", label: "智能体配置", icon: Bot, group: "运营工作台" },
  { key: "scriptFlows", label: "话本流程", icon: Workflow, group: "运营工作台" },
  { key: "customers", label: "客户", icon: Contact, group: "运营工作台" },
  { key: "conversations", label: "会话", icon: MessageSquare, group: "运营工作台" },
  { key: "handoffs", label: "接管", icon: Workflow, group: "运营工作台" },
  { key: "config", label: "设置", icon: Settings, group: "配置" }
];

const MERCHANT_TRAINING_ALIASES = new Set<PortalView>(["materials", "knowledge", "samples"]);

export function navigationForRole(role: User["role"]): NavigationItem[] {
  if (role === "platform_admin") return PLATFORM_NAVIGATION;
  return role === "merchant_operator" ? MERCHANT_OPERATOR_NAVIGATION : MERCHANT_NAVIGATION;
}

export function resolvePortalView(role: User["role"], requestedView: string): PortalView {
  const requested = requestedView as PortalView;
  if (role === "merchant_admin" && MERCHANT_TRAINING_ALIASES.has(requested)) return "training";
  return navigationForRole(role).some((item) => item.key === requested) ? requested : "dashboard";
}

export function portalViewLabel(role: User["role"], view: PortalView): string {
  return navigationForRole(role).find((item) => item.key === view)?.label || "总览";
}

export function portalViewDescription(view: PortalView): string {
  return {
    dashboard: "快速查看客户、会话、回复和接管数据。",
    aiCalls: "查看不同供应商和调用类型的成功率、耗时与失败原因。",
    operationLogs: "追踪配置变更、同步、发送和高风险操作。",
    merchants: "管理商户、国家、账号和商户管理员。",
    users: "管理后台账号、角色和登录权限。",
    config: "配置当前商户的通道、语言、AI、邀请码和接管规则。",
    agentProfile: "设置接待角色、语气、边界和转人工条件。",
    customers: "查看客户资料、历史会话和流程完成情况。",
    scriptFlows: "编辑节点、跳转条件和客户可见话术。",
    intentLearning: "复核客户意图候选，持续优化识别规则。",
    materials: "查看商户上传并自动解析的训练资料。",
    knowledge: "维护可被当前国家和流程引用的业务知识。",
    samples: "维护优秀对话样本和标准回复。",
    conversations: "处理新消息、回复客户并查看完整上下文。",
    handoffs: "集中处理等待人工跟进的客户。",
    training: "上传话本和真实对话，统一进入训练中心。",
    simulator: "在不发送真实消息的情况下测试流程和回复。"
  }[view] || "";
}

export function roleName(role: User["role"]): string {
  return {
    platform_admin: "平台管理员",
    merchant_admin: "商户管理员",
    merchant_operator: "商户运营"
  }[role];
}
