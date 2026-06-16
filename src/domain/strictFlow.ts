import type { AppConfig } from "../config.js";
import type { A2CInviteCodeRecord, Conversation, MerchantCountryRecord, MerchantRecord } from "../repositories.js";
import type { InternalIntentLabel, MessageAnalysis } from "./analyzer.js";

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
  inferredIntent?: InternalIntentLabel;
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
  const isBrazil = countryName.includes("巴西") || countryName.includes("brazil") || countryName.includes("brasil") || countryCode === "br" || countryCode === "brasil";
  const isUnconfiguredMarket =
    !countryName ||
    !countryCode ||
    countryName.includes("默认") ||
    countryName.includes("default") ||
    countryCode === "default" ||
    countryCode === "unknown";
  return isAston && (isBrazil || isUnconfiguredMarket);
}

export function strictFlowNeedsInviteCode(input: Pick<StrictFlowInput, "merchant" | "country" | "conversation" | "analysis" | "customerText" | "inferredIntent">): boolean {
  if (!isStrictFlowEnabled(input.merchant, input.country) || !input.country.requirePlatformAccount) return false;
  if (input.conversation.extractedPhone && input.conversation.extractedTelegram) return false;
  const step = normalizeFlowStep(input.conversation.flowStep);
  return step === "registration_intent" || step === "send_register_link" || input.inferredIntent === "ask_link" || asksForInviteOrLink(input.customerText, input.analysis.intent);
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
  const positive = isPositive(text, input.analysis.intent, input.inferredIntent);
  const negativeTelegram = saysNoTelegram(text);
  const asksLink = asksForInviteOrLink(text, input.analysis.intent);
  const inferredIntent = input.inferredIntent ?? "unknown";

  if (!step || step === "first_greeting") {
    return reply(input, language, "interest_screening", "need_platform_register", scriptLine("first_greeting", language));
  }

  if ((input.analysis.telegram || input.conversation.extractedTelegram) && !(input.analysis.phone || input.conversation.extractedPhone)) {
    return reply(input, language, "collect_telegram", "need_phone_or_tg", scriptLine("ask_registered_phone", language));
  }

  if (step === "interest_screening") {
    if (positive) {
      return reply(input, language, "registration_intent", "need_platform_register", joinReplyParts(scriptLine("project_intro", language), scriptLine("bridge_registration_intent", language), language));
    }
    if (inferredIntent === "ask_platform_register" || input.analysis.intent === "ask_platform_register") {
      return reply(input, language, "registration_intent", "need_platform_register", naturalizeStrictReply(step, text, language, scriptLine("project_intro", language), "registration_intent", input.analysis.intent));
    }
    if (asksLink) {
      return reply(input, language, "registration_intent", "need_platform_register", naturalizeStrictReply(step, text, language, scriptLine("registration_intent", language), "registration_intent", input.analysis.intent));
    }
    return reply(input, language, "interest_screening", "need_platform_register", naturalizeStrictReply(step, text, language, scriptLine("interest_screening_retry", language), "interest_screening", input.analysis.intent));
  }

  if (step === "project_intro") {
    return reply(input, language, "registration_intent", "need_platform_register", naturalizeStrictReply(step, text, language, scriptLine("project_intro", language), "registration_intent", input.analysis.intent));
  }

  if (step === "registration_intent") {
    if (inferredIntent === "negative_refusal") {
      return reply(input, language, "registration_intent", "need_platform_register", scriptLine("refusal_ack", language));
    }
    if (asksAboutJob(text) || asksAboutPlatform(text) || complainsAboutReply(text) || asksToChat(text)) {
      return reply(input, language, "registration_intent", "need_platform_register", naturalizeStrictReply(step, text, language, scriptLine("registration_intent", language), "registration_intent", input.analysis.intent));
    }
    if (positive || asksLink || inferredIntent === "ask_link" || inferredIntent === "ask_platform_register" || input.analysis.intent === "ask_platform_register") {
      return reply(input, language, "wait_registration", "need_platform_register", registerInstruction(input, language), true);
    }
    return reply(input, language, "registration_intent", "need_platform_register", naturalizeStrictReply(step, text, language, scriptLine("registration_intent", language), "registration_intent", input.analysis.intent));
  }

  if (step === "send_register_link") {
    return reply(input, language, "wait_registration", "need_platform_register", registerInstruction(input, language), true);
  }

  if (step === "wait_registration") {
    if (inferredIntent === "platform_register_done" || input.analysis.intent === "platform_register_done" || input.analysis.phone || input.conversation.extractedPhone) {
      return reply(input, language, "telegram_confirm", "need_tg_register", scriptLine(input.analysis.phone || input.conversation.extractedPhone ? "telegram_confirm" : "ask_registered_phone", language));
    }
    if (asksLink || inferredIntent === "ask_link") {
      return reply(input, language, "wait_registration", "need_platform_register", registerInstruction(input, language), true);
    }
    return reply(input, language, "wait_registration", "need_platform_register", naturalizeStrictReply(step, text, language, scriptLine("wait_registration", language), "wait_registration", input.analysis.intent));
  }

  if (step === "telegram_confirm") {
    if (inferredIntent === "negative_refusal") {
      return reply(input, language, "telegram_confirm", "need_tg_register", scriptLine("refusal_ack", language));
    }
    if (negativeTelegram) {
      return reply(input, language, "telegram_download", "need_tg_register", scriptLine("telegram_download", language));
    }
    if (positive || inferredIntent === "ask_tg_register" || input.analysis.intent === "ask_tg_register") {
      return reply(input, language, "collect_telegram", "need_tg_register", scriptLine("collect_telegram", language));
    }
    return reply(input, language, "telegram_confirm", "need_tg_register", naturalizeStrictReply(step, text, language, scriptLine("telegram_confirm_question", language), "telegram_confirm", input.analysis.intent));
  }

  if (step === "telegram_download") {
    return reply(input, language, "collect_telegram", "need_tg_register", naturalizeStrictReply(step, text, language, scriptLine("collect_telegram", language), "collect_telegram", input.analysis.intent));
  }

  if (step === "collect_telegram") {
    if (inferredIntent === "negative_refusal") {
      return reply(input, language, "collect_telegram", "need_tg_register", scriptLine("refusal_ack", language));
    }
    if (negativeTelegram) {
      return reply(input, language, "telegram_download", "need_tg_register", scriptLine("telegram_download", language));
    }
    return reply(input, language, "collect_telegram", "need_tg_register", naturalizeStrictReply(step, text, language, scriptLine("collect_telegram_retry", language), "collect_telegram", input.analysis.intent));
  }

  return reply(input, language, "ended", "ready_for_handoff", verificationLine(language));
}

