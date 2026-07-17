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
  // Registration messages can contain surrounding words, such as
  // "注册完成了 78567876". Keep the whole numeric token and accept the
  // eight-digit numbers used by the configured test/market flow.
  const matches = stripUrls(text).match(/\+?\d(?:[\s-]?\d){7,15}/g);
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
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  if (fallback !== "unknown" && shouldKeepPreviousLanguage(trimmed, fallback)) return fallback;

  const signals = detectLanguageSignals(trimmed);
  const dominant = signals[0];
  if (fallback !== "unknown" && dominant && dominant.language !== fallback) {
    const fallbackSignal = signals.find((item) => item.language === fallback);
    if (fallbackSignal && fallbackSignal.score >= 4) return fallback;
    const competingSignals = signals.filter((item) => !(item.language === "en" && item.score <= 2 && !item.strong));
    const runnerUp = competingSignals.find((item) => item.language !== dominant.language);
    const dominantRatio = dominant.score / Math.max(1, signals.reduce((sum, item) => sum + item.score, 0));
    const hasMultipleSignals = Boolean(runnerUp && runnerUp.score >= 2);
    const shouldTrustLatinSignalOverStaleEnglish =
      normalizeLanguageCode(fallback) === "en" &&
      (dominant.language === "es" || dominant.language === "pt-BR") &&
      dominant.score >= 3 &&
      (!fallbackSignal || fallbackSignal.score <= 3 || dominant.score - fallbackSignal.score >= 4);
    const shouldSwitch =
      shouldTrustLatinSignalOverStaleEnglish ||
      dominant.strong &&
        dominant.score >= 6 &&
        dominantRatio >= 0.7 &&
        !hasMultipleSignals;
    if (!shouldSwitch) return fallback;
  }

  if (dominant) return dominant.language;
  const lower = text.toLowerCase();
  if (/[A-Za-z]/.test(text)) return "en";
  return lower ? fallback : "unknown";
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

function shouldKeepPreviousLanguage(text: string, fallback: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[。.!?！？,，;；:：]+$/g, "")
    .trim();
  if (normalizeLanguageCode(fallback) === "en" && isSpanishShortSignal(normalized)) return false;
  return isShortContextualReply(normalized) ||
    isGreeting(normalized) ||
    /^(装好了|安裝好了|安装好了|下载好了|下載好了|已经下载|已下載|已经装|已安装|installed|downloaded|instalei|baixei)$/i.test(normalized) ||
    /^@[A-Za-z0-9_]{5,32}$/.test(normalized) ||
    /^\+?\d[\d\s-]{5,18}$/.test(normalized);
}

function isSpanishShortSignal(text: string): boolean {
  return /^(hola|buenos dias|buenos días|buenas tardes|buenas noches|si|sí|x favor|x fa|xfa|porfa|por favor|informacion|información|info|quiero informaci[oó]n|necesito informaci[oó]n|finalizado|finalizada|finalic[eé]|terminado|terminada|ya\s+termin[eé]|completado|completada|ya\s+complet[eé]|registrado|registrada)$/i.test(text);
}

