import type { AppConfig } from "../config.js";
import type { A2CInviteCodeRecord, Conversation, ConversationMessageRecord, MerchantConfigRecord, MerchantCountryRecord, MerchantRecord, ScriptFlowRuntime } from "../repositories.js";
import { isPositiveConfirmation, type InternalIntentLabel, type MessageAnalysis } from "./analyzer.js";

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
  strictFlowEnabled?: boolean;
  scriptFlow?: ScriptFlowRuntime;
}

export interface StrictFlowReply {
  enabled: boolean;
  reply: string;
  language: string;
  nextFlowStep: StrictFlowStep;
  stage: Conversation["stage"];
  needsInviteCode: boolean;
  fallback?: boolean;
  controlledQuestionType?: ControlledQuestionType;
  controlledQuestionFallback?: boolean;
}

export type ControlledQuestionType =
  | "none"
  | "platform"
  | "chat"
  | "identity"
  | "trust"
  | "payment"
  | "investment"
  | "telegram"
  | "earning"
  | "complaint"
  | "help"
  | "job"
  | "repeat_greeting"
  | "hesitation"
  | "phone_reason"
  | "link_open"
  | "next_step"
  | "sensitive"
  | "unknown";

const flowStepSet = new Set<string>(STRICT_FLOW_STEPS);
const flowStepRank = new Map<StrictFlowStep, number>(STRICT_FLOW_STEPS.map((step, index) => [step, index]));

export function isStrictFlowEnabled(merchant: MerchantRecord, country: MerchantCountryRecord, merchantConfig?: Pick<MerchantConfigRecord, "strictScriptFlowEnabled">): boolean {
  if (merchantConfig?.strictScriptFlowEnabled) return true;
  const merchantName = merchant.name.trim().toLowerCase();
  const merchantId = merchant.id.trim().toLowerCase();
  const countryName = country.name.trim().toLowerCase();
  const countryCode = country.code.trim().toLowerCase();
  const isAston = merchantName.includes("阿斯顿") || merchantName.includes("aston") || merchantId.includes("aston");
  const isDefaultMerchant = merchantId === "default" || merchantName.includes("默认") || merchantName.includes("default");
  const isBrazil = countryName.includes("巴西") || countryName.includes("brazil") || countryName.includes("brasil") || countryCode === "br" || countryCode === "brasil";
  const isUnconfiguredMarket =
    !countryName ||
    !countryCode ||
    countryName.includes("默认") ||
    countryName.includes("default") ||
    countryCode === "default" ||
    countryCode === "unknown";
  return (isAston || isDefaultMerchant) && (isBrazil || isUnconfiguredMarket);
}

export function strictFlowNeedsInviteCode(input: Pick<StrictFlowInput, "merchant" | "country" | "conversation" | "analysis" | "customerText" | "inferredIntent" | "strictFlowEnabled">): boolean {
  if (!(input.strictFlowEnabled ?? isStrictFlowEnabled(input.merchant, input.country)) || !input.country.requirePlatformAccount) return false;
  if (input.conversation.extractedPhone && input.conversation.extractedTelegram) return false;
  const step = normalizeFlowStep(input.conversation.flowStep);
  if (step === "registration_intent" || step === "send_register_link") return true;
  if (step === "wait_registration") {
    return input.inferredIntent === "ask_link" || asksForInviteOrLink(input.customerText, input.analysis.intent);
  }
  return false;
}

export function resolveEffectiveStrictFlowStep(
  conversation: Pick<Conversation, "flowStep" | "stage">,
  history: ConversationMessageRecord[] = []
): StrictFlowStep | "" {
  const stored = normalizeFlowStep(conversation.flowStep);
  const inferred = inferStrictFlowStepFromHistory(history);
  if (!stored) return inferred || stageToStrictFlowStep(conversation.stage);
  if (!inferred) return stored;
  if (stored === "first_greeting" && inferred !== "first_greeting") return inferred;
  const storedRank = flowStepRank.get(stored) ?? 0;
  const inferredRank = flowStepRank.get(inferred) ?? 0;
  return inferredRank > storedRank ? inferred : stored;
}

