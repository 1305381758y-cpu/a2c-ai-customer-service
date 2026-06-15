import type { AppConfig } from "../config.js";
import type { A2CInviteCodeRecord, Conversation, MerchantCountryRecord, MerchantRecord } from "../repositories.js";
import type { MessageAnalysis } from "./analyzer.js";

export const STRICT_FLOW_STEPS = [
  "first_greeting",
  "interest_screening",
  "project_intro",
  "registration_intent",
  "send_register_link",
  "wait_registration",
  "telegram_confirm",
  "telegram_download",
  "collect_telegram",
  "human_handoff",
  "ended"
] as const;

export type StrictFlowStep = (typeof STRICT_FLOW_STEPS)[number];

export interface StrictFlowInput {
  merchant: MerchantRecord;
  country: MerchantCountryRecord;
  conversation: Conversation;
  analysis: MessageAnalysis;
  customerText: string;
  inviteCode?: A2CInviteCodeRecord;
  config: AppConfig;
}

export interface StrictFlowReply {
  enabled: boolean;
  reply: string;
  language: string;
  nextFlowStep: StrictFlowStep;
  stage: Conversation["stage"];
  needsInviteCode: boolean;
  fallback?: boolean;
}

const flowStepSet = new Set<string>(STRICT_FLOW_STEPS);

export function isStrictFlowEnabled(merchant: MerchantRecord, country: MerchantCountryRecord): boolean {
  const merchantName = merchant.name.trim().toLowerCase();
  const merchantId = merchant.id.trim().toLowerCase();
  const countryName = country.name.trim().toLowerCase();
  const countryCode = country.code.trim().toLowerCase();
  const isAston = merchantName.includes("阿斯顿") || merchantName.includes("aston") || merchantId.includes("aston");
  const isBrazil = countryName.includes("巴西") || countryName.includes("brazil") || countryCode === "br";
  return isAston && isBrazil;
}

export function strictFlowNeedsInviteCode(input: Pick<StrictFlowInput, "merchant" | "country" | "conversation" | "analysis" | "customerText">): boolean {
  if (!isStrictFlowEnabled(input.merchant, input.country) || !input.country.requirePlatformAccount) return false;
  if (input.conversation.extractedPhone && input.conversation.extractedTelegram) return false;
  const step = normalizeFlowStep(input.conversation.flowStep);
  return step === "registration_intent" || step === "send_register_link" || step === "wait_registration" || asksForInviteOrLink(input.customerText, input.analysis.intent);
}

