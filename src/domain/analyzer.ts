import { type ConversationStage, type IntentLabel } from "./intents.js";

export interface MessageAnalysis {
  language: string;
  intent: IntentLabel;
  phone: string;
  telegram: string;
  whatsapp: string;
  stage: ConversationStage;
}

export const INTERNAL_INTENT_LABELS = [
  "positive_confirmation",
  "negative_refusal",
  "need_help",
  "ask_platform_register",
  "ask_link",
  "ask_tg_register",
  "platform_register_done",
  "payment_concern",
  "investment_concern",
  "trust_concern",
  "earning_concern",
  "workflow_question",
  "registration_field_question",
  "job_question",
  "complaint",
  "chat",
  "sensitive_request",
  "unknown"
] as const;

export type InternalIntentLabel = (typeof INTERNAL_INTENT_LABELS)[number];

export const CONTEXTUAL_INTENT_LABELS = [
  "phone_submission",
  "incomplete_phone",
  "telegram_submission",
  "positive_confirmation",
  "acknowledgement",
  "negative_refusal",
  "not_available",
  "not_registered",
  "no_telegram",
  "telegram_installed",
  "telegram_username_help",
  "need_help",
  "ask_platform_register",
  "ask_link",
  "ask_tg_register",
  "platform_register_done",
  "payment_concern",
  "investment_concern",
  "trust_concern",
  "earning_concern",
  "workflow_question",
  "registration_field_question",
  "job_question",
  "complaint",
  "chat",
  "sensitive_request",
  "unknown_question",
  "unknown"
] as const;

export type ContextualIntentLabel = (typeof CONTEXTUAL_INTENT_LABELS)[number];

const telegramRegexes = [
  /(?:https?:\/\/)?t\.me\/([A-Za-z0-9_]{5,32})/i,
  /(?:telegram|tg|电报|飞机|텔레그램|เทเลแกรม|telegram saya|telegram aku)\s*(?:账号|號|account|id|user|username|是|:|：)?\s*@?([A-Za-z0-9_]{5,32})/i,
  /@([A-Za-z0-9_]{5,32})/
];

export function extractPhone(text: string): string {
  const matches = stripUrls(text).match(/(?:\+?\d[\s-]?){8,16}\d/g);
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
  text = stripUrls(text);
  if (/[\u0E00-\u0E7F]/.test(text)) return "th";
  if (/[\u3040-\u30FF]/.test(text)) return "ja";
  if (/[\u0600-\u06FF]/.test(text)) return "ar";
  if (/[А-Яа-яЁё]/.test(text)) return "ru";
  if (/[가-힣]/.test(text)) return "ko";
  if (/(こんにちは|こんばんは|おはよう|登録|電話番号|アカウント|テレグラム|よろしく)/.test(text)) return "ja";
  if (/[\u4E00-\u9FFF]/.test(text)) return "zh";
  const lower = text.toLowerCase();
  if (/\b(hola|buenos dias|buenos días|buenas tardes|buenas noches|registrar|registro|telefono|teléfono|trabajo)\b/.test(lower)) return "es";
  if (/\b(bonjour|bonsoir|salut|inscription|compte|telephone|téléphone|travail)\b/.test(lower)) return "fr";
  if (/\b(saya|anda|boleh|daftar|akaun|telefon|terima kasih)\b/.test(lower)) return "ms";
  if (/\b(saya|kamu|daftar|akun|nomor|terima kasih|bisa)\b/.test(lower)) return "id";
  if (/\b(xin chào|dang ky|đăng ký|tai khoan|tài khoản|so dien thoai|số điện thoại)\b/.test(lower)) return "vi";
  if (/(^|\s)(olá|ola|oi|bom dia|boa tarde|boa noite|cadastro|cadastrar|conta|telefone|obrigado|obrigada|meu|minha|você|voce|trabalho|convite|pix|brasil|não|nao|tenho|como faço|como faco|faço|faco)(\s|$|[,.!?;:])/i.test(lower)) return "pt-BR";
  if (fallback !== "unknown" && isShortContextualReply(text)) return fallback;
  if (fallback !== "unknown" && /^@[A-Za-z0-9_]{5,32}$/.test(text.trim())) return fallback;
  if (fallback !== "unknown" && /^\+?\d[\d\s-]{5,18}$/.test(text.trim())) return fallback;
  if (/[A-Za-z]/.test(text)) return "en";
  return fallback;
}

export function analyzeMessage(text: string, previousLanguage = "unknown"): MessageAnalysis {
  text = stripUrls(text);
  const language = detectLanguage(text, previousLanguage);
  const phone = extractPhone(text);
  const telegram = extractTelegram(text);
  const whatsapp = extractWhatsApp(text);
  const intent = detectIntent(text, Boolean(phone), Boolean(telegram));
  const stage = inferStage(intent, Boolean(phone), Boolean(telegram));

  return { language, intent, phone, telegram, whatsapp, stage };
}

function stripUrls(text: string): string {
  return text.replace(/https?:\/\/\S+/gi, " ");
}

