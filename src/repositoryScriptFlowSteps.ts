import { booleanPatchValue } from "./repositoryPatchValues.js";

export function normalizeScriptFlowStep(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
  const compact = value.trim().toLowerCase().replace(/[\/\\|｜、，,;；:：\s_-]+/g, "");
  const dictionary: Record<string, string> = {
    a: "interest_screening",
    "首次问候": "interest_screening",
    first_greeting: "interest_screening",
    greeting: "interest_screening",
    b: "interest_screening",
    "兴趣筛选": "interest_screening",
    "开场筛选": "interest_screening",
    interest_screening: "interest_screening",
    c: "project_intro",
    "项目介绍": "project_intro",
    project_intro: "project_intro",
    d: "registration_intent",
    "注册意向": "registration_intent",
    "确认注册意向": "registration_intent",
    "确认是否方便注册": "registration_intent",
    "确认开户注册": "registration_intent",
    "确认有空": "registration_intent",
    registration_intent: "registration_intent",
    e: "send_register_link",
    "发送注册链接": "send_register_link",
    "发送链接": "send_register_link",
    "发送链接邀请码": "send_register_link",
    "发送注册链接邀请码": "send_register_link",
    "发送注册步骤": "send_register_link",
    "注册步骤": "send_register_link",
    send_register_link: "send_register_link",
    f: "wait_registration",
    "等待注册": "wait_registration",
    "等待完成注册": "wait_registration",
    "等待客户注册": "wait_registration",
    wait_registration: "wait_registration",
    g: "telegram_confirm",
    "telegram确认": "telegram_confirm",
    "tg确认": "telegram_confirm",
    "确认tg": "telegram_confirm",
    "确认telegram": "telegram_confirm",
    "收集手机号": "telegram_confirm",
    "收集注册手机号": "telegram_confirm",
    "询问telegram": "telegram_confirm",
    telegram_confirm: "telegram_confirm",
    h: "telegram_download",
    "telegram下载": "telegram_download",
    "tg下载": "telegram_download",
    "引导下载tg": "telegram_download",
    "引导下载telegram": "telegram_download",
    "telegram下载引导": "telegram_download",
    "tg下载引导": "telegram_download",
    telegram_download: "telegram_download",
    i: "collect_telegram",
    "获取telegram账号": "collect_telegram",
    "收集telegram": "collect_telegram",
    "收集tg": "collect_telegram",
    "收集tg用户名": "collect_telegram",
    "收集telegram用户名": "collect_telegram",
    "获取tg用户名": "collect_telegram",
    "获取telegram用户名": "collect_telegram",
    collect_telegram: "collect_telegram",
    j: "human_handoff",
    "转交真人": "human_handoff",
    "转人工": "human_handoff",
    "人工接管": "human_handoff",
    human_handoff: "human_handoff",
    k: "ended",
    "结束": "ended",
    ended: "ended"
  };
  return dictionary[normalized] || dictionary[compact] || normalized;
}

export function normalizeScriptFlowStepValue(key: string, value: unknown): string | number {
  if (key === "sendLink" || key === "sendInvite" || key === "sendTutorialImage" || key === "enabled") return booleanPatchValue(value, true);
  if (key === "sortOrder") return Number(value || 0);
  if (key === "flowStep" || key === "nextFlowStep") return normalizeScriptFlowStep(String(value || ""));
  return String(value ?? "");
}
