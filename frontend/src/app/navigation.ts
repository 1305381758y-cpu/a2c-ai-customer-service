import type { LucideIcon } from "lucide-react";
import { Bot, Building2, Contact, FileText, Lightbulb, MessageSquare, Settings, Sparkles, Upload, Users, Workflow } from "lucide-react";

import type { User } from "../types.js";

export type PortalView = "dashboard" | "aiCalls" | "merchants" | "users" | "config" | "agentProfile" | "customers" | "scriptFlows" | "intentLearning" | "materials" | "knowledge" | "samples" | "conversations" | "handoffs" | "training" | "simulator";

export type NavigationItem = {
  key: PortalView;
  label: string;
  icon: LucideIcon;
};

const PLATFORM_NAVIGATION: NavigationItem[] = [
  { key: "dashboard", label: "总览", icon: Bot },
  { key: "aiCalls", label: "模型调用", icon: Sparkles },
  { key: "merchants", label: "商户", icon: Building2 },
  { key: "users", label: "后台账号", icon: Users },
  { key: "config", label: "配置", icon: Settings },
  { key: "agentProfile", label: "智能体配置", icon: Bot },
  { key: "customers", label: "客户", icon: Contact },
  { key: "scriptFlows", label: "话本流程", icon: Workflow },
  { key: "intentLearning", label: "意图学习", icon: Lightbulb },
  { key: "materials", label: "素材", icon: FileText },
  { key: "knowledge", label: "知识库", icon: Workflow },
  { key: "samples", label: "样本", icon: Upload },
  { key: "conversations", label: "会话", icon: MessageSquare },
  { key: "handoffs", label: "接管", icon: Workflow }
];

const MERCHANT_NAVIGATION: NavigationItem[] = [
  { key: "dashboard", label: "总览", icon: Bot },
  { key: "aiCalls", label: "模型调用", icon: Sparkles },
  { key: "training", label: "训练中心", icon: Upload },
  { key: "simulator", label: "模拟训练", icon: MessageSquare },
  { key: "agentProfile", label: "智能体配置", icon: Bot },
  { key: "scriptFlows", label: "话本流程", icon: Workflow },
  { key: "intentLearning", label: "意图学习", icon: Lightbulb },
  { key: "customers", label: "客户", icon: Contact },
  { key: "conversations", label: "会话", icon: MessageSquare },
  { key: "handoffs", label: "接管", icon: Workflow },
  { key: "config", label: "设置", icon: Settings }
];

const MERCHANT_OPERATOR_NAVIGATION: NavigationItem[] = [
  { key: "dashboard", label: "总览", icon: Bot },
  { key: "agentProfile", label: "智能体配置", icon: Bot },
  { key: "scriptFlows", label: "话本流程", icon: Workflow },
  { key: "customers", label: "客户", icon: Contact },
  { key: "conversations", label: "会话", icon: MessageSquare },
  { key: "handoffs", label: "接管", icon: Workflow },
  { key: "config", label: "设置", icon: Settings }
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

export function roleName(role: User["role"]): string {
  return {
    platform_admin: "平台管理员",
    merchant_admin: "商户管理员",
    merchant_operator: "商户运营"
  }[role];
}
