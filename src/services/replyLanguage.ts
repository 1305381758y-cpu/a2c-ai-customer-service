import { detectLanguage, type MessageAnalysis } from "../domain/analyzer.js";
import type { MerchantAgentProfileRecord } from "../repositories.js";
import type { AppConfig } from "../config.js";
import type { AiTasks } from "./aiTasks.js";
import { translateForCustomer } from "./translation.js";

export async function refineMessageLanguage(
  ai: AiTasks,
  input: {
    runtimeConfig: AppConfig;
    country: { defaultLanguage: string };
    conversation: { language: string };
    analysis: MessageAnalysis;
    customerText: string;
    history: Array<{ direction: string; content: string; intent: string; createdAt: string }>;
  }
): Promise<MessageAnalysis> {
  const countryLanguage = normalizeCustomerLanguage(input.country.defaultLanguage || "");
  if (countryLanguage !== "unknown") {
    return { ...input.analysis, language: countryLanguage };
  }
  const currentLanguage = normalizeCustomerLanguage(input.analysis.language || "");
  const directLanguage = normalizeCustomerLanguage(detectLanguage(input.customerText, "unknown"));
  const previousLanguage = normalizeCustomerLanguage(input.conversation.language || "");
  if (shouldTrustDirectLanguageFallback(directLanguage, currentLanguage, previousLanguage, countryLanguage)) {
    return { ...input.analysis, language: directLanguage };
  }
  if (!shouldAskAiForLanguage(input.customerText, currentLanguage, previousLanguage, countryLanguage)) {
    return input.analysis;
  }
  const aiLanguage = normalizeCustomerLanguage(await ai.detectLanguage(input.runtimeConfig, {
    customerText: input.customerText,
    previousLanguage: input.conversation.language || "unknown",
    countryDefaultLanguage: input.country.defaultLanguage || "unknown",
    recentHistory: input.history
  }));
  if (aiLanguage === "unknown") {
    return input.analysis;
  }
  if (aiLanguage === currentLanguage) return input.analysis;
  return { ...input.analysis, language: aiLanguage };
}

export async function naturalizeStrictReply(
  ai: AiTasks,
  config: AppConfig,
  input: {
    customerText: string;
    draftReply: string;
    language: string;
    flowStep: string;
    questionType: string;
    history: Array<{ direction: string; content: string; intent: string; createdAt: string }>;
    allowLinkOrInvite: boolean;
    agentProfile?: MerchantAgentProfileRecord;
  }
): Promise<{ reply: string; used: boolean; error?: string }> {
  if (!input.customerText.trim()) {
    return { reply: input.draftReply, used: false };
  }
  if (input.questionType === "none" && input.draftReply.length <= 90 && !input.agentProfile?.enabled) {
    return { reply: input.draftReply, used: false };
  }
  const result = await ai.naturalizeStrictFlowText(config, {
    customerText: input.customerText,
    draftReply: input.draftReply,
    language: input.language,
    flowStep: input.flowStep,
    questionType: input.questionType,
    recentHistory: input.history,
    allowLinkOrInvite: input.allowLinkOrInvite,
    agentProfile: input.agentProfile
  });
  return { reply: result.text, used: result.used, error: result.error };
}

export interface LanguageGuardResult {
  reply: string;
  targetLanguage: string;
  status: "matched" | "translated" | "fallback" | "skipped";
  attempts: number;
  fallbackUsed: boolean;
  error?: string;
}