function naturalizeStrictReply(step: StrictFlowStep | "", text: string, language: string, flowGoal: string, nextStep: StrictFlowStep, intent = ""): string {
  const prefix = naturalStrictFlowPrefix(step, text, language, intent);
  if (!prefix) return flowGoal;
  if (prefix.pauseFlow) return prefix.content;
  const bridge = flowBridgeLine(nextStep, language);
  return joinReplyParts(prefix.content, bridge || flowGoal, language);
}

function naturalStrictFlowPrefix(step: StrictFlowStep | "", text: string, language: string, intent = ""): { content: string; pauseFlow?: boolean } | null {
  if (!step) return null;
  const normalized = text.trim();
  if (!normalized) return null;
  if (isExplicitRefusal(normalized)) {
    return { content: scriptLine("refusal_ack", language), pauseFlow: true };
  }
  if (asksAboutPlatform(normalized)) {
    return { content: scriptLine("platform_explain", language) };
  }
  if (asksToChat(normalized)) {
    return { content: scriptLine("chat_ack", language) };
  }
  if (complainsAboutReply(normalized)) {
    return { content: scriptLine("complaint_ack", language) };
  }
  if (intent === "need_help" || asksForOperationHelp(normalized)) {
    return { content: helpLineForStep(step, language) };
  }
  if (asksAboutJob(normalized)) {
    return { content: scriptLine("project_intro", language) };
  }
  if (isRepeatGreeting(normalized) && step !== "interest_screening") {
    return { content: scriptLine("repeat_greeting", language) };
  }
  if (isHesitant(normalized)) {
    return { content: scriptLine("hesitation_ack", language) };
  }
  return null;
}

function flowBridgeLine(step: StrictFlowStep, language: string): string {
  if (step === "interest_screening") return scriptLine("bridge_interest", language);
  if (step === "registration_intent") return scriptLine("bridge_registration_intent", language);
  if (step === "wait_registration") return scriptLine("bridge_wait_registration", language);
  if (step === "telegram_confirm") return scriptLine("bridge_telegram_confirm", language);
  if (step === "telegram_download" || step === "collect_telegram") return scriptLine("bridge_collect_telegram", language);
  return "";
}

function joinReplyParts(prefix: string, goal: string, language: string): string {
  const cleanPrefix = prefix.trim();
  const cleanGoal = goal.trim();
  if (!cleanPrefix) return cleanGoal;
  if (!cleanGoal || cleanPrefix.includes(cleanGoal)) return cleanPrefix;
  if (cleanGoal.includes(cleanPrefix)) return cleanGoal;
  return language === "zh" ? `${cleanPrefix}${cleanGoal}` : `${cleanPrefix} ${cleanGoal}`;
}