export function buildStrictFlowReply(input: StrictFlowInput): StrictFlowReply {
  if (!isStrictFlowEnabled(input.merchant, input.country)) {
    return {
      enabled: false,
      reply: "",
      language: input.analysis.language,
      nextFlowStep: "first_greeting",
      stage: input.conversation.stage,
      needsInviteCode: false
    };
  }

  const language = normalizeReplyLanguage(input.analysis.language, input.conversation.language, input.country.defaultLanguage);
  const step = normalizeFlowStep(input.conversation.flowStep);
  const text = input.customerText.trim();
  const positive = isPositive(text, input.analysis.intent);
  const negativeTelegram = saysNoTelegram(text);
  const asksLink = asksForInviteOrLink(text, input.analysis.intent);

  if (!step || step === "first_greeting") {
    return reply(input, language, "interest_screening", "need_platform_register", scriptLine("first_greeting", language));
  }

  if ((input.analysis.telegram || input.conversation.extractedTelegram) && !(input.analysis.phone || input.conversation.extractedPhone)) {
    return reply(input, language, "collect_telegram", "need_phone_or_tg", scriptLine("ask_registered_phone", language));
  }

  if (step === "interest_screening") {
    if (positive || input.analysis.intent === "ask_platform_register") {
      return reply(input, language, "registration_intent", "need_platform_register", scriptLine("project_intro", language));
    }
    if (asksLink) {
      return reply(input, language, "registration_intent", "need_platform_register", scriptLine("registration_intent", language));
    }
    return reply(input, language, "interest_screening", "need_platform_register", scriptLine("interest_screening_retry", language));
  }

  if (step === "project_intro") {
    return reply(input, language, "registration_intent", "need_platform_register", scriptLine("project_intro", language));
  }

  if (step === "registration_intent") {
    if (positive || asksLink || input.analysis.intent === "ask_platform_register") {
      return reply(input, language, "wait_registration", "need_platform_register", registerInstruction(input, language), true);
    }
    return reply(input, language, "registration_intent", "need_platform_register", scriptLine("registration_intent", language));
  }

  if (step === "send_register_link") {
    return reply(input, language, "wait_registration", "need_platform_register", registerInstruction(input, language), true);
  }

  if (step === "wait_registration") {
    if (input.analysis.intent === "platform_register_done" || input.analysis.phone || input.conversation.extractedPhone) {
      return reply(input, language, "telegram_confirm", "need_tg_register", scriptLine(input.analysis.phone || input.conversation.extractedPhone ? "telegram_confirm" : "ask_registered_phone", language));
    }
    if (asksLink) {
      return reply(input, language, "wait_registration", "need_platform_register", registerInstruction(input, language), true);
    }
    return reply(input, language, "wait_registration", "need_platform_register", scriptLine("wait_registration", language));
  }

  if (step === "telegram_confirm") {
    if (negativeTelegram) {
      return reply(input, language, "telegram_download", "need_tg_register", scriptLine("telegram_download", language));
    }
    if (positive || input.analysis.intent === "ask_tg_register") {
      return reply(input, language, "collect_telegram", "need_tg_register", scriptLine("collect_telegram", language));
    }
    return reply(input, language, "telegram_confirm", "need_tg_register", scriptLine("telegram_confirm_question", language));
  }

  if (step === "telegram_download") {
    return reply(input, language, "collect_telegram", "need_tg_register", scriptLine("collect_telegram", language));
  }

  if (step === "collect_telegram") {
    if (negativeTelegram) {
      return reply(input, language, "telegram_download", "need_tg_register", scriptLine("telegram_download", language));
    }
    return reply(input, language, "collect_telegram", "need_tg_register", scriptLine("collect_telegram_retry", language));
  }

  return reply(input, language, "ended", "ready_for_handoff", verificationLine(language));
}

function reply(
  input: StrictFlowInput,
  language: string,
  nextFlowStep: StrictFlowStep,
  stage: Conversation["stage"],
  content: string,
  needsInviteCode = false
): StrictFlowReply {
  return {
    enabled: true,
    reply: content,
    language,
    nextFlowStep,
    stage,
    needsInviteCode,
    fallback: !input.inviteCode && needsInviteCode
  };
}

function normalizeFlowStep(value: string): StrictFlowStep | "" {
  return flowStepSet.has(value) ? value as StrictFlowStep : "";
}

function normalizeReplyLanguage(detected: string, previous: string, defaultLanguage: string): string {
  const value = detected && detected !== "unknown" ? detected : previous && previous !== "unknown" ? previous : defaultLanguage;
  return value && value !== "unknown" ? value : "pt-BR";
}

function isPositive(text: string, intent: string): boolean {
  if (intent === "platform_register_done") return true;
  return /(可以|好的|好|是|想|有兴趣|了解|继续|准备好了|yes|ok|okay|sure|interested|quero|sim|tenho interesse|pode|vamos|continuar|claro|pronto)/i.test(text.trim());
}