export async function ensureReplyCustomerLanguage(
  config: AppConfig,
  input: {
    reply: string;
    targetLanguage: string;
    flowStep: string;
    allowLinkOrInvite: boolean;
  }
): Promise<LanguageGuardResult> {
  const targetLanguage = normalizeCustomerLanguage(input.targetLanguage);
  const originalReply = input.reply.trim();
  if (!originalReply || targetLanguage === "unknown") {
    return { reply: originalReply, targetLanguage, status: "skipped", attempts: 0, fallbackUsed: false };
  }
  if (replyLooksLikeCustomerLanguage(originalReply, targetLanguage)) {
    return { reply: originalReply, targetLanguage, status: "matched", attempts: 0, fallbackUsed: false };
  }

  let lastError = "回复语言与客户语言不一致";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const translated = await translateForCustomer(config, originalReply, targetLanguage);
    if (translated.status === "translated" && replyLooksLikeCustomerLanguage(translated.translatedText, targetLanguage)) {
      return { reply: translated.translatedText, targetLanguage, status: "translated", attempts: attempt, fallbackUsed: false };
    }
    lastError = translated.error || lastError;
  }

  const fallback = strictLanguageFallback(input.flowStep, targetLanguage, originalReply, input.allowLinkOrInvite);
  return {
    reply: fallback,
    targetLanguage,
    status: "fallback",
    attempts: 2,
    fallbackUsed: true,
    error: lastError
  };
}

export function normalizeCustomerLanguage(language: string): string {
  const normalized = (language || "").trim().toLowerCase();
  if (!normalized || normalized === "unknown") return "unknown";
  if (normalized === "cn" || normalized === "zh" || normalized.startsWith("zh-")) return "zh";
  if (normalized === "pt" || normalized.startsWith("pt-")) return "pt-BR";
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  return normalized;
}

function shouldAskAiForLanguage(text: string, currentLanguage: string, previousLanguage: string, countryLanguage: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  if (/^https?:\/\//i.test(normalized) || /^@[A-Za-z0-9_]{5,32}$/.test(normalized) || /^\+?\d[\d\s-]{5,18}$/.test(normalized)) return false;
  if (!/[A-Za-zÀ-ÿ]/.test(normalized) || /[\u3400-\u9fff\u3040-\u30ff\u0e00-\u0e7f]/.test(normalized)) return false;
  const directLanguage = normalizeCustomerLanguage(detectLanguage(normalized, "unknown"));
  if (currentLanguage === "en" && directLanguage !== "unknown" && directLanguage !== "en") return true;
  if (countryLanguage !== "unknown" && countryLanguage !== "en" && currentLanguage === "en") return true;
  if (previousLanguage === "en" && currentLanguage === "en" && /^(si|sí|x favor|por favor|informaci[oó]n|info|dale|claro)$/i.test(normalized)) return true;
  if (normalized.length <= 24 && (currentLanguage === "unknown" || currentLanguage === "en") && countryLanguage !== "unknown" && countryLanguage !== currentLanguage) return true;
  return false;
}

function shouldTrustDirectLanguageFallback(directLanguage: string, currentLanguage: string, previousLanguage: string, countryLanguage: string): boolean {
  if (directLanguage === "unknown" || directLanguage === currentLanguage) return false;
  if (currentLanguage === "en" && (directLanguage === "es" || directLanguage === "pt-BR")) return true;
  if (previousLanguage === "en" && directLanguage !== "en") return true;
  if (countryLanguage !== "unknown" && directLanguage === countryLanguage) return true;
  return false;
}

function replyLooksLikeCustomerLanguage(reply: string, targetLanguage: string): boolean {
  const naturalText = stripNonLanguagePayload(reply);
  if (!naturalText) return true;
  const cjkCount = countMatches(naturalText, /[\u3400-\u9fff]/g);
  const latinCount = countMatches(naturalText, /[a-zA-ZÀ-ÿ]/g);
  if (targetLanguage === "zh") return cjkCount >= 2 || cjkCount >= latinCount;
  if (targetLanguage === "en" || targetLanguage === "pt-BR" || targetLanguage === "es") {
    if (cjkCount > 0 || latinCount === 0) return false;
    const detected = normalizeCustomerLanguage(detectLanguage(naturalText, "unknown"));
    if (detected === targetLanguage) return true;
    if (targetLanguage === "es") return looksSpanish(naturalText);
    if (targetLanguage === "pt-BR") return looksPortuguese(naturalText);
    return detected === "unknown" || detected === "en";
  }
  return cjkCount === 0 || latinCount === 0;
}

function looksSpanish(text: string): boolean {
  return /[¿¡ñáéíóúü]/i.test(text) ||
    /\b(hola|claro|usted|registro|registrarse|enlace|c[oó]digo|invitaci[oó]n|trabajo|ganancia|comisi[oó]n|plataforma|tel[eé]fono|usuario|contrase[ñn]a|gracias|s[ií]|por favor)\b/i.test(text);
}

function looksPortuguese(text: string): boolean {
  return /[ãõç]/i.test(text) ||
    /\b(ol[aá]|voc[eê]|cadastro|cadastrar|link|convite|trabalho|ganho|comiss[aã]o|plataforma|telefone|usu[aá]rio|senha|obrigad[oa]|sim|por favor)\b/i.test(text);
}

function stripNonLanguagePayload(reply: string): string {
  return reply
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/@\w+/g, " ")
    .replace(/\b\d[\d\s-]{3,}\b/g, " ")
    .replace(/邀请码[:：]?\s*\S*/g, " ")
    .replace(/invitation code[:：]?\s*\S*/gi, " ")
    .replace(/c[oó]digo de convite[:：]?\s*\S*/gi, " ")
    .replace(/c[oó]digo de invitaci[oó]n[:：]?\s*\S*/gi, " ")
    .trim();
}