function detectLanguageSignals(text: string): Array<{ language: string; score: number; strong: boolean }> {
  const scores = new Map<string, { score: number; strong: boolean }>();
  const add = (language: string, score: number, strong = false) => {
    if (score <= 0) return;
    const previous = scores.get(language) ?? { score: 0, strong: false };
    scores.set(language, { score: previous.score + score, strong: previous.strong || strong });
  };
  const count = (regex: RegExp) => text.match(regex)?.length ?? 0;

  const kana = count(/[\u3040-\u30FF]/g);
  const han = count(/[\u4E00-\u9FFF]/g);
  add("th", count(/[\u0E00-\u0E7F]/g) * 4, count(/[\u0E00-\u0E7F]/g) > 0);
  add("ja", kana * 5, kana > 0);
  add("ar", count(/[\u0600-\u06FF]/g) * 4, count(/[\u0600-\u06FF]/g) > 0);
  add("ru", count(/[А-Яа-яЁё]/g) * 4, count(/[А-Яа-яЁё]/g) > 0);
  add("ko", count(/[가-힣]/g) * 4, count(/[가-힣]/g) > 0);
  if (kana === 0) add("zh", han * 3, han >= 2);
  if (/(こんにちは|こんばんは|おはよう|登録|電話番号|アカウント|テレグラム|よろしく)/.test(text)) add("ja", 6, true);

  const lower = text.toLowerCase();
  if (isSpanishShortSignal(lower)) add("es", 7, true);
  if (/\b(me|por favor|favor)\s+(manda|mande|envia|envía|pasa|pase)\b/.test(lower)) add("es", 6, true);
  if (/\b(el|la|un|una)\s+link\b|\blink\s+(de|del|para)\b/.test(lower)) add("es", 4, true);
  if (/\b(todav[ií]a|a[uú]n|sigue)\s+no\b.*\b(carga|cargar|abre|abrir|acceder)\b|\bno\s+(puedo|logro|se puede)\s+(acceder|abrir|cargar)\b|\b(enlace|p[aá]gina)\b.*\b(no|sin)\b.*\b(carga|cargar|abre|abrir|acceder)\b/.test(lower)) add("es", 7, true);
  addKeywordScore(lower, add, "es", [
    /\b(hola|buenos dias|buenos días|buen dia|buen día|buenas tardes|buenas noches|registrar|registro|registrado|registrada|telefono|teléfono|trabajo|trabajar|quiero|quisiera|puedo|gracias|sí|si|necesito|ayuda|informacion|información|favor|porfa|xfa|claro|dale|como|cómo|que|qué|hay|hacer|funciona|funcionar|llama|empresa|donde|dónde|son|esta|está|bien|empiezo|enpiezo|certificacion|certificación|legal|tiene|pruebas|empleados|trabajaron|ustedes|cuanto|cuánto|invertir|inversion|inversión|inverción|debo|devo|ingresar|mande|manda|interesa|listo|lista|termine|terminé|hice|completo|complet[oó]|completado|completada|finalizado|finalizada|finalicé|finalice|terminado|terminada|ahora|momento|todavia|todavía|cargar|carga|acceder|enlace|abrir|abre|puede)\b/g
  ]);
  addKeywordScore(lower, add, "fr", [
    /\b(bonjour|bonsoir|salut|inscription|compte|telephone|téléphone|travail|merci)\b/g
  ]);
  addKeywordScore(lower, add, "ms", [
    /\b(saya|anda|boleh|daftar|akaun|telefon|terima kasih|mahu)\b/g
  ]);
  addKeywordScore(lower, add, "id", [
    /\b(saya|kamu|daftar|akun|nomor|terima kasih|bisa)\b/g
  ]);
  addKeywordScore(lower, add, "vi", [
    /\b(xin chào|dang ky|đăng ký|tai khoan|tài khoản|so dien thoai|số điện thoại|cảm ơn)\b/g
  ]);
  addKeywordScore(lower, add, "pt-BR", [
    /(^|\s)(olá|ola|oi|bom dia|boa tarde|boa noite|cadastro|cadastrar|conta|telefone|obrigado|obrigada|meu|minha|você|voce|trabalho|convite|pix|brasil|não|nao|tenho|como faço|como faco|faço|faco|sim|quero)(\s|$|[,.!?;:])/g
  ]);
  addKeywordScore(lower, add, "en", [
    /\b(hello|hi|hey|good morning|good afternoon|good evening|register|registration|phone|number|work|job|link|help|how|yes|ok|telegram|account|open|opened|cannot|can't|failed|error)\b/g
  ], 2);
  if (/[A-Za-z]/.test(text)) add("en", 1, false);

  return [...scores.entries()]
    .map(([language, value]) => ({ language, ...value }))
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score);
}

