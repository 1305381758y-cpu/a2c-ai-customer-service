import { type ConversationStage, type IntentLabel } from "./intents.js";

export interface MessageAnalysis {
  language: string;
  intent: IntentLabel;
  phone: string;
  telegram: string;
  whatsapp: string;
  stage: ConversationStage;
}

const telegramRegexes = [
  /(?:https?:\/\/)?t\.me\/([A-Za-z0-9_]{5,32})/i,
  /(?:telegram|tg|电报|飞机|텔레그램|เทเลแกรม|telegram saya|telegram aku)\s*(?:账号|號|account|id|user|username|是|:|：)?\s*@?([A-Za-z0-9_]{5,32})/i,
  /@([A-Za-z0-9_]{5,32})/
];

export function extractPhone(text: string): string {
  const matches = text.match(/(?:\+?\d[\s-]?){8,16}\d/g);
  if (!matches) return "";
  const normalized = matches
    .map((match) => match.replace(/[^\d+]/g, ""))
    .find((match) => match.replace(/\D/g, "").length >= 8);
  return normalized ?? "";
}

export function extractTelegram(text: string): string {
  for (const regex of telegramRegexes) {
    const match = text.match(regex);
    if (match?.[1]) return `@${match[1].replace(/^@/, "")}`;
  }
  return "";
}

export function extractWhatsApp(text: string): string {
  if (!/(whatsapp|what's app|\bwa\b|\bws\b|zap|wpp)/i.test(text)) return "";
  return extractPhone(text);
}

export function detectLanguage(text: string, fallback = "unknown"): string {
  if (/[\u0E00-\u0E7F]/.test(text)) return "th";
  if (/[\u3040-\u30FF]/.test(text)) return "ja";
  if (/(こんにちは|こんばんは|おはよう|登録|電話番号|アカウント|テレグラム|よろしく)/.test(text)) return "ja";
  if (/[\u4E00-\u9FFF]/.test(text)) return "zh";
  const lower = text.toLowerCase();
  if (/\b(saya|anda|boleh|daftar|akaun|telefon|terima kasih)\b/.test(lower)) return "ms";
  if (/\b(saya|kamu|daftar|akun|nomor|terima kasih|bisa)\b/.test(lower)) return "id";
  if (/\b(xin chào|dang ky|đăng ký|tai khoan|tài khoản|so dien thoai|số điện thoại)\b/.test(lower)) return "vi";
  if (/\b(olá|ola|oi|cadastro|cadastrar|conta|telefone|obrigado|obrigada|telegram|pix|brasil)\b/.test(lower)) return "pt-BR";
  if (/[A-Za-z]/.test(text)) return "en";
  return fallback;
}

export function analyzeMessage(text: string, previousLanguage = "unknown"): MessageAnalysis {
  const language = detectLanguage(text, previousLanguage);
  const phone = extractPhone(text);
  const telegram = extractTelegram(text);
  const whatsapp = extractWhatsApp(text);
  const intent = detectIntent(text, Boolean(phone), Boolean(telegram));
  const stage = inferStage(intent, Boolean(phone), Boolean(telegram));

  return { language, intent, phone, telegram, whatsapp, stage };
}

function detectIntent(text: string, hasPhone: boolean, hasTelegram: boolean): IntentLabel {
  const lower = text.toLowerCase().trim();
  if (!lower) return "unknown";
  if (hasPhone && hasTelegram) return "provide_phone_and_telegram";
  if (hasTelegram) return "provide_telegram";
  if (hasPhone) return "provide_phone";
  if (/(人工|真人|客服|human|agent|operator|manual|atendente|humano|suporte)/i.test(text)) return "human_request";
  if (/(完成|注册好了|已注册|done|finished|registered|siap|sudah|เสร็จ|terminei|concluí|conclui|cadastrei|registrado)/i.test(text)) return "platform_register_done";
  if (/(注册|开户|sign up|signup|register|daftar|สมัคร|cadastro|cadastrar|registrar|abrir conta)/i.test(text)) return "ask_platform_register";
  if (/(telegram|tg|电报|飞机|เทเลแกรม)/i.test(text)) return "ask_tg_register";
  if (/(链接|link|url|入口|网址|endereço|acesso)/i.test(text)) return "ask_link";
  if (/(优惠|活动|奖励|promotion|bonus|reward|promo|promoção|promocao|bônus|bonus|recompensa)/i.test(text)) return "ask_promotion";
  if (/(安全|真的假的|可信|靠谱吗|scam|safe|trust|real|percaya|seguro|confiável|confiavel|golpe|verdade)/i.test(text)) return "trust_concern";
  if (/(不会|帮我|怎么|如何|help|how|cannot|can't|tak tahu|tidak tahu|bantuan|ajuda|como faço|não consigo|nao consigo)/i.test(text)) return "need_help";
  if (/^(こんにちは|こんばんは|おはよう)/i.test(lower) || /^(hi|hello|hey|你好|您好|哈喽|hai|halo|สวัสดี|olá|ola|oi)\b/i.test(lower)) return "greeting";
  if (lower.length <= 2 || /(.)\1{6,}/.test(lower)) return "irrelevant_or_spam";
  return "unknown";
}

function inferStage(intent: IntentLabel, hasPhone: boolean, hasTelegram: boolean): ConversationStage {
  if (hasPhone && hasTelegram) return "ready_for_handoff";
  if (intent === "platform_register_done" || intent === "ask_tg_register" || hasPhone || hasTelegram) {
    return "need_phone_or_tg";
  }
  return "need_platform_register";
}