function saysNoTelegram(text: string): boolean {
  return /(没有|沒有|无|不用|不会|不想|没有tg|没有 telegram|no telegram|don't have telegram|dont have telegram|sem telegram|não tenho telegram|nao tenho telegram|não tenho|nao tenho)/i.test(text.trim());
}

function asksForInviteOrLink(text: string, intent: string): boolean {
  return intent === "ask_link" || /(邀请码|邀請碼|链接|开户链接|link|invite code|invitation code|código|codigo|convite|cadastro)/i.test(text);
}

function registerInstruction(input: StrictFlowInput, language: string): string {
  const display = inviteDisplayText(input.inviteCode, language, input.country.platformRegisterUrl || input.config.PLATFORM_REGISTER_URL);
  if (!input.inviteCode) {
    return scriptLine("missing_invite", language, display);
  }
  if (language === "en") {
    return `Okay, I will send you the registration link and invitation code now.\n${display}\nOpen the link in your browser, fill in your phone number, email or phone number, password, and the invitation code. After registration, please tell me when it is completed.`;
  }
  if (language === "pt-BR") {
    return `Certo, vou enviar agora o link de cadastro e o código de convite.\n${display}\nAbra o link no navegador, preencha seu telefone, e-mail ou telefone, senha e o código de convite. Depois de concluir o cadastro, me avise.`;
  }
  return `好的，现在我会把链接和邀请码发给您。\n${display}\n复制此链接并在浏览器中打开，然后填写手机号码、邮箱或手机号码、密码和邀请码。完成注册后请告诉我。`;
}

function inviteDisplayText(inviteCode: A2CInviteCodeRecord | undefined, language: string, fallbackUrl = ""): string {
  if (!inviteCode) return fallbackUrl || "";
  const template = inviteCode.registerUrl || fallbackUrl;
  const url = template ? template.includes("{code}") ? template.replaceAll("{code}", encodeURIComponent(inviteCode.code)) : template : "";
  if (template.includes("{code}")) {
    if (language === "en") return `Exclusive registration link: ${url}\nInvitation code: ${inviteCode.code}`;
    if (language === "pt-BR") return `Link exclusivo de cadastro: ${url}\nCódigo de convite: ${inviteCode.code}`;
    return `专属开户链接：${url}\n邀请码：${inviteCode.code}`;
  }
  if (language === "en") return `Registration link: ${url || "confirming"}\nInvitation code: ${inviteCode.code}`;
  if (language === "pt-BR") return `Link de cadastro: ${url || "confirmando"}\nCódigo de convite: ${inviteCode.code}`;
  return `开户链接：${url || "确认中"}\n邀请码：${inviteCode.code}`;
}

function verificationLine(language: string): string {
  if (language === "en") return "We are verifying your information. Please wait a moment.";
  if (language === "pt-BR") return "Estamos verificando suas informações. Aguarde um momento.";
  return "我们正在核实，请稍后。";
}

function scriptLine(key: string, language: string, fallback = ""): string {
  const zh: Record<string, string> = {
    first_greeting: "您好，您是想找一份兼职在线工作来赚取额外收入吗？",
    interest_screening_retry: "您好，您是想了解这份兼职在线工作吗？如果您感兴趣，我可以先简单介绍。",
    project_intro: "好的，我先简单介绍一下，您可以自行决定是否接受这份工作。我们的目标是通过兼职在线工作，帮助商家提升产品销量和排名。您每天可以赚取 300 至 800 雷亚尔。您现在在家有空闲时间吗？",
    registration_intent: "要开始您的第一份工作并赚取佣金，您需要先在我们的平台上注册。准备好注册了吗？我会一步一步教您完成。",
    wait_registration: "请告知我您是否已完成注册。完成后，请将您注册的手机号码发送给我，以便我们进行验证。",
    ask_registered_phone: "好的，请将您注册的手机号码发送给我，以便我们进行验证。",
    telegram_confirm: "恭喜！您已成功注册。您需要一个 Telegram 账号才能领取注册奖励。您有 Telegram 应用吗？",
    telegram_confirm_question: "您有 Telegram 应用吗？如果有，请把您的 Telegram 用户名发给我。",
    telegram_download: "您需要下载 Telegram。如果手机里有 Play Store 或 App Store，可以直接搜索并下载 Telegram。创建 Telegram 账号后，请把 @ 开头的用户名发给我。",
    collect_telegram: "您注册好 Telegram 账号了吗？请把 @ 开头的 Telegram 用户名发送给我。",
    collect_telegram_retry: "请把您的 Telegram 用户名发送给我，需要是 @ 开头的用户名。",
    missing_invite: `注册需要邀请码。我这边正在确认您的专属邀请码，请稍等。${fallback ? `\n开户链接：${fallback}` : ""}`
  };
  const en: Record<string, string> = {
    first_greeting: "Hello, are you looking for a part-time online job to earn extra income?",
    interest_screening_retry: "Hello, would you like to learn about this part-time online job? If you are interested, I can briefly introduce it.",
    project_intro: "Okay, let me briefly introduce it first. You can decide whether to accept this job. Our goal is to help merchants improve product sales and rankings through part-time online work. You can earn 300 to 800 reais per day. Do you have free time at home now?",
    registration_intent: "To start your first job and earn commission, you need to register on our platform first. Are you ready to register? I will guide you step by step.",
    wait_registration: "Please let me know whether you have completed the registration. After that, send me the phone number you registered with so we can verify it.",
    ask_registered_phone: "Okay, please send me the phone number you registered with so we can verify it.",
    telegram_confirm: "Congratulations, you have registered successfully. You need a Telegram account to receive the registration reward. Do you have the Telegram app?",
    telegram_confirm_question: "Do you have the Telegram app? If yes, please send me your Telegram username.",
    telegram_download: "You need to download Telegram. If your phone has Play Store or App Store, search for Telegram and download it. After creating your Telegram account, please send me the username starting with @.",
    collect_telegram: "Have you registered your Telegram account? Please send me your Telegram username starting with @.",
    collect_telegram_retry: "Please send me your Telegram username. It should start with @.",
    missing_invite: `Registration requires an invitation code. I am confirming your dedicated invitation code now. Please wait a moment.${fallback ? `\nRegistration link: ${fallback}` : ""}`
  };
  const pt: Record<string, string> = {
    first_greeting: "Olá, você está procurando um trabalho online de meio período para ganhar uma renda extra?",
    interest_screening_retry: "Olá, você gostaria de conhecer este trabalho online de meio período? Se tiver interesse, posso explicar rapidamente.",
    project_intro: "Certo, vou explicar rapidamente primeiro. Você pode decidir se quer aceitar este trabalho. Nosso objetivo é ajudar comerciantes a aumentar as vendas e o ranqueamento dos produtos por meio de trabalho online de meio período. Você pode ganhar de 300 a 800 reais por dia. Você tem tempo livre em casa agora?",
    registration_intent: "Para começar seu primeiro trabalho e ganhar comissão, você precisa se cadastrar primeiro na nossa plataforma. Você está pronto para se cadastrar? Vou orientar você passo a passo.",
    wait_registration: "Por favor, me avise se você já concluiu o cadastro. Depois disso, envie o número de telefone usado no cadastro para fazermos a verificação.",
    ask_registered_phone: "Certo, envie o número de telefone usado no cadastro para fazermos a verificação.",
    telegram_confirm: "Parabéns, seu cadastro foi concluído. Você precisa de uma conta no Telegram para receber a recompensa de cadastro. Você tem o aplicativo Telegram?",
    telegram_confirm_question: "Você tem o aplicativo Telegram? Se tiver, envie seu nome de usuário do Telegram.",
    telegram_download: "Você precisa baixar o Telegram. Se o seu celular tiver Play Store ou App Store, pesquise por Telegram e baixe o aplicativo. Depois de criar a conta, envie o nome de usuário começando com @.",
    collect_telegram: "Você já registrou sua conta no Telegram? Envie seu nome de usuário do Telegram começando com @.",
    collect_telegram_retry: "Por favor, envie seu nome de usuário do Telegram. Ele deve começar com @.",
    missing_invite: `O cadastro precisa de código de convite. Estou confirmando seu código exclusivo agora. Aguarde um momento.${fallback ? `\nLink de cadastro: ${fallback}` : ""}`
  };
  if (language === "en") return en[key] ?? zh[key] ?? "";
  if (language === "pt-BR") return pt[key] ?? zh[key] ?? "";
  return zh[key] ?? "";
}
