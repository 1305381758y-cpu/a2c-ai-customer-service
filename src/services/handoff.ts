import type { Conversation } from "../repositories.js";

export function buildHandoffMessage(input: {
  conversation: Conversation;
  lastMessageId: string;
  lastMessageTime: string;
  summary: string;
}): string {
  const { conversation } = input;
  return `客户已完成自动引导流程，请人工跟进。

客户定位信息：
- 客户发送账号名称：${displayValue(conversation.nickname)}
- 客户发送账号号码：${displayValue(conversation.customerPhone)}
- 客户提交手机号：${displayValue(conversation.extractedPhone)}
- 客户提交Telegram账号：${displayValue(conversation.extractedTelegram)}
- 客户提交WhatsApp账号：${displayValue(conversation.extractedWhatsApp)}
- 客户语言：${languageName(conversation.language)}
- 国家/市场：${conversation.countryName || conversation.countryCode || "默认国家"}
- A2C客服账号：${displayValue(conversation.a2cAccountPhone)}
- 最近消息时间：${formatBeijingDateTime(input.lastMessageTime)}`;
}

function displayValue(value: string): string {
  return value?.trim() || "未识别";
}

function languageName(language: string): string {
  const normalized = language.trim().toLowerCase();
  const names: Record<string, string> = {
    zh: "中文",
    "zh-cn": "中文",
    "zh-hans": "中文",
    en: "英语",
    ja: "日语",
    "pt-br": "葡萄牙语",
    pt: "葡萄牙语",
    es: "西班牙语",
    th: "泰语",
    vi: "越南语",
    id: "印尼语",
    ms: "马来语",
    tl: "菲律宾语",
    fil: "菲律宾语",
    unknown: "未知"
  };
  return names[normalized] || language.trim() || "未知";
}

function formatBeijingDateTime(value: string): string {
  if (!value?.trim()) return "未识别";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}