function countMatches(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length ?? 0;
}

function strictLanguageFallback(flowStep: string, language: string, originalReply: string, allowLinkOrInvite: boolean): string {
  if (allowLinkOrInvite) return registrationFallback(language, originalReply);
  if (language === "en") return englishStrictFallback(flowStep);
  if (language === "pt-BR") return portugueseStrictFallback(flowStep);
  if (language === "es") return spanishStrictFallback(flowStep);
  return chineseStrictFallback(flowStep);
}

function registrationFallback(language: string, originalReply: string): string {
  const url = originalReply.match(/https?:\/\/\S+/i)?.[0]?.replace(/[，。,.]+$/, "") || "";
  const code = extractInviteCode(originalReply);
  if (language === "en") {
    return [
      "Okay, I will send you the registration link and invitation code now.",
      url ? `Registration link: ${url}` : "",
      code ? `Invitation code: ${code}` : "",
      "Registration steps:",
      "1. Open the link in your browser.",
      "2. Fill in your phone number.",
      "3. Set your username and password.",
      "4. Enter the invitation code.",
      "5. Submit the registration.",
      "After registration is completed, please tell me."
    ].filter(Boolean).join("\n");
  }
  if (language === "pt-BR") {
    return [
      "Certo, vou enviar agora o link de cadastro e o código de convite.",
      url ? `Link de cadastro: ${url}` : "",
      code ? `Código de convite: ${code}` : "",
      "Passos do cadastro:",
      "1. Abra o link no navegador.",
      "2. Preencha seu número de telefone.",
      "3. Defina seu nome de usuário e sua senha.",
      "4. Insira o código de convite.",
      "5. Envie o cadastro.",
      "Depois de concluir o cadastro, me avise."
    ].filter(Boolean).join("\n");
  }
  if (language === "es") {
    return [
      "De acuerdo, ahora le envío el enlace de registro y el código de invitación.",
      url ? `Enlace de registro: ${url}` : "",
      code ? `Código de invitación: ${code}` : "",
      "Pasos de registro:",
      "1. Abra el enlace en el navegador.",
      "2. Complete su número de teléfono.",
      "3. Cree su usuario y contraseña.",
      "4. Ingrese el código de invitación.",
      "5. Envíe el registro.",
      "Cuando termine el registro, avíseme."
    ].filter(Boolean).join("\n");
  }
  return chineseStrictFallback("wait_registration");
}

function extractInviteCode(value: string): string {
  return value.match(/(?:邀请码|invitation code|c[oó]digo de convite|c[oó]digo de invitaci[oó]n)[:：]?\s*([A-Za-z0-9_-]+)/i)?.[1] || "";
}

