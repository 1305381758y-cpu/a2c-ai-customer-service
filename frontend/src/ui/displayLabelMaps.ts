export const LANGUAGE_NAMES: Record<string, string> = {
  zh: "中文",
  "zh-CN": "中文",
  en: "英语",
  ja: "日语",
  "pt-BR": "葡语",
  pt: "葡语",
  es: "西语",
  ms: "马来语",
  id: "印尼语",
  th: "泰语",
  vi: "越南语",
  unknown: "未知"
};

export const REPLY_MODE_LABELS: Record<string, string> = {
  strict_flow: "话本流程",
  gemini: "普通回复",
  fallback: "兜底回复",
  manual: "人工发送"
};

export const STATUS_TONE_VALUES = {
  success: ["active", "enabled", "ok", "bound", "done", "ready_for_handoff", "available", "reviewed", "promoted"],
  warning: ["pending", "processing", "waiting", "need_platform_register", "need_phone_or_tg", "reserved", "candidate"],
  danger: ["disabled", "error", "invalid", "human_handoff", "irrelevant_or_spam", "ignored"]
} satisfies Record<string, string[]>;
