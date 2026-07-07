import type { AppConfig } from "../config.js";

export function shouldUseInviteForReply(
  country: { requirePlatformAccount: boolean },
  conversation: { stage: string; extractedPhone: string; extractedTelegram: string; status: string },
  intent: string,
  customerText: string
): boolean {
  if (!country.requirePlatformAccount || conversation.status === "human_handoff") return false;
  return asksForRegistrationLink(customerText, intent);
}

function asksForRegistrationLink(customerText: string, intent: string): boolean {
  return intent === "ask_link" || intent === "ask_platform_register" || /(邀请码|邀請碼|开户链接|注册链接|注册入口|link|invite code|invitation code|código|codigo|convite|cadastro)/i.test(customerText);
}

export function suppressRegistrationDetailsForNonLinkStep(
  reply: string,
  config: Pick<AppConfig, "PLATFORM_REGISTER_URL">,
  country: { platformRegisterUrl?: string; requireTelegram?: boolean },
  conversation: { extractedPhone?: string; extractedTelegram?: string },
  language: string
): string {
  const cleaned = reply
    .split(/(?<=[。！？])\s*|\n+/)
    .map((part) => stripKnownRegistrationUrls(part, config, country).trim())
    .filter((part) => part && !isRegistrationInviteSentence(part) && !isEmptyRegistrationInstruction(part))
    .join(language === "zh" || /[\u4E00-\u9FFF]/.test(reply) ? "" : " ")
    .replace(/\s{2,}/g, " ")
    .replace(/([。.!?！？]){2,}/g, "$1")
    .trim();
  if (country.requireTelegram && conversation.extractedPhone && !conversation.extractedTelegram) {
    if (cleaned && !asksForAlreadyCollectedPhone(cleaned) && !isLowSignalReply(cleaned)) return cleaned;
    if (language === "en") return "Please confirm Telegram first. After that, I will send you the teacher's Telegram link.";
    if (language === "pt-BR") return "Confirme primeiro o Telegram. Depois disso, vou enviar o link do Telegram da professora.";
    return "请先确认 Telegram，之后我会把老师的 Telegram 链接发给您。";
  }
  if (cleaned && !isLowSignalReply(cleaned)) return cleaned;
  if (language === "en") return "I am here. Please tell me whether you want to continue registration, check Telegram, or verify your phone number, and I will handle that step.";
  if (language === "pt-BR") return "Estou aqui. Me diga se você quer continuar o cadastro, resolver o Telegram ou confirmar o telefone, e eu sigo por essa etapa.";
  return "我在的。您可以直接告诉我：继续注册、处理 Telegram，还是核对手机号，我会按当前这一步处理。";
}

function stripKnownRegistrationUrls(
  value: string,
  config: Pick<AppConfig, "PLATFORM_REGISTER_URL">,
  country: { platformRegisterUrl?: string }
): string {
  let result = value;
  for (const template of [country.platformRegisterUrl || "", config.PLATFORM_REGISTER_URL || ""]) {
    if (!template) continue;
    const escaped = escapeRegExp(template);
    const pattern = new RegExp(
      escaped.replace("\\{code\\}", "[^\\s。.!?！？，,；;]+"),
      "gi"
    );
    result = result.replace(pattern, "");
    for (const candidate of registrationUrlCandidates(template)) {
      result = result.split(candidate).join("");
    }
  }
  return result
    .replace(/(?:开户链接和邀请码|开户链接|注册链接|注册入口|开户链接和邀請碼|registration link and invitation code|registration link|register link|link de cadastro e código de convite|link de cadastro)\s*[:：]?\s*/gi, "")
    .replace(/(?:邀请码|邀請碼|invitation code|invite code|código de convite|codigo de convite)\s*[:：]?\s*[A-Za-z0-9_-]+/gi, "")
    .trim();
}

function registrationUrlCandidates(template: string): string[] {
  const withoutCode = template.replace(/\{code\}/g, "");
  const withoutTrailingSlash = withoutCode.replace(/\/+$/, "");
  const withTrailingSlash = `${withoutTrailingSlash}/`;
  return Array.from(new Set([template, withoutCode, withoutTrailingSlash, withTrailingSlash].filter(Boolean)));
}

function isRegistrationInviteSentence(value: string): boolean {
  const hasInvite = /(邀请码|邀請碼|invite code|invitation code|código de convite|codigo de convite|convite)/i.test(value);
  const hasRegister = /(开户链接|注册链接|注册入口|点击.*注册|开户注册|register|registration link|cadastro)/i.test(value);
  const hasUrl = /https?:\/\//i.test(value);
  return (hasInvite || hasUrl) && hasRegister || hasInvite;
}

function isEmptyRegistrationInstruction(value: string): boolean {
  const normalized = value.replace(/\s+/g, "");
  const asksToClickMissingLink = /(点击|打開|打开|open|acesse|clique).*(链接|連結|link)/i.test(value) && !/https?:\/\//i.test(value);
  const mentionsRegistration = /(开户注册|注册|註冊|register|registration|cadastro)/i.test(value);
  const onlyRegisterShell = /[:：]\s*[。.!！?？]?$/.test(value) || /链接[：:]?[。.!！?？]?$/i.test(normalized);
  return mentionsRegistration && (asksToClickMissingLink || onlyRegisterShell);
}

function asksForAlreadyCollectedPhone(value: string): boolean {
  return /(手机号|手機號|电话号码|電話號碼|phone number|telefone|número de telefone|numero de telefone)/i.test(value);
}

function isLowSignalReply(value: string): boolean {
  return /^(您好|你好|嗨|hello|hi|ol[aá]|oi)[!！.。]*$/i.test(value.trim());
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