function englishStrictFallback(flowStep: string): string {
  const map: Record<string, string> = {
    interest_screening: "Hello, would you like to learn about an online part-time job?",
    registration_intent: "Okay, let me briefly explain: this online part-time job helps merchants improve product sales and rankings, and commission is calculated by tasks. Earnings are subject to platform rules. Do you have time to continue registration now?",
    wait_registration: "Okay, please follow the page steps first. After registration, send me the phone number you used. If you get stuck, tell me where.",
    telegram_confirm: "Congratulations, your registration is done. Please save your username and password. You need Telegram for the next step. Do you have the Telegram app?",
    telegram_download: "No problem. Search for Telegram in the Play Store or App Store, install it, then create an account. After that, send me your username starting with @.",
    collect_telegram: "Please send me your Telegram username. It should start with @.",
    human_handoff: "We are verifying your information. Please wait a moment."
  };
  return map[flowStep] ?? map.registration_intent;
}

function portugueseStrictFallback(flowStep: string): string {
  const map: Record<string, string> = {
    interest_screening: "Olá, você gostaria de conhecer um trabalho online de meio período?",
    registration_intent: "Certo, vou explicar rapidamente: este trabalho online ajuda comerciantes a melhorar vendas e ranqueamento de produtos, e a comissão depende das tarefas. Os ganhos seguem as regras da plataforma. Você tem tempo para continuar o cadastro agora?",
    wait_registration: "Certo, siga primeiro as etapas da página. Depois do cadastro, envie o telefone usado. Se travar em alguma parte, me diga onde.",
    telegram_confirm: "Parabéns, seu cadastro foi concluído. Guarde seu nome de usuário e senha. Você precisa do Telegram para a próxima etapa. Você tem o app Telegram?",
    telegram_download: "Sem problema. Procure Telegram na Play Store ou App Store, instale e crie uma conta. Depois envie seu nome de usuário começando com @.",
    collect_telegram: "Por favor, envie seu nome de usuário do Telegram. Ele deve começar com @.",
    human_handoff: "Estamos verificando suas informações. Aguarde um momento."
  };
  return map[flowStep] ?? map.registration_intent;
}

function spanishStrictFallback(flowStep: string): string {
  const map: Record<string, string> = {
    interest_screening: "Hola, ¿le gustaría conocer un trabajo de medio tiempo en línea?",
    registration_intent: "Claro, le explico brevemente: este trabajo en línea ayuda a comerciantes a mejorar ventas y posicionamiento, y la comisión depende de las tareas. Las ganancias siguen las reglas de la plataforma. ¿Tiene tiempo para continuar con el registro ahora?",
    wait_registration: "De acuerdo, siga primero los pasos de la página. Cuando termine el registro, envíeme el teléfono usado. Si se queda trabado en alguna parte, dígame dónde.",
    telegram_confirm: "Felicidades, el registro está listo. Guarde su usuario y contraseña. Para el siguiente paso necesita Telegram. ¿Tiene la aplicación Telegram?",
    telegram_download: "No hay problema. Busque Telegram en Play Store o App Store, instálelo y cree una cuenta. Después envíeme su usuario que empieza con @.",
    collect_telegram: "Por favor envíeme su usuario de Telegram. Debe empezar con @.",
    human_handoff: "Estamos verificando su información. Espere un momento, por favor."
  };
  return map[flowStep] ?? map.registration_intent;
}

function chineseStrictFallback(flowStep: string): string {
  const map: Record<string, string> = {
    interest_screening: "您好，您是想了解一份兼职在线工作吗？",
    registration_intent: "好的，我简单介绍一下：这份兼职主要是帮商家提升产品销量和排名，佣金按任务和平台规则核算。您现在方便继续开户注册吗？",
    wait_registration: "好的，您先按页面操作，注册好后把手机号发我；卡在哪一步也可以直接告诉我。",
    telegram_confirm: "恭喜，注册已完成。请保存好用户名和密码。下一步需要 Telegram，您有 Telegram 应用吗？",
    telegram_download: "没关系，您可以在 Play Store 或 App Store 搜索 Telegram 下载并注册。完成后把 @ 开头的用户名发给我。",
    collect_telegram: "请把您的 Telegram 用户名发送给我，需要是 @ 开头的用户名。",
    human_handoff: "我们正在核实，请稍后。"
  };
  return map[flowStep] ?? map.registration_intent;
}