export function buildStrictFlowReply(input: StrictFlowInput): StrictFlowReply {
  if (!(input.strictFlowEnabled ?? isStrictFlowEnabled(input.merchant, input.country))) {
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
    return reply(input, language, "interest_screening", "need_platform_register", flowScriptLine(input, "first_greeting", language));
  }

  if ((input.analysis.telegram || input.conversation.extractedTelegram) && !(input.analysis.phone || input.conversation.extractedPhone)) {
    return reply(input, language, "collect_telegram", "need_phone_or_tg", flowScriptLine(input, "ask_registered_phone", language));
  }

  if (step === "interest_screening") {
    if (inferredIntent === "negative_refusal" || isExplicitRefusal(text)) {
      return reply(input, language, "interest_screening", "need_platform_register", flowScriptLine(input, "refusal_ack", language));
    }
    if (positive || asksAboutJob(text) || asksEarningConcern(text)) {
      return reply(input, language, "registration_intent", "need_platform_register", buildInterestProgressReply(input, step, text, language, input.analysis.intent));
    }
    if (inferredIntent === "ask_platform_register" || input.analysis.intent === "ask_platform_register") {
      return reply(input, language, "registration_intent", "need_platform_register", buildInterestProgressReply(input, step, text, language, input.analysis.intent));
    }
    if (asksLink) {
      return reply(input, language, "registration_intent", "need_platform_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "registration_intent", language), "registration_intent", input.analysis.intent));
    }
    return reply(input, language, "interest_screening", "need_platform_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "interest_screening_retry", language), "interest_screening", input.analysis.intent));
  }

  if (step === "project_intro") {
    return reply(input, language, "registration_intent", "need_platform_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "project_intro", language), "registration_intent", input.analysis.intent));
  }

  if (step === "registration_intent") {
    if (inferredIntent === "negative_refusal" || isExplicitRefusal(text)) {
      return reply(input, language, "registration_intent", "need_platform_register", flowScriptLine(input, "refusal_ack", language));
    }
    if (inferredIntent === "need_help" || input.analysis.intent === "need_help" || asksForOperationHelp(text)) {
      return reply(input, language, "wait_registration", "need_platform_register", registerInstruction(input, language), true);
    }
    if (asksAboutJob(text) || asksAboutPlatform(text) || complainsAboutReply(text) || asksToChat(text)) {
      return reply(input, language, "registration_intent", "need_platform_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "registration_intent", language), "registration_intent", input.analysis.intent));
    }
    if (positive || asksLink || inferredIntent === "ask_link" || inferredIntent === "ask_platform_register" || input.analysis.intent === "ask_platform_register") {
      return reply(input, language, "wait_registration", "need_platform_register", registerInstruction(input, language), true);
    }
    return reply(input, language, "registration_intent", "need_platform_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "registration_intent", language), "registration_intent", input.analysis.intent));
  }

  if (step === "send_register_link") {
    return reply(input, language, "wait_registration", "need_platform_register", registerInstruction(input, language), true);
  }

  if (step === "wait_registration") {
    if (input.analysis.intent === "trust_concern" || asksTrustConcern(text)) {
      return reply(input, language, "wait_registration", "need_platform_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "wait_registration", language), "wait_registration", "trust_concern"));
    }
    if (asksPaymentConcern(text)) {
      return reply(input, language, "wait_registration", "need_platform_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "wait_registration", language), "wait_registration", "payment_concern"));
    }
    if (input.analysis.intent === "ask_tg_register" || inferredIntent === "ask_tg_register" || asksTelegramExplanation(text)) {
      const line = input.conversation.extractedPhone || input.analysis.phone ? "telegram_explain_after_phone_ack" : "telegram_explain_ack";
      return reply(input, language, "wait_registration", "need_platform_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "wait_registration", language), "wait_registration", "telegram_explain", line));
    }
    if (inferredIntent === "platform_register_done" || input.analysis.intent === "platform_register_done" || isRegistrationDoneConfirmation(text) || input.analysis.phone || input.conversation.extractedPhone) {
      if (negativeTelegram) {
        return reply(input, language, "telegram_download", "need_tg_register", flowScriptLine(input, "telegram_download", language));
      }
      return reply(input, language, "telegram_confirm", "need_tg_register", flowScriptLine(input, input.analysis.phone || input.conversation.extractedPhone ? "telegram_confirm" : "ask_registered_phone", language));
    }
    if (asksLink || inferredIntent === "ask_link") {
      return reply(input, language, "wait_registration", "need_platform_register", registerInstruction(input, language), true);
    }
    return reply(input, language, "wait_registration", "need_platform_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "wait_registration", language), "wait_registration", input.analysis.intent));
  }

  if (step === "telegram_confirm") {
    if (inferredIntent === "negative_refusal") {
      return reply(input, language, "telegram_confirm", "need_tg_register", flowScriptLine(input, "refusal_ack", language));
    }
    if (negativeTelegram) {
      return reply(input, language, "telegram_download", "need_tg_register", flowScriptLine(input, "telegram_download", language));
    }
    if (positive || inferredIntent === "ask_tg_register" || input.analysis.intent === "ask_tg_register") {
      return reply(input, language, "collect_telegram", "need_tg_register", flowScriptLine(input, "collect_telegram", language));
    }
    return reply(input, language, "telegram_confirm", "need_tg_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "telegram_confirm_question", language), "telegram_confirm", input.analysis.intent));
  }

  if (step === "telegram_download") {
    return reply(input, language, "collect_telegram", "need_tg_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "collect_telegram", language), "collect_telegram", input.analysis.intent));
  }

  if (step === "collect_telegram") {
    if (inferredIntent === "negative_refusal") {
      return reply(input, language, "collect_telegram", "need_tg_register", flowScriptLine(input, "refusal_ack", language));
    }
    if (negativeTelegram) {
      return reply(input, language, "telegram_download", "need_tg_register", flowScriptLine(input, "telegram_download", language));
    }
    return reply(input, language, "collect_telegram", "need_tg_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "collect_telegram_retry", language), "collect_telegram", input.analysis.intent));
  }

  return reply(input, language, "ended", "ready_for_handoff", verificationLine(language));
}

export function buildStrictFlowFollowUp(flowStep: string, language: string): string {
  const step = normalizeFlowStep(flowStep);
  const replyLanguage = language && language !== "unknown" ? language : "zh";
  if (step === "interest_screening" || step === "registration_intent" || step === "project_intro") {
    if (replyLanguage === "en") return "Are you free to continue now? I can guide you step by step.";
    if (replyLanguage === "pt-BR") return "Você está livre para continuar agora? Posso orientar você passo a passo.";
    return "您现在方便继续吗？我可以一步步带您完成。";
  }
  if (step === "wait_registration" || step === "send_register_link") {
    if (replyLanguage === "en") return "Which registration step are you on now? If anything is stuck, send me what you see and I will help.";
    if (replyLanguage === "pt-BR") return "Em qual etapa do cadastro você está agora? Se travar em alguma parte, me envie o que aparece e eu ajudo.";
    return "您注册到哪一步了？如果卡住，把页面情况发我就行。";
  }
  if (step === "telegram_confirm" || step === "telegram_download" || step === "collect_telegram") {
    if (replyLanguage === "en") return "If Telegram is difficult to set up, tell me where you are stuck and I will guide you.";
    if (replyLanguage === "pt-BR") return "Se estiver difícil configurar o Telegram, me diga onde travou e eu oriento você.";
    return "Telegram 这一步如果不会弄，告诉我卡在哪里，我继续带您。";
  }
  if (replyLanguage === "en") return "I am here. Tell me when you are ready and I will continue from the current step.";
  if (replyLanguage === "pt-BR") return "Estou aqui. Quando estiver pronto, me avise e continuo pela etapa atual.";
  return "我在的，您准备好了告诉我，我按当前步骤继续带您。";
}

function naturalizeStrictReply(input: StrictFlowInput, step: StrictFlowStep | "", text: string, language: string, flowGoal: string, nextStep: StrictFlowStep, intent = "", forcedLine = ""): string {
  const prefix = controlledQuestionAnswer(input, step, text, language, intent, forcedLine);
  if (!prefix) return flowGoal;
  if (prefix.pauseFlow) return prefix.content;
  if (containsNextStepPrompt(prefix.content, nextStep)) return prefix.content;
  const bridge = flowBridgeLine(input, nextStep, language);
  return joinReplyParts(prefix.content, bridge || flowGoal, language);
}

function buildInterestProgressReply(input: StrictFlowInput, step: StrictFlowStep | "", text: string, language: string, intent = ""): string {
  const intro = flowScriptLine(input, "project_intro", language);
  const prefix = controlledQuestionAnswer(input, step, text, language, intent);
  if (!prefix || prefix.pauseFlow) return intro;
  return joinReplyParts(prefix.content, intro, language);
}

function controlledQuestionAnswer(input: StrictFlowInput, step: StrictFlowStep | "", text: string, language: string, intent = "", forcedLine = ""): { content: string; pauseFlow?: boolean; type: ControlledQuestionType; cautiousFallback?: boolean } | null {
  if (!step) return null;
  const normalized = text.trim();
  if (!normalized) return null;
  if (isExplicitRefusal(normalized)) {
    return { content: flowScriptLine(input, "refusal_ack", language), pauseFlow: true, type: "hesitation" };
  }
  if (forcedLine) {
    return { content: flowScriptLine(input, forcedLine, language), type: "telegram" };
  }
  if (asksSensitiveInfo(normalized)) {
    return { content: flowScriptLine(input, "sensitive_info_ack", language), type: "sensitive", cautiousFallback: true };
  }
  if (asksServiceIdentity(normalized)) {
    return { content: flowScriptLine(input, "identity_ack", language), type: "identity" };
  }
  if (asksWhyPhone(normalized)) {
    return { content: flowScriptLine(input, "phone_reason_ack", language), type: "phone_reason" };
  }
  if (asksHowToOpenLink(normalized)) {
    return { content: flowScriptLine(input, "link_open_ack", language), type: "link_open" };
  }
  if (asksNextStep(normalized)) {
    return { content: flowScriptLine(input, "next_step_ack", language), type: "next_step" };
  }
  if (asksAboutPlatform(normalized)) {
    return { content: flowScriptLine(input, "platform_explain", language), type: "platform" };
  }
  if (asksToChat(normalized)) {
    return { content: flowScriptLine(input, "chat_ack", language), type: "chat" };
  }
  if (intent === "trust_concern" || asksTrustConcern(normalized)) {
    return { content: flowScriptLine(input, "trust_ack", language), type: "trust" };
  }
  if (intent === "investment_concern" || asksInvestmentConcern(normalized)) {
    return { content: flowScriptLine(input, "investment_concern_ack", language), type: "investment" };
  }
  if (intent === "payment_concern" || asksPaymentConcern(normalized)) {
    return { content: flowScriptLine(input, "payment_concern_ack", language), type: "payment" };
  }
  if (intent === "telegram_explain" || asksTelegramExplanation(normalized)) {
    const line = input.conversation.extractedPhone || input.analysis.phone ? "telegram_explain_after_phone_ack" : "telegram_explain_ack";
    return { content: flowScriptLine(input, line, language), type: "telegram" };
  }
  if (asksEarningConcern(normalized)) {
    return { content: flowScriptLine(input, "earning_concern_ack", language), type: "earning" };
  }
  if (intent === "complaint" || complainsAboutReply(normalized)) {
    return { content: flowScriptLine(input, "complaint_ack", language), type: "complaint" };
  }
  if (intent === "workflow_question" || intent === "need_help" || asksForOperationHelp(normalized)) {
    return { content: helpLineForStep(input, step, language), type: "help" };
  }
  if (intent === "job_question" || asksAboutJob(normalized)) {
    return { content: flowScriptLine(input, "project_intro", language), type: "job" };
  }
  if (isRepeatGreeting(normalized) && step !== "interest_screening") {
    return { content: flowScriptLine(input, "repeat_greeting", language), type: "repeat_greeting" };
  }
  if (isHesitant(normalized)) {
    return { content: flowScriptLine(input, "hesitation_ack", language), type: "hesitation" };
  }
  if (looksLikeQuestion(normalized)) {
    return { content: flowScriptLine(input, "unknown_question_ack", language), type: "unknown", cautiousFallback: true };
  }
  return null;
}

function flowBridgeLine(input: StrictFlowInput, step: StrictFlowStep, language: string): string {
  if (step === "interest_screening") return flowScriptLine(input, "bridge_interest", language);
  if (step === "registration_intent") return flowScriptLine(input, "bridge_registration_intent", language);
  if (step === "wait_registration") return flowScriptLine(input, "bridge_wait_registration", language);
  if (step === "telegram_confirm") return flowScriptLine(input, "bridge_telegram_confirm", language);
  if (step === "telegram_download" || step === "collect_telegram") return flowScriptLine(input, "bridge_collect_telegram", language);
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

function containsNextStepPrompt(content: string, nextStep: StrictFlowStep): boolean {
  if (nextStep === "registration_intent") {
    return /(有空|空闲时间|空閒時間|有时间|是否.*继续|free time|time now|available|tempo livre|tempo agora|continuar o cadastro)/i.test(content);
  }
  if (nextStep === "wait_registration") {
    return /(https?:\/\/|邀请码[:：]|invitation code[:：]|código de convite[:：]|codigo de convite[:：]|注册手机号|注册的手机号码|registered phone|phone number you registered|telefone usado no cadastro|número de telefone usado no cadastro)/i.test(content);
  }
  if (nextStep === "collect_telegram") {
    return /(@ 开头|@开头|Telegram 用户名|Telegram username|nome de usuário do Telegram)/i.test(content);
  }
  return false;
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
  const actionableContent = ensureActionableStrictContent(content, nextFlowStep, language);
  const debugIntent = input.inferredIntent && input.inferredIntent !== "unknown" ? input.inferredIntent : input.analysis.intent;
  const controlled = controlledQuestionAnswer(input, normalizeFlowStep(input.conversation.flowStep), input.customerText, language, debugIntent);
  return {
    enabled: true,
    reply: actionableContent,
    language,
    nextFlowStep,
    stage,
    needsInviteCode,
    fallback: !input.inviteCode && needsInviteCode,
    controlledQuestionType: controlled?.type ?? "none",
    controlledQuestionFallback: Boolean(controlled?.cautiousFallback)
  };
}

function normalizeFlowStep(value: string): StrictFlowStep | "" {
  return flowStepSet.has(value) ? value as StrictFlowStep : "";
}

function inferStrictFlowStepFromHistory(history: ConversationMessageRecord[]): StrictFlowStep | "" {
  for (const message of [...history].reverse()) {
    if (message.direction !== "outbound") continue;
    const payloadStep = normalizeFlowStep(String(message.rawPayload?.strictFlowStep ?? ""));
    if (payloadStep) return payloadStep;
    const contentStep = inferStrictFlowStepFromContent(message.content);
    if (contentStep) return contentStep;
  }
  return "";
}

function inferStrictFlowStepFromContent(content: string): StrictFlowStep | "" {
  const text = content.trim();
  if (!text) return "";
  if (/(是否正在寻找|是否正在找|寻找可以在线完成的工作|赚取额外收入|part-time online job|renda extra|trabalho online)/i.test(text)) {
    return "interest_screening";
  }
  if (/(简单介绍|每天可以赚取|提升产品销量|是否接受这份工作|briefly introduce|300 to 800|aumentar as vendas|300 a 800)/i.test(text)) {
    return "registration_intent";
  }
  if (/(准备好注册|先在我们的平台上注册|ready to register|pronto para se cadastrar)/i.test(text)) {
    return "registration_intent";
  }
  if (/(开户链接|注册链接|邀请码|registration link|invitation code|link de cadastro|código de convite)/i.test(text)) {
    return "wait_registration";
  }
  if (/(是否已完成注册|注册的手机号码|registered phone|telefone usado no cadastro)/i.test(text)) {
    return "wait_registration";
  }
  if (/(您有 Telegram|有 Telegram|Do you have the Telegram|Você tem o aplicativo Telegram)/i.test(text)) {
    return "telegram_confirm";
  }
  if (/(下载 Telegram|注册 Telegram|download Telegram|baixar o Telegram|criar o Telegram)/i.test(text)) {
    return "telegram_download";
  }
  if (/(@ 开头|@开头|Telegram 用户名|Telegram username|nome de usuário do Telegram)/i.test(text)) {
    return "collect_telegram";
  }
  return "";
}

function stageToStrictFlowStep(stage: Conversation["stage"]): StrictFlowStep | "" {
  if (stage === "need_tg_register") return "telegram_confirm";
  if (stage === "need_phone_or_tg") return "wait_registration";
  if (stage === "ready_for_handoff") return "human_handoff";
  if (stage === "need_platform_register") return "";
  return "";
}

function ensureActionableStrictContent(content: string, nextFlowStep: StrictFlowStep, language: string): string {
  const trimmed = content.trim();
  if (!isLowInformationStrictReply(trimmed)) return content;
  if (nextFlowStep === "registration_intent") return joinReplyParts(scriptLine("project_intro", language), scriptLine("bridge_registration_intent", language), language);
  if (nextFlowStep === "wait_registration") return scriptLine("registration_intent", language);
  if (nextFlowStep === "telegram_confirm") return scriptLine("telegram_confirm_question", language);
  if (nextFlowStep === "telegram_download") return scriptLine("telegram_download", language);
  if (nextFlowStep === "collect_telegram") return scriptLine("collect_telegram", language);
  return scriptLine("interest_screening_retry", language);
}

function isLowInformationStrictReply(value: string): boolean {
  const normalized = value.replace(/[。.!?！？\s]/g, "");
  return /^(好的我继续协助您|我继续协助您|OkayIwillcontinuehelpingyouwiththenextstep|Certovoucontinuarajudandovocênopróximopasso)$/i.test(normalized);
}

function normalizeReplyLanguage(detected: string, previous: string, defaultLanguage: string): string {
  const value = detected && detected !== "unknown" ? detected : previous && previous !== "unknown" ? previous : defaultLanguage;
  return value && value !== "unknown" ? value : "pt-BR";
}

function isPositive(text: string, intent: string, inferredIntent: InternalIntentLabel = "unknown"): boolean {
  if (inferredIntent === "positive_confirmation") return true;
  if (intent === "platform_register_done") return true;
  if (isPositiveConfirmation(text)) return true;
  return /(有兴趣|想了解|想继续|要继续|继续|准备好了|有空|空闲|有时间|现在可以|愿意|同意|interested|i want|continue|free time|available|quero|tenho interesse|continuar|tenho tempo|dispon[ií]vel|vamos|pronto)/i.test(text.trim());
}

function isRegistrationDoneConfirmation(text: string): boolean {
  return /^(好了|好啦|完成了|注册好了|註冊好了|注册完了|註冊完了|已注册|已註冊|done|finished|registered|terminei|concluí|conclui|cadastrei|pronto)$/i.test(text.trim().replace(/[。.!?！？,，;；:：]+$/g, ""));
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

function asksTrustConcern(text: string): boolean {
  return /(安全|真的假的|可信|靠谱吗|可靠|骗人|骗子|騙子|欺骗|欺騙|诈骗|詐騙|safe|trust|real|scam|fraud|seguro|confiável|confiavel|golpe|verdade)/i.test(text);
}

function asksEarningConcern(text: string): boolean {
  return /(每天.*赚|收益.*多|赚.*这么多|這麼多|这么多|那么多|真的假的|真的.*赚|收入.*真实|佣金.*真实|earn.*that much|so much|income.*real|real earnings|ganhar.*tanto|renda.*real|ganhos.*reais)/i.test(text);
}

function asksPaymentConcern(text: string): boolean {
  return /(付钱|付費|付款|交钱|交錢|收费|收費|花钱|花錢|充值|转账|轉帳|私下付款|私下转账|私下轉帳|需要.{0,4}(付|交|花|转|轉|充值|付款|收费|收費)|要.{0,4}(付|交|花|转|轉|充值|付款|收费|收費)|pay|payment|fee|charge|deposit|recharge|transfer money|pagar|pagamento|taxa|cobrança|cobranca|recarga|transferir)/i.test(text);
}

function asksInvestmentConcern(text: string): boolean {
  return /(投资|投資|投钱|投錢|本金|押金|垫付|墊付|先付|先交|先充|预付|預付|需要.{0,6}(投资|投資|本金|押金|垫付|墊付)|investment|invest|principal|advance payment|upfront|pay first|dep[oó]sito|adiantar|investimento)/i.test(text);
}

function asksTelegramExplanation(text: string): boolean {
  return /(telegram.*是什么|telegram.*是什麼|tg.*是什么|tg.*是什麼|什么是.*telegram|什麼是.*telegram|什么是.*tg|什麼是.*tg|telegram.*干嘛|telegram.*幹嘛|tg.*干嘛|tg.*幹嘛|为什么.*telegram|為什麼.*telegram|为什么.*tg|為什麼.*tg|what is telegram|what.*telegram.*for|why.*telegram|o que.*telegram|para que.*telegram|por que.*telegram)/i.test(text);
}

function asksServiceIdentity(text: string): boolean {
  return /(你是谁|你是誰|你是什么人|你是什麼人|你干嘛的|你幹嘛的|你负责什么|你負責什麼|who are you|what are you|quem é você|quem e voce|quem é vc|quem e vc)/i.test(text);
}

function asksWhyPhone(text: string): boolean {
  return /(为什么.*手机号|為什麼.*手機號|为什么.*手机号码|为什么.*電話|为什么.*号码|要手机号干嘛|要手机号码干嘛|why.*phone|why.*number|por que.*telefone|para que.*telefone)/i.test(text);
}

function asksHowToOpenLink(text: string): boolean {
  return /(链接.*怎么.*打开|链接.*打不开|打不.*链接|怎么打开.*链接|浏览器.*打开|chrome|safari|how.*open.*link|link.*not.*open|abrir.*link|link.*não abre|link.*nao abre)/i.test(text);
}

function asksNextStep(text: string): boolean {
  return /(接下来|下一步|然后呢|然后怎么办|现在怎么办|之后呢|next step|what next|what should i do next|e agora|próximo passo|proximo passo)/i.test(text);
}

function asksSensitiveInfo(text: string): boolean {
  return /(验证码|驗證碼|密码给你|密碼給你|银行卡|銀行卡|身份证|身份證|护照|護照|私钥|私鑰|verification code|password|bank card|id card|passport|senha|código de verificação|codigo de verificacao|cartão bancário|cartao bancario|documento)/i.test(text);
}

function looksLikeQuestion(text: string): boolean {
  return /[?？]$|[吗嗎呢么嘛][。.!！]*$|^(为什么|為什麼|怎么|怎麼|如何|什么|什麼|哪个|哪個|哪里|哪裡|能不能|可不可以|why|how|what|which|where|can|could|o que|por que|como|qual|onde)/i.test(text.trim());
}

function complainsAboutReply(text: string): boolean {
  return /(为什么会这样|為什麼會這樣|怎么还是|怎麼還是|没回答|沒有回答|没有回答|答非所问|没说清楚|太机械|机械|僵硬|重复|只会|一句话|听不懂|不是|不对|别一直|robotic|mechanical|repeat|same thing|wrong|didn.?t answer|não respondeu|nao respondeu|não entendi|nao entendi|mecânico|mecanico|repetindo)/i.test(text);
}

function isExplicitRefusal(text: string): boolean {
  const normalized = text.trim().replace(/[。.!?！？,，;；:：]+$/g, "");
  if (/^(不是|不|否|不了|不要|不用|no|nope|nah|não|nao)$/i.test(normalized)) return true;
  return /(不接受|不想接受|不用了|不需要|不了|算了|没兴趣|不想|不要|别发了|不要再发|停止|no thanks|not interested|do not accept|don't accept|stop|não quero|nao quero|não aceito|nao aceito|sem interesse|pare)/i.test(text);
}

function isHesitant(text: string): boolean {
  return /(先不用|再看看|考虑一下|想想|晚点|maybe later|not now|agora não|agora nao|vou pensar)/i.test(text);
}

function asksForOperationHelp(text: string): boolean {
  return /(不会|不會|不懂|怎么弄|怎麼弄|怎么操作|如何操作|怎么注册|怎么下载|怎么用|帮我|教我|一步一步|help|how do i|how to|cannot|can't|ajuda|me ajuda|como faço|como fazer|não consigo|nao consigo)/i.test(text);
}

function helpLineForStep(input: StrictFlowInput, step: StrictFlowStep | "", language: string): string {
  if (step === "telegram_confirm" || step === "telegram_download" || step === "collect_telegram") {
    return flowScriptLine(input, "telegram_help_ack", language);
  }
  if (step === "wait_registration" || step === "send_register_link" || step === "registration_intent") {
    return flowScriptLine(input, "registration_help_ack", language);
  }
  return flowScriptLine(input, "general_help_ack", language);
}

function asksAboutJob(text: string): boolean {
  return /(了解.*工作|这份工作|這份工作|介绍.*工作|找工作|兼职|线上工作|在线工作|工作内容|赚钱|賺錢|挣钱|掙錢|赚佣金|賺佣金|佣金收入|怎么赚钱|如何赚钱|job|work|part[-\s]?time|online work|extra income|emprego|trabalho|renda extra|vaga)/i.test(text);
}

function isRepeatGreeting(text: string): boolean {
  return /^(你好|您好|在吗|在不在|嗨|hi|hello|hey|good morning|good afternoon|good evening|ol[aá]|oi|bom dia|boa tarde|boa noite|こんにちは|こんばんは)\s*[。.!?？！]*$/i.test(text);
}

function registerInstruction(input: StrictFlowInput, language: string): string {
  const display = inviteDisplayText(input.inviteCode, language, input.country.platformRegisterUrl || input.config.PLATFORM_REGISTER_URL);
  const customStep = activeScriptStep(input, "wait_registration") || activeScriptStep(input, "registration_intent");
  if (customStep?.standardReply) {
    const withVariables = applyScriptVariables(customStep.standardReply, input, language, display);
    if (customStep.sendLink || customStep.sendInvite) {
      return withVariables.includes(display) || withVariables.includes(input.inviteCode?.code || "__missing_code__")
        ? withVariables
        : joinReplyParts(withVariables, display, language);
    }
    return withVariables;
  }
  if (!input.inviteCode) {
    return scriptLine("missing_invite", language, display);
  }
  if (language === "en") {
    return `Okay, I will send you the registration link and invitation code now.\n${display}\nRegistration steps:\n1. Open the link in your browser.\n2. Fill in your phone number.\n3. Set your username and password.\n4. Enter the invitation code.\n5. Submit the registration.\nAfter registration is completed, please tell me.`;
  }
  if (language === "pt-BR") {
    return `Certo, vou enviar agora o link de cadastro e o código de convite.\n${display}\nPassos do cadastro:\n1. Abra o link no navegador.\n2. Preencha seu número de telefone.\n3. Defina seu nome de usuário e sua senha.\n4. Insira o código de convite.\n5. Envie o cadastro.\nDepois de concluir o cadastro, me avise.`;
  }
  return `好的，现在我会把链接和邀请码发给您。\n${display}\n注册步骤：\n1. 在浏览器中打开链接。\n2. 填写手机号码。\n3. 设置用户名和密码。\n4. 输入邀请码。\n5. 提交注册。\n完成注册后请告诉我。`;
}

function flowScriptLine(input: StrictFlowInput, key: string, language: string): string {
  const step = activeScriptStep(input, key);
  if (step?.standardReply) {
    return applyScriptVariables(step.standardReply, input, language, "");
  }
  return scriptLine(key, language);
}

function activeScriptStep(input: StrictFlowInput, key: string) {
  const steps = input.scriptFlow?.steps ?? [];
  const enabledSteps = steps.filter((step) => step.enabled);
  const normalizedKey = key.toLowerCase();
  const exact = enabledSteps.find((step) => step.flowStep === key || step.flowCode.toLowerCase() === normalizedKey);
  if (exact) return exact;

  if (key === "first_greeting" || key === "interest_screening_retry") {
    return enabledSteps.find((step) => step.flowStep === "interest_screening");
  }

  if (key === "project_intro") {
    return (
      enabledSteps.find((step) => step.flowStep === "registration_intent" && /项目|介紹|介绍|收益|工作|project|intro|income/i.test(`${step.flowName} ${step.goal} ${step.triggerCondition}`)) ??
      enabledSteps.find((step) => /项目|介紹|介绍|收益|工作|project|intro|income/i.test(`${step.flowName} ${step.goal} ${step.triggerCondition}`)) ??
      enabledSteps.find((step) => step.flowCode.toUpperCase() === "B" || step.flowCode.toUpperCase() === "C") ??
      enabledSteps.find((step) => step.flowStep === "registration_intent")
    );
  }

  if (key === "registration_intent") {
    return (
      enabledSteps.find((step) => step.flowStep === "registration_intent" && (step.sendLink || step.sendInvite)) ??
      enabledSteps.find((step) => step.flowStep === "registration_intent" && /注册|注册链接|开户链接|邀请码|register|invite/i.test(`${step.flowName} ${step.goal} ${step.standardReply}`))
    );
  }

  if (key === "wait_registration") {
    return enabledSteps.find((step) => step.flowStep === "wait_registration" || step.sendLink || step.sendInvite);
  }

  return undefined;
}

function applyScriptVariables(content: string, input: StrictFlowInput, language: string, display: string): string {
  const fallbackUrl = input.country.platformRegisterUrl || input.config.PLATFORM_REGISTER_URL || "";
  const registerUrl = input.inviteCode?.registerUrl
    ? input.inviteCode.registerUrl.includes("{code}")
      ? input.inviteCode.registerUrl.replaceAll("{code}", input.inviteCode.code)
      : input.inviteCode.registerUrl
    : fallbackUrl;
  return content
    .replaceAll("{{REGISTER_URL}}", registerUrl)
    .replaceAll("{{INVITE_CODE}}", input.inviteCode?.code || "")
    .replaceAll("{{INVITE_DISPLAY}}", display || inviteDisplayText(input.inviteCode, language, fallbackUrl))
    .replaceAll("{{CUSTOMER_PHONE}}", input.conversation.extractedPhone || input.analysis.phone || "")
    .replaceAll("{{TELEGRAM_USERNAME}}", input.conversation.extractedTelegram || input.analysis.telegram || "");
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
    first_greeting: "您好，您是想了解一份兼职在线工作吗？",
    repeat_greeting: "您好，我在的。您直接说现在卡在哪一步就行。",
    chat_ack: "可以的，您想先了解工作内容、注册流程，还是 Telegram 怎么处理？我按您的问题一步一步说。",
    complaint_ack: "抱歉，刚才没接住您的问题，我先按您问的点说明清楚。",
    trust_ack: "我理解您的顾虑，具体规则和资料核实都会以后续确认为准，过程中有不清楚的地方可以直接问我。",
    payment_concern_ack: "当前引导阶段不会要求您向客服转账或私下付款；后续如有平台规则，以页面和人工确认为准。",
    investment_concern_ack: "不用先给我这边投钱或交押金；如果页面后面有规则，也以页面和人工确认为准。",
    telegram_explain_ack: "Telegram 是后续联系和指导使用的沟通工具。您现在先完成平台注册，完成后把注册手机号发给我。",
    telegram_explain_after_phone_ack: "Telegram 是后续联系和指导使用的沟通工具。您已经完成手机号这一步了，接下来只需要下载或注册 Telegram，并把 @ 开头的用户名发给我。",
    earning_concern_ack: "收益不是我这边口头固定承诺的，会按实际任务和平台规则核算，后面会再确认。",
    identity_ack: "我这边负责协助您完成开户注册和联系方式核对，会按当前步骤帮您处理。",
    phone_reason_ack: "手机号用于核对您刚才注册的平台账号，方便后续确认资料是否对应。",
    link_open_ack: "您可以复制开户链接到手机浏览器里打开，建议使用 Chrome 或 Safari；打开后按页面提示填写资料。",
    next_step_ack: "可以，我按当前进度带您继续下一步。",
    sensitive_info_ack: "这些敏感信息不用发给我，也不要给任何人。我这里只需要按流程核对开户注册所需的信息。",
    unknown_question_ack: "这个细节要以后续页面或人工确认为准，我先帮您把当前步骤走顺。",
    general_help_ack: "可以，我会一步一步协助您，不需要您自己猜流程。",
    registration_help_ack: "可以，我来带您处理注册步骤。您先按当前步骤操作，遇到问题直接告诉我。",
    telegram_help_ack: "可以，我来协助您处理 Telegram。先下载或注册 Telegram，完成后把 @ 开头的用户名发给我。",
    refusal_ack: "好的，我先不继续打扰您。如果您之后还想了解或继续注册，随时联系我就可以。",
    platform_explain: "这是用于开始兼职在线工作的开户注册平台。您可以先了解工作内容，确认愿意继续后，我再给您开户链接。",
    interest_screening_retry: "您好，您是想了解这份兼职在线工作吗？如果您感兴趣，我可以先简单介绍。",
    hesitation_ack: "没关系，您可以先了解清楚再决定。",
    bridge_interest: "您如果感兴趣，我可以先简单介绍。",
    bridge_registration_intent: "您现在是否有空继续开户注册？",
    bridge_wait_registration: "您准备继续时告诉我，我会继续带您处理注册步骤；如果已经注册完成，请把注册手机号发给我。",
    bridge_telegram_confirm: "下一步只需要确认 Telegram，方便后续人工继续跟进。",
    bridge_collect_telegram: "完成后把 @ 开头的 Telegram 用户名发给我就可以。",
    project_intro: "好的，我先简单介绍一下：这份兼职在线工作主要是协助商家提升产品销量和排名，按任务获得佣金。话本里的参考收益是每天可以赚取 300 至 800 雷亚尔，具体按平台规则核算。您现在有空闲时间继续开户注册吗？",
    registration_intent: "要开始您的第一份工作并赚取佣金，您需要先在我们的平台上注册。准备好注册了吗？我会一步一步教您完成。",
    wait_registration: "请告知我您是否已完成注册。完成后，请将您注册的手机号码发送给我，以便我们进行验证。",
    ask_registered_phone: "好的，请将您注册的手机号码发送给我，以便我们进行验证。",
    telegram_confirm: "恭喜！您已成功注册。这是您的兼职账号。请保存您的用户名和密码，以免忘记。您需要一个 Telegram 账号才能开始工作，您有 Telegram 应用吗？",
    telegram_confirm_question: "您有 Telegram 应用吗？如果有，请把您的 Telegram 用户名发给我。",
    telegram_download: "如果你的手机里安装了应用商店（Play Store 或 App Store），可以直接在那里搜索并下载 Telegram 应用。创建 Telegram 账号后请告诉我。我们会在 Telegram 教你如何赚取佣金。完成后请把 @ 开头的用户名发给我。",
    collect_telegram: "您注册好 Telegram 账号了吗？请把 @ 开头的 Telegram 用户名发送给我。",
    collect_telegram_retry: "请把您的 Telegram 用户名发送给我，需要是 @ 开头的用户名。",
    missing_invite: `注册需要邀请码。我这边正在确认您的专属邀请码，请稍等。${fallback ? `\n开户链接：${fallback}` : ""}`
  };
  const en: Record<string, string> = {
    first_greeting: "Hello, are you looking for an online part-time job?",
    repeat_greeting: "Hello, I am here. You can ask me about the job details, or tell me which step you are stuck on.",
    chat_ack: "Yes, we can talk. Would you like to know the job details, the registration steps, or how to handle Telegram? I will explain step by step.",
    complaint_ack: "Sorry, I did not understand your meaning clearly just now. You can tell me whether you want to know the job details, registration steps, or Telegram issue, and I will answer that directly.",
    trust_ack: "I understand your concern. The exact rules and information verification will follow the later confirmation. If anything is unclear, ask me directly.",
    payment_concern_ack: "At this step, you do not need to transfer money to customer service or pay privately. If the platform has later rules, follow the page and later confirmation.",
    investment_concern_ack: "You do not need to invest money or pay a deposit to me here first. If there are later platform rules, follow the page and later confirmation.",
    telegram_explain_ack: "Telegram is the contact tool used later for follow-up guidance. Please complete the platform registration first, then send me the registered phone number.",
    telegram_explain_after_phone_ack: "Telegram is the contact tool used later for follow-up guidance. Your phone step is already done; next, please download or create Telegram and send me the username starting with @.",
    earning_concern_ack: "The income is not a fixed verbal promise from me. It is calculated by actual tasks and platform rules, subject to later confirmation.",
    identity_ack: "I handle the registration and contact verification steps here, and I will guide you according to the current step.",
    phone_reason_ack: "The phone number is used to verify the platform account you registered, so the follow-up information can match correctly.",
    link_open_ack: "You can copy the registration link and open it in your phone browser. Chrome or Safari is recommended, then follow the page instructions.",
    next_step_ack: "Yes, I will continue guiding you from the current step.",
    sensitive_info_ack: "You do not need to send sensitive information like passwords, verification codes, payment details, or ID documents. I only need the information required by the current registration flow.",
    unknown_question_ack: "This needs to follow the page display or later confirmation. I will first help you complete the current registration step.",
    general_help_ack: "Yes, I can guide you step by step, so you do not need to guess the process yourself.",
    registration_help_ack: "Yes, I will guide you through the registration step. Follow the current step first, and tell me directly if anything is unclear.",
    telegram_help_ack: "Yes, I will help you handle Telegram. Please download or create Telegram first, then send me the username starting with @.",
    refusal_ack: "Okay, I will not disturb you further for now. If you want to learn more or continue registration later, you can contact me anytime.",
    platform_explain: "This is the registration platform used to start the part-time online job. You can learn about the job first. If you decide to continue, I will send the registration entry.",
    interest_screening_retry: "Hello, would you like to learn about this part-time online job? If you are interested, I can briefly introduce it.",
    hesitation_ack: "No problem. You can understand it first and decide later.",
    bridge_interest: "If you are interested, I can briefly introduce it first.",
    bridge_registration_intent: "Do you have time now to continue with the account registration?",
    bridge_wait_registration: "When you are ready to continue, tell me and I will guide you through the registration step. If you have completed registration, please send me the registered phone number.",
    bridge_telegram_confirm: "The next step is only to confirm Telegram so the follow-up can continue smoothly.",
    bridge_collect_telegram: "After that, send me your Telegram username starting with @.",
    project_intro: "Okay, let me briefly introduce it: this online part-time work helps merchants improve product sales and ranking, and commission is based on tasks. The script reference is 300 to 800 reais per day, subject to platform rules. Do you have time to continue registration now?",
    registration_intent: "To start your first job and earn commission, you need to register on our platform first. Are you ready to register? I will guide you step by step.",
    wait_registration: "Please let me know whether you have completed the registration. After that, send me the phone number you registered with so we can verify it.",
    ask_registered_phone: "Okay, please send me the phone number you registered with so we can verify it.",
    telegram_confirm: "Congratulations, you have registered successfully. This is your part-time work account. Please save your username and password so you do not forget them. You need a Telegram account to start working. Do you have the Telegram app?",
    telegram_confirm_question: "Do you have the Telegram app? If yes, please send me your Telegram username.",
    telegram_download: "If your phone has Play Store or App Store, you can search for Telegram there and download it directly. After creating your Telegram account, please tell me. We will teach you on Telegram how to earn commission. After that, send me your username starting with @.",
    collect_telegram: "Have you registered your Telegram account? Please send me your Telegram username starting with @.",
    collect_telegram_retry: "Please send me your Telegram username. It should start with @.",
    missing_invite: `Registration requires an invitation code. I am confirming your dedicated invitation code now. Please wait a moment.${fallback ? `\nRegistration link: ${fallback}` : ""}`
  };
  const pt: Record<string, string> = {
    first_greeting: "Olá, você quer conhecer um trabalho online de meio período?",
    repeat_greeting: "Olá, estou aqui. Você pode perguntar sobre os detalhes do trabalho ou me dizer em qual etapa ficou com dúvida.",
    chat_ack: "Podemos conversar, sim. Você quer saber primeiro sobre o trabalho, o cadastro ou como usar o Telegram? Eu explico passo a passo.",
    complaint_ack: "Desculpe, não entendi bem sua intenção agora há pouco. Você pode me dizer se quer saber sobre o trabalho, o cadastro ou o Telegram, e eu respondo diretamente.",
    trust_ack: "Entendo sua preocupação. As regras exatas e a verificação das informações seguem a confirmação posterior. Se algo não ficar claro, pode me perguntar diretamente.",
    payment_concern_ack: "Nesta etapa, você não precisa transferir dinheiro para o atendimento nem pagar por fora. Se houver regras da plataforma depois, siga a página e a confirmação posterior.",
    investment_concern_ack: "Você não precisa investir dinheiro nem pagar depósito para mim aqui primeiro. Se houver regras da plataforma depois, siga a página e a confirmação posterior.",
    telegram_explain_ack: "O Telegram é a ferramenta de contato usada depois para orientação. Primeiro conclua o cadastro na plataforma e envie o telefone usado no cadastro.",
    telegram_explain_after_phone_ack: "O Telegram é a ferramenta de contato usada depois para orientação. A etapa do telefone já foi concluída; agora baixe ou crie o Telegram e envie o nome de usuário começando com @.",
    earning_concern_ack: "O ganho não é uma promessa fixa minha; é calculado conforme as tarefas e regras da plataforma, sujeito à confirmação posterior.",
    identity_ack: "Eu acompanho as etapas de cadastro e verificação de contato aqui, e vou orientar você conforme a etapa atual.",
    phone_reason_ack: "O telefone é usado para verificar a conta que você cadastrou na plataforma, para que as informações sejam confirmadas corretamente depois.",
    link_open_ack: "Você pode copiar o link de cadastro e abrir no navegador do celular. Recomendo Chrome ou Safari; depois siga as instruções da página.",
    next_step_ack: "Sim, vou continuar orientando você a partir da etapa atual.",
    sensitive_info_ack: "Você não precisa enviar informações sensíveis como senha, código de verificação, dados de pagamento ou documentos. Só preciso das informações necessárias para esta etapa do cadastro.",
    unknown_question_ack: "Isso precisa seguir a página ou a confirmação posterior. Primeiro vou ajudar você a concluir a etapa atual do cadastro.",
    general_help_ack: "Sim, posso orientar você passo a passo, sem você precisar adivinhar o processo.",
    registration_help_ack: "Sim, vou orientar você no cadastro. Siga primeiro a etapa atual e me diga diretamente se tiver alguma dúvida.",
    telegram_help_ack: "Sim, vou ajudar você com o Telegram. Primeiro baixe ou crie o Telegram e depois envie o nome de usuário começando com @.",
    refusal_ack: "Tudo bem, não vou incomodar você agora. Se quiser saber mais ou continuar o cadastro depois, pode me chamar a qualquer momento.",
    platform_explain: "Esta é a plataforma de cadastro usada para iniciar o trabalho online de meio período. Você pode conhecer o trabalho primeiro. Se decidir continuar, eu envio a entrada de cadastro.",
    interest_screening_retry: "Olá, você gostaria de conhecer este trabalho online de meio período? Se tiver interesse, posso explicar rapidamente.",
    hesitation_ack: "Sem problema. Você pode entender primeiro e decidir depois.",
    bridge_interest: "Se tiver interesse, posso explicar rapidamente primeiro.",
    bridge_registration_intent: "Você tem tempo agora para continuar o cadastro da conta?",
    bridge_wait_registration: "Quando estiver pronto para continuar, me avise e eu continuo orientando o cadastro. Se já concluiu o cadastro, envie o telefone usado no cadastro.",
    bridge_telegram_confirm: "O próximo passo é apenas confirmar o Telegram para continuar o acompanhamento.",
    bridge_collect_telegram: "Depois disso, envie seu nome de usuário do Telegram começando com @.",
    project_intro: "Certo, vou explicar rapidamente: este trabalho online ajuda comerciantes a melhorar vendas e ranqueamento dos produtos, e a comissão depende das tarefas. A referência do roteiro é de 300 a 800 reais por dia, conforme as regras da plataforma. Você tem tempo para continuar o cadastro agora?",
    registration_intent: "Para começar seu primeiro trabalho e ganhar comissão, você precisa se cadastrar primeiro na nossa plataforma. Você está pronto para se cadastrar? Vou orientar você passo a passo.",
    wait_registration: "Por favor, me avise se você já concluiu o cadastro. Depois disso, envie o número de telefone usado no cadastro para fazermos a verificação.",
    ask_registered_phone: "Certo, envie o número de telefone usado no cadastro para fazermos a verificação.",
    telegram_confirm: "Parabéns, seu cadastro foi concluído. Esta é sua conta de trabalho de meio período. Guarde seu nome de usuário e sua senha para não esquecer. Você precisa de uma conta no Telegram para começar a trabalhar. Você tem o aplicativo Telegram?",
    telegram_confirm_question: "Você tem o aplicativo Telegram? Se tiver, envie seu nome de usuário do Telegram.",
    telegram_download: "Se o seu celular tiver Play Store ou App Store, você pode pesquisar e baixar o Telegram diretamente. Depois de criar a conta do Telegram, me avise. Vamos ensinar no Telegram como ganhar comissão. Depois disso, envie o nome de usuário começando com @.",
    collect_telegram: "Você já registrou sua conta no Telegram? Envie seu nome de usuário do Telegram começando com @.",
    collect_telegram_retry: "Por favor, envie seu nome de usuário do Telegram. Ele deve começar com @.",
    missing_invite: `O cadastro precisa de código de convite. Estou confirmando seu código exclusivo agora. Aguarde um momento.${fallback ? `\nLink de cadastro: ${fallback}` : ""}`
  };
  if (language === "en") return en[key] ?? zh[key] ?? "";
  if (language === "pt-BR") return pt[key] ?? zh[key] ?? "";
  return zh[key] ?? "";
}