function stageForFlowStep(step: StrictFlowStep, fallback: Conversation["stage"]): Conversation["stage"] {
  if (step === "telegram_confirm" || step === "telegram_download" || step === "collect_telegram") return "need_tg_register";
  if (step === "human_handoff" || step === "ended") return "ready_for_handoff";
  if (step === "wait_registration" || step === "send_register_link" || step === "registration_intent" || step === "project_intro" || step === "interest_screening") return "need_platform_register";
  return fallback;
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

function isPositive(text: string, intent: string, inferredIntent: InternalIntentLabel = "unknown"): boolean {
  if (inferredIntent === "positive_confirmation") return true;
  if (intent === "platform_register_done") return true;
  return /(可以|好的|好|是|想|有兴趣|了解|继续|准备好了|yes|ok|okay|sure|interested|quero|sim|tenho interesse|pode|vamos|continuar|claro|pronto)/i.test(text.trim());
}

function saysNoTelegram(text: string): boolean {
  return /(没有|沒有|无|不用|不会|不想|没有tg|没有 telegram|no telegram|don't have telegram|dont have telegram|sem telegram|não tenho telegram|nao tenho telegram|não tenho|nao tenho)/i.test(text.trim());
}

function asksForInviteOrLink(text: string, intent: string): boolean {
  return intent === "ask_link" || /(邀请码|邀請碼|链接|开户链接|link|invite code|invitation code|código|codigo|convite|cadastro)/i.test(text);
}

function asksAboutPlatform(text: string): boolean {
  return /(什么平台|什麼平台|哪个平台|哪個平台|平台是做什么|平台做什么|什么项目|什麼項目|what platform|which platform|what project|que plataforma|qual plataforma)/i.test(text);
}

function asksToChat(text: string): boolean {
  return /(可以聊|能聊|聊天|聊聊|说话|真人|人工|can we chat|talk to me|posso falar|conversar)/i.test(text);
}

function complainsAboutReply(text: string): boolean {
  return /(为什么会这样|為什麼會這樣|怎么还是|怎麼還是|太机械|机械|僵硬|重复|只会|一句话|听不懂|不是|不对|别一直|robotic|mechanical|repeat|same thing|wrong|não entendi|nao entendi|mecânico|mecanico|repetindo)/i.test(text);
}

function isExplicitRefusal(text: string): boolean {
  return /(不用了|不需要|不了|算了|没兴趣|不想|不要|别发了|不要再发|停止|no thanks|not interested|stop|não quero|nao quero|sem interesse|pare)/i.test(text);
}

function isHesitant(text: string): boolean {
  return /(先不用|再看看|考虑一下|想想|晚点|maybe later|not now|agora não|agora nao|vou pensar)/i.test(text);
}

function asksForOperationHelp(text: string): boolean {
  return /(不会|不會|不懂|怎么弄|怎麼弄|怎么操作|如何操作|怎么注册|怎么下载|怎么用|帮我|教我|一步一步|help|how do i|how to|cannot|can't|ajuda|me ajuda|como faço|como fazer|não consigo|nao consigo)/i.test(text);
}

function helpLineForStep(step: StrictFlowStep | "", language: string): string {
  if (step === "telegram_confirm" || step === "telegram_download" || step === "collect_telegram") {
    return scriptLine("telegram_help_ack", language);
  }
  if (step === "wait_registration" || step === "send_register_link" || step === "registration_intent") {
    return scriptLine("registration_help_ack", language);
  }
  return scriptLine("general_help_ack", language);
}

function asksAboutJob(text: string): boolean {
  return /(了解.*工作|这份工作|這份工作|介绍.*工作|找工作|兼职|线上工作|在线工作|工作内容|怎么赚钱|如何赚钱|job|work|part[-\s]?time|online work|extra income|emprego|trabalho|renda extra|vaga)/i.test(text);
}

function isRepeatGreeting(text: string): boolean {
  return /^(你好|您好|在吗|在不在|嗨|hi|hello|hey|good morning|good afternoon|good evening|ol[aá]|oi|bom dia|boa tarde|boa noite|こんにちは|こんばんは)\s*[。.!?？！]*$/i.test(text);
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
    repeat_greeting: "您好，我在的。您可以直接问我这份工作的内容，或告诉我您现在卡在哪一步。",
    chat_ack: "可以的，您想先了解工作内容、注册流程，还是 Telegram 怎么处理？我按您的问题一步一步说。",
    complaint_ack: "抱歉，刚才没有理解到您的意思。您可以直接告诉我想了解工作内容、注册步骤，还是 Telegram 问题，我会按您的问题回答。",
    general_help_ack: "可以，我会一步一步协助您，不需要您自己猜流程。",
    registration_help_ack: "可以，我来带您处理注册步骤。您先按当前步骤操作，遇到问题直接告诉我。",
    telegram_help_ack: "可以，我来协助您处理 Telegram。先下载或注册 Telegram，完成后把 @ 开头的用户名发给我。",
    refusal_ack: "好的，我先不继续打扰您。如果您之后还想了解或继续注册，随时联系我就可以。",
    platform_explain: "这是用于开始兼职在线工作的开户注册平台。您可以先了解工作内容，确认愿意继续后，我再给您开户链接。",
    interest_screening_retry: "您好，您是想了解这份兼职在线工作吗？如果您感兴趣，我可以先简单介绍。",
    hesitation_ack: "没关系，您可以先了解清楚再决定。",
    bridge_interest: "您如果感兴趣，我可以先简单介绍。",
    bridge_registration_intent: "如果您觉得可以继续，我再一步一步带您完成注册。",
    bridge_wait_registration: "您准备继续时告诉我，我会继续带您处理注册步骤；如果已经注册完成，请把注册手机号发给我。",
    bridge_telegram_confirm: "下一步只需要确认 Telegram，方便后续人工继续跟进。",
    bridge_collect_telegram: "完成后把 @ 开头的 Telegram 用户名发给我就可以。",
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
    repeat_greeting: "Hello, I am here. You can ask me about the job details, or tell me which step you are stuck on.",
    chat_ack: "Yes, we can talk. Would you like to know the job details, the registration steps, or how to handle Telegram? I will explain step by step.",
    complaint_ack: "Sorry, I did not understand your meaning clearly just now. You can tell me whether you want to know the job details, registration steps, or Telegram issue, and I will answer that directly.",
    general_help_ack: "Yes, I can guide you step by step, so you do not need to guess the process yourself.",
    registration_help_ack: "Yes, I will guide you through the registration step. Follow the current step first, and tell me directly if anything is unclear.",
    telegram_help_ack: "Yes, I will help you handle Telegram. Please download or create Telegram first, then send me the username starting with @.",
    refusal_ack: "Okay, I will not disturb you further for now. If you want to learn more or continue registration later, you can contact me anytime.",
    platform_explain: "This is the registration platform used to start the part-time online job. You can learn about the job first. If you decide to continue, I will send the registration entry.",
    interest_screening_retry: "Hello, would you like to learn about this part-time online job? If you are interested, I can briefly introduce it.",
    hesitation_ack: "No problem. You can understand it first and decide later.",
    bridge_interest: "If you are interested, I can briefly introduce it first.",
    bridge_registration_intent: "If you feel comfortable continuing, I will guide you through the registration step by step.",
    bridge_wait_registration: "When you are ready to continue, tell me and I will guide you through the registration step. If you have completed registration, please send me the registered phone number.",
    bridge_telegram_confirm: "The next step is only to confirm Telegram so the follow-up can continue smoothly.",
    bridge_collect_telegram: "After that, send me your Telegram username starting with @.",
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
    repeat_greeting: "Olá, estou aqui. Você pode perguntar sobre os detalhes do trabalho ou me dizer em qual etapa ficou com dúvida.",
    chat_ack: "Podemos conversar, sim. Você quer saber primeiro sobre o trabalho, o cadastro ou como usar o Telegram? Eu explico passo a passo.",
    complaint_ack: "Desculpe, não entendi bem sua intenção agora há pouco. Você pode me dizer se quer saber sobre o trabalho, o cadastro ou o Telegram, e eu respondo diretamente.",
    general_help_ack: "Sim, posso orientar você passo a passo, sem você precisar adivinhar o processo.",
    registration_help_ack: "Sim, vou orientar você no cadastro. Siga primeiro a etapa atual e me diga diretamente se tiver alguma dúvida.",
    telegram_help_ack: "Sim, vou ajudar você com o Telegram. Primeiro baixe ou crie o Telegram e depois envie o nome de usuário começando com @.",
    refusal_ack: "Tudo bem, não vou incomodar você agora. Se quiser saber mais ou continuar o cadastro depois, pode me chamar a qualquer momento.",
    platform_explain: "Esta é a plataforma de cadastro usada para iniciar o trabalho online de meio período. Você pode conhecer o trabalho primeiro. Se decidir continuar, eu envio a entrada de cadastro.",
    interest_screening_retry: "Olá, você gostaria de conhecer este trabalho online de meio período? Se tiver interesse, posso explicar rapidamente.",
    hesitation_ack: "Sem problema. Você pode entender primeiro e decidir depois.",
    bridge_interest: "Se tiver interesse, posso explicar rapidamente primeiro.",
    bridge_registration_intent: "Se você se sentir confortável para continuar, eu oriento o cadastro passo a passo.",
    bridge_wait_registration: "Quando estiver pronto para continuar, me avise e eu continuo orientando o cadastro. Se já concluiu o cadastro, envie o telefone usado no cadastro.",
    bridge_telegram_confirm: "O próximo passo é apenas confirmar o Telegram para continuar o acompanhamento.",
    bridge_collect_telegram: "Depois disso, envie seu nome de usuário do Telegram começando com @.",
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
