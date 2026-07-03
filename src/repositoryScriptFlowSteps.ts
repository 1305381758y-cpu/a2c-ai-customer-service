import { booleanPatchValue } from "./repositoryPatchValues.js";

export function normalizeScriptFlowStep(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
  const dictionary: Record<string, string> = {
    a: "interest_screening",
    "首次问候": "interest_screening",
    first_greeting: "interest_screening",
    greeting: "interest_screening",
    b: "interest_screening",
    "兴趣筛选": "interest_screening",
    interest_screening: "interest_screening",
    c: "registration_intent",
    "项目介绍": "registration_intent",
    project_intro: "registration_intent",
    d: "registration_intent",
    "注册意向": "registration_intent",
    registration_intent: "registration_intent",
    e: "wait_registration",
    "发送注册链接": "wait_registration",
    "发送链接": "wait_registration",
    send_register_link: "wait_registration",
    f: "wait_registration",
    "等待注册": "wait_registration",
    wait_registration: "wait_registration",
    g: "telegram_confirm",
    "telegram确认": "telegram_confirm",
    "tg确认": "telegram_confirm",
    telegram_confirm: "telegram_confirm",
    h: "telegram_download",
    "telegram下载": "telegram_download",
    "tg下载": "telegram_download",
    telegram_download: "telegram_download",
    i: "collect_telegram",
    "获取telegram账号": "collect_telegram",
    "收集telegram": "collect_telegram",
    collect_telegram: "collect_telegram",
    j: "human_handoff",
    "转交真人": "human_handoff",
    human_handoff: "human_handoff",
    k: "ended",
    "结束": "ended",
    ended: "ended"
  };
  return dictionary[normalized] || normalized;
}

export function normalizeScriptFlowStepValue(key: string, value: unknown): string | number {
  if (key === "sendLink" || key === "sendInvite" || key === "enabled") return booleanPatchValue(value, true);
  if (key === "sortOrder") return Number(value || 0);
  if (key === "flowStep" || key === "nextFlowStep") return normalizeScriptFlowStep(String(value || ""));
  return String(value ?? "");
}
