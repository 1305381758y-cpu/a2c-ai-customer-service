import { Bot, Building2, Contact, FileText, Lightbulb, MessageSquare, Settings, Upload, Users, Workflow, type LucideIcon } from "lucide-react";
import type { User } from "../types.js";

export type PortalView =
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

export interface NavItem {
  key: PortalView;
  label: string;
  icon: LucideIcon;
}

const merchantTrainingViews = new Set<PortalView>(["materials", "knowledge", "samples"]);

const platformNav: NavItem[] = [
  { key: "dashboard", label: "总览", icon: Bot },
  { key: "merchants", label: "商户", icon: Building2 },
  { key: "users", label: "后台账号", icon: Users },
  { key: "config", label: "配置", icon: Settings },
  { key: "agentProfile", label: "Agent配置", icon: Bot },
  { key: "customers", label: "客户", icon: Contact },
  { key: "scriptFlows", label: "话本流程", icon: Workflow },
  { key: "intentLearning", label: "意图学习", icon: Lightbulb },
  { key: "materials", label: "素材", icon: FileText },
  { key: "knowledge", label: "知识库", icon: Workflow },
  { key: "samples", label: "样本", icon: Upload },
  { key: "conversations", label: "会话", icon: MessageSquare },
  { key: "handoffs", label: "接管", icon: Workflow }
];

const merchantNav: NavItem[] = [
  { key: "dashboard", label: "总览", icon: Bot },
  { key: "training", label: "训练中心", icon: Upload },
  { key: "simulator", label: "模拟训练", icon: MessageSquare },
  { key: "agentProfile", label: "Agent配置", icon: Bot },
  { key: "scriptFlows", label: "话本流程", icon: Workflow },
  { key: "intentLearning", label: "意图学习", icon: Lightbulb },
  { key: "customers", label: "客户", icon: Contact },
  { key: "conversations", label: "会话", icon: MessageSquare },
  { key: "handoffs", label: "接管", icon: Workflow },
  { key: "config", label: "设置", icon: Settings }
];

export function navForUser(user: User): NavItem[] {
  return user.role === "platform_admin" ? platformNav : merchantNav;
}

export function resolveActiveView(user: User, view: string): PortalView {
  const parsed = parsePortalView(view);
  if (user.role !== "platform_admin" && merchantTrainingViews.has(parsed)) return "training";
  return parsed;
}

export function shouldRedirectViewForRole(user: User, view: string): boolean {
  return user.role !== "platform_admin" && merchantTrainingViews.has(parsePortalView(view));
}

export function navTitle(nav: NavItem[], activeView: PortalView): string {
  return nav.find((item) => item.key === activeView)?.label || "总览";
}

export function roleName(role: string): string {
  return ({ platform_admin: "平台管理员", merchant_admin: "商户管理员", merchant_operator: "商户运营" } as Record<string, string>)[role] || role;
}

function parsePortalView(view: string): PortalView {
  const allowed = new Set<PortalView>([
    "dashboard", "merchants", "users", "config", "agentProfile", "customers", "scriptFlows", "intentLearning",
    "training", "simulator", "materials", "knowledge", "samples", "conversations", "handoffs"
  ]);
  return allowed.has(view as PortalView) ? view as PortalView : "dashboard";
}