function normalizeLanguageCode(language: string): string {
  const normalized = language.trim().toLowerCase();
  if (normalized === "pt" || normalized.startsWith("pt-")) return "pt-BR";
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  if (normalized === "es" || normalized.startsWith("es-")) return "es";
  if (normalized === "zh" || normalized.startsWith("zh-") || normalized === "cn") return "zh";
  return normalized;
}

function addKeywordScore(
  text: string,
  add: (language: string, score: number, strong?: boolean) => void,
  language: string,
  patterns: RegExp[],
  weight = 3
): void {
  let hits = 0;
  for (const pattern of patterns) {
    hits += text.match(pattern)?.length ?? 0;
  }
  add(language, hits * weight, hits >= 2);
}

function detectIntent(text: string, hasPhone: boolean, hasTelegram: boolean): IntentLabel {
  const lower = text.toLowerCase().trim();
  if (!lower) return "unknown";
  if (hasPhone && hasTelegram) return "provide_phone_and_telegram";
  if (hasTelegram) return "provide_telegram";
  if (hasPhone) return "provide_phone";
  if (isGreeting(lower)) return "greeting";
  if (/(人工|真人|客服|human|agent|operator|manual|atendente|humano|suporte)/i.test(text)) return "human_request";
  if (isPlatformRegistrationDoneMessage(text)) return "platform_register_done";
  if (isPlatformQuestion(text)) return "ask_platform_register";
  if (/(注册|开户|sign up|signup|register|daftar|สมัคร|cadastro|cadastrar|registrar|abrir conta)/i.test(text)) return "ask_platform_register";
  if (/(telegram|tg|电报|飞机|เทเลแกรม)/i.test(text)) return "ask_tg_register";
  if (/(链接|link|url|入口|网址|endereço|acesso)/i.test(text)) return "ask_link";
  if (/(优惠|活动|奖励|promotion|bonus|reward|promo|promoção|promocao|bônus|bonus|recompensa)/i.test(text)) return "ask_promotion";
  if (/(安全|真的假的|真实|真實|正规公司|正規公司|正规|正規|可信|靠谱吗|骗人|骗子|诈骗|scam|safe|trust|real|percaya|seguro|confiável|confiavel|golpe|verdade)/i.test(text)) return "trust_concern";
  if (/(不会|帮我|怎么|如何|help|how|cannot|can't|tak tahu|tidak tahu|bantuan|ajuda|como faço|não consigo|nao consigo)/i.test(text)) return "need_help";
  if (isInitialConsultation(text)) return "greeting";
  if (isPositiveConfirmation(text)) return "greeting";
  if (lower.length <= 2 || /(.)\1{6,}/.test(lower)) return "irrelevant_or_spam";
  return "unknown";
}

function isPlatformRegistrationDoneMessage(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[。.!?！？,，;；:：]+$/g, "")
    .trim();
  const completion = /(完成|好了|已注册|已註冊|注册完|註冊完|done|finished|registered|siap|sudah|เสร็จ|terminei|concluí|conclui|cadastrei|registrado|registrada|pronto|finalizado|finalizada|finalicé|finalice|terminado|terminada|completado|completada)/i;
  if (/^(好了|完成了|done|finished|registered|siap|sudah|เสร็จ|terminei|concluí|conclui|cadastrei|registrado|registrada|pronto|finalizado|finalizada|finalicé|finalice|terminado|terminada|completado|completada)$/i.test(normalized)) {
    return true;
  }
  const registrationContext = /(注册|註冊|开户|開戶|register|registration|sign(?:ed)?\s*up|cadastro|cadastr|registrar|registro)/i;
  return registrationContext.test(normalized) && completion.test(normalized);
}

export function isPositiveConfirmation(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[。.!?！？,，;；:：]+$/g, "")
    .replace(/[啊呀呢哈啦哦嘛呗]+$/g, "")
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
  if (intent === "platform_register_done" || intent === "ask_tg_register" || intent === "no_telegram" || hasPhone || hasTelegram) {
    return "need_phone_or_tg";
  }
  return "need_platform_register";
}