function detectIntent(text: string, hasPhone: boolean, hasTelegram: boolean): IntentLabel {
  const lower = text.toLowerCase().trim();
  if (!lower) return "unknown";
  if (hasPhone && hasTelegram) return "provide_phone_and_telegram";
  if (hasTelegram) return "provide_telegram";
  if (hasPhone) return "provide_phone";
  if (isGreeting(lower)) return "greeting";
  if (/(人工|真人|客服|human|agent|operator|manual|atendente|humano|suporte)/i.test(text)) return "human_request";
  if (/(完成|好了|注册好了|註冊好了|已注册|已註冊|注册完|註冊完|done|finished|registered|siap|sudah|เสร็จ|terminei|concluí|conclui|cadastrei|registrado|pronto)/i.test(text)) return "platform_register_done";
  if (isPlatformQuestion(text)) return "ask_platform_register";
  if (/(注册|开户|sign up|signup|register|daftar|สมัคร|cadastro|cadastrar|registrar|abrir conta)/i.test(text)) return "ask_platform_register";
  if (/(telegram|tg|电报|飞机|เทเลแกรม)/i.test(text)) return "ask_tg_register";
  if (/(链接|link|url|入口|网址|endereço|acesso)/i.test(text)) return "ask_link";
  if (/(优惠|活动|奖励|promotion|bonus|reward|promo|promoção|promocao|bônus|bonus|recompensa)/i.test(text)) return "ask_promotion";
  if (/(安全|真的假的|可信|靠谱吗|骗人|骗子|诈骗|scam|safe|trust|real|percaya|seguro|confiável|confiavel|golpe|verdade)/i.test(text)) return "trust_concern";
  if (/(不会|帮我|怎么|如何|help|how|cannot|can't|tak tahu|tidak tahu|bantuan|ajuda|como faço|não consigo|nao consigo)/i.test(text)) return "need_help";
  if (isInitialConsultation(text)) return "greeting";
  if (isPositiveConfirmation(text)) return "greeting";
  if (lower.length <= 2 || /(.)\1{6,}/.test(lower)) return "irrelevant_or_spam";
  return "unknown";
}

export function isPositiveConfirmation(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[。.!?！？,，;；:：]+$/g, "")
    .trim();
  return /^(是|是的|对|對|对的|可以|可以的|好|好的|嗯|嗯嗯|行|行的|有|有的|要|想|没问题|沒問題|继续|yes|yep|yeah|ok|okay|sure|correct|right|sim|claro|pode|isso|sí|si|vale|dale)$/i.test(normalized);
}

function isShortContextualReply(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[。.!?！？,，;；:：]+$/g, "")
    .trim();
  return isPositiveConfirmation(normalized) || /^(no|nope|nah|não|nao|not now|stop)$/i.test(normalized);
}

export function isInternalIntentLabel(value: string): value is InternalIntentLabel {
  return INTERNAL_INTENT_LABELS.includes(value as InternalIntentLabel);
}

export function isContextualIntentLabel(value: string): value is ContextualIntentLabel {
  return CONTEXTUAL_INTENT_LABELS.includes(value as ContextualIntentLabel);
}

function isGreeting(lower: string): boolean {
  const normalized = lower.replace(/[。.!?！？,，;；:：]+$/g, "").trim();
  return /^(你好|您好|哈喽|嗨|在吗|在不在|早上好|下午好|晚上好)$/i.test(normalized) ||
    /^(hi|hello|hey|good morning|good afternoon|good evening|gm|hai|halo)$/i.test(normalized) ||
    /^(olá|ola|oi|bom dia|boa tarde|boa noite)$/i.test(normalized) ||
    /^(hola|buenos dias|buenos días|buenas tardes|buenas noches)$/i.test(normalized) ||
    /^(bonjour|bonsoir|salut|coucou)$/i.test(normalized) ||
    /^(こんにちは|こんばんは|おはよう|おはようございます)$/i.test(normalized) ||
    /^(안녕하세요|안녕)$/i.test(normalized) ||
    /^(สวัสดี|สวัสดีครับ|สวัสดีค่ะ)$/i.test(normalized) ||
    /^(مرحبا|السلام عليكم|اهلا|أهلا)$/i.test(normalized) ||
    /^(привет|здравствуйте|доброе утро|добрый день|добрый вечер)$/i.test(normalized) ||
    /^(xin chào|chào bạn)$/i.test(normalized);
}

function isPlatformQuestion(text: string): boolean {
  return /(什么平台|什麼平台|哪个平台|哪個平台|平台是做什么|平台做什么|什么项目|什麼項目|在哪里注册|在哪注册|where.*register|what platform|which platform|what project|que plataforma|qual plataforma|onde.*cadastro|onde.*cadastrar)/i.test(text);
}

function isInitialConsultation(text: string): boolean {
  return /(找工作|想找.*工作|想.*工作|需要工作|了解.*工作|介绍.*工作|介绍一下|这份工作|這份工作|兼职|线上工作|在线工作|赚钱|賺錢|挣钱|掙錢|赚佣金|賺佣金|佣金收入|可以聊|聊聊|咨询|job|work|part[-\s]?time|online work|extra income|tell me more|emprego|trabalho|renda extra|vaga|quero trabalhar|preciso trabalhar)/i.test(text);
}

function inferStage(intent: IntentLabel, hasPhone: boolean, hasTelegram: boolean): ConversationStage {
  if (hasPhone && hasTelegram) return "ready_for_handoff";
  if (intent === "platform_register_done" || intent === "ask_tg_register" || hasPhone || hasTelegram) {
    return "need_phone_or_tg";
  }
  return "need_platform_register";
}
