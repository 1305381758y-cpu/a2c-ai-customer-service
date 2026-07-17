import type { ContextualIntentLabel, InternalIntentLabel } from "./analyzer.js";
import {
  asksEarningConcern,
  asksGenericQuestionPermission,
  asksInvestmentConcern,
  asksPaymentConcern,
  asksTelegramExplanation,
  asksWhetherTelegramOptional,
  asksWhyTelegramRequired,
  asksTrustConcern,
  looksLikeQuestion
} from "./strictFlowPredicates.js";
import { buildStrictFlowResponse, naturalizeStrictReply } from "./strictFlowResponseBuilder.js";
import { applyScriptVariables, configuredNextFlowStep, flowScriptLine } from "./strictFlowScriptRuntime.js";
import { stageForFlowStep } from "./strictFlowState.js";
import { joinReplyParts } from "./strictFlowReplyText.js";
import {
  shouldAcknowledgeTelegramInstalled,
  shouldCollectTelegramUsername,
  shouldGuideTelegramDownload,
  shouldPauseTelegramFlow,
  shouldWaitForTelegramUsername,
  telegramUsernameHelpScriptKey
} from "./strictFlowTelegram.js";
import type { StrictFlowInput, StrictFlowReply, StrictFlowStep } from "./strictFlowTypes.js";

export interface TelegramStepReplyContext {
  language: string;
  step: Extract<StrictFlowStep, "telegram_confirm" | "telegram_download" | "collect_telegram">;
  text: string;
  contextualLabel: ContextualIntentLabel;
  negativeTelegram: boolean;
  positive: boolean;
  inferredIntent: InternalIntentLabel;
}

export function buildTelegramStepReply(input: StrictFlowInput, context: TelegramStepReplyContext): StrictFlowReply {
  if (context.contextualLabel === "not_registered") {
    return buildStrictFlowResponse(
      input,
      context.language,
      "wait_registration",
      "need_platform_register",
      naturalizeStrictReply(input, context.step, context.text, context.language, flowScriptLine(input, "not_registered_ack", context.language), "wait_registration", "not_registered")
    );
  }
  // Asking why Telegram is needed is not confirmation and must never send the
  // tutor link or trigger handoff. Keep the current step and answer first.
  if (asksTelegramExplanation(context.text) || context.contextualLabel === "ask_tg_register" || context.inferredIntent === "ask_tg_register") {
    return buildTelegramQuestionReply(input, context);
  }
  if (isRepeatedNodeQuestion(context)) {
    return buildStrictFlowResponse(
      input,
      context.language,
      context.step,
      "need_tg_register",
      naturalizeStrictReply(
        input,
        context.step,
        context.text,
        context.language,
        flowScriptLine(input, context.step === "telegram_confirm" ? "telegram_confirm_question" : "collect_telegram_wait", context.language),
        context.step,
        context.contextualLabel
      )
    );
  }
  if (context.contextualLabel === "telegram_submission") {
    return buildTelegramLinkReply(input, context.language);
  }
  if (context.step === "telegram_confirm") return buildTelegramConfirmReply(input, context);
  if (context.step === "telegram_download") return buildTelegramDownloadReply(input, context);
  return buildCollectTelegramReply(input, context);
}

function isRepeatedNodeQuestion(context: TelegramStepReplyContext): boolean {
  const text = context.text.trim();
  if (context.contextualLabel === "telegram_username_help" || context.contextualLabel === "no_telegram" || context.contextualLabel === "telegram_installed") return false;
  return context.contextualLabel === "trust_concern" ||
    context.contextualLabel === "payment_concern" ||
    context.contextualLabel === "investment_concern" ||
    context.contextualLabel === "earning_concern" ||
    context.contextualLabel === "workflow_question" ||
    context.contextualLabel === "need_help" ||
    asksTrustConcern(text) ||
    asksPaymentConcern(text) ||
    asksInvestmentConcern(text) ||
    asksEarningConcern(text) ||
    (!asksTelegramExplanation(text) && looksLikeQuestion(text));
}

function buildTelegramQuestionReply(input: StrictFlowInput, context: TelegramStepReplyContext): StrictFlowReply {
  const key = asksWhyTelegramRequired(context.text)
    ? "telegram_required_ack"
    : asksWhetherTelegramOptional(context.text)
      ? "telegram_optional_ack"
      : "telegram_purpose_after_phone_ack";
  const answer = flowScriptLine(input, key, context.language);
  const asksDownloadHelp = /(怎么|怎麼|如何).*(下载|下載|安装|安裝)|how.*(?:download|install)|como.*(?:baixar|instalar|descargar)|c[oó]mo.*(?:descargar|instalar)/i.test(context.text);
  const content = asksDownloadHelp
    ? joinReplyParts(answer, flowScriptLine(input, "telegram_download", context.language), context.language)
    : answer;
  const nextStep = asksDownloadHelp ? "telegram_download" : context.step;
  return buildStrictFlowResponse(
    input,
    context.language,
    nextStep,
    "need_tg_register",
    content
  );
}

function buildTelegramConfirmReply(input: StrictFlowInput, context: TelegramStepReplyContext): StrictFlowReply {
  const { language, step, text, contextualLabel, negativeTelegram, positive, inferredIntent } = context;

  if (contextualLabel === "telegram_username_help") {
    const line = telegramUsernameHelpScriptKey(text);
    return buildStrictFlowResponse(input, language, "collect_telegram", "need_tg_register", flowScriptLine(input, line, language));
  }
  if (negativeTelegram) {
    const nextStep = configuredNextFlowStep(input, "telegram_confirm", "telegram_download");
    const explanation = contextualLabel === "ask_tg_register" || asksTelegramExplanation(text)
      ? flowScriptLine(input, "telegram_explain_after_phone_ack", language)
      : "";
    const content = joinReplyParts(explanation, flowScriptLine(input, "telegram_download", language), language);
    return buildStrictFlowResponse(input, language, nextStep, stageForFlowStep(nextStep, "need_tg_register"), content);
  }
  if (shouldPauseTelegramFlow(contextualLabel, inferredIntent)) {
    return buildStrictFlowResponse(input, language, "telegram_confirm", "need_tg_register", flowScriptLine(input, "refusal_ack", language));
  }
  if (shouldCollectTelegramUsername(contextualLabel, inferredIntent, input.analysis.intent, positive)) {
    return buildTelegramLinkReply(input, language);
  }
  return buildStrictFlowResponse(input, language, "telegram_confirm", "need_tg_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "telegram_confirm_question", language), "telegram_confirm", input.analysis.intent));
}

function buildTelegramDownloadReply(input: StrictFlowInput, context: TelegramStepReplyContext): StrictFlowReply {
  const { language, step, text, contextualLabel, positive } = context;

  if (contextualLabel === "telegram_username_help") {
    const line = telegramUsernameHelpScriptKey(text);
    return buildStrictFlowResponse(input, language, "collect_telegram", "need_tg_register", flowScriptLine(input, line, language));
  }
  if (shouldGuideTelegramDownload(contextualLabel)) {
    return buildStrictFlowResponse(input, language, "telegram_download", "need_tg_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "telegram_download", language), "telegram_download", contextualLabel));
  }
  if (shouldAcknowledgeTelegramInstalled(contextualLabel, positive) && contextualLabel !== "acknowledgement") {
    return buildTelegramLinkReply(input, language);
  }
  return buildStrictFlowResponse(input, language, "telegram_download", "need_tg_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "collect_telegram_wait", language), "telegram_download", input.analysis.intent));
}

function buildCollectTelegramReply(input: StrictFlowInput, context: TelegramStepReplyContext): StrictFlowReply {
  const { language, step, text, contextualLabel, negativeTelegram, positive, inferredIntent } = context;

  if (contextualLabel === "telegram_username_help") {
    const line = telegramUsernameHelpScriptKey(text);
    return buildStrictFlowResponse(input, language, "collect_telegram", "need_tg_register", flowScriptLine(input, line, language));
  }
  if (asksGenericQuestionPermission(text)) {
    return buildStrictFlowResponse(input, language, "collect_telegram", "need_tg_register", flowScriptLine(input, "ask_question_prompt_tg", language));
  }
  if (contextualLabel === "ask_tg_register" || asksTelegramExplanation(text)) {
    const content = joinReplyParts(flowScriptLine(input, "telegram_explain_after_phone_ack", language), flowScriptLine(input, "telegram_download", language), language);
    return buildStrictFlowResponse(input, language, "telegram_download", "need_tg_register", content);
  }
  if (shouldPauseTelegramFlow(contextualLabel, inferredIntent)) {
    return buildStrictFlowResponse(input, language, "collect_telegram", "need_tg_register", flowScriptLine(input, "refusal_ack", language));
  }
  if (negativeTelegram || contextualLabel === "need_help") {
    return buildStrictFlowResponse(input, language, "telegram_download", "need_tg_register", flowScriptLine(input, "telegram_download", language));
  }
  if (shouldWaitForTelegramUsername(contextualLabel, positive) && contextualLabel !== "acknowledgement") {
    return buildTelegramLinkReply(input, language);
  }
  return buildStrictFlowResponse(input, language, "collect_telegram", "need_tg_register", flowScriptLine(input, "collect_telegram_wait", language));
}

function buildTelegramLinkReply(input: StrictFlowInput, language: string): StrictFlowReply {
  const link = telegramLink(input);
  if (!link) {
    return buildStrictFlowResponse(input, language, "collect_telegram", "need_tg_register", flowScriptLine(input, "collect_telegram_wait", language));
  }
  const nextStep = configuredNextFlowStep(input, "collect_telegram", "human_handoff");
  return buildStrictFlowResponse(input, language, nextStep, stageForFlowStep(nextStep, "ready_for_handoff"), telegramLinkInstruction(input, language, link));
}

function telegramLink(input: StrictFlowInput): string {
  return (input.teacherTelegramLink || input.country.tgRegisterGuideUrl || input.config.TG_REGISTER_GUIDE_URL || "").trim();
}

function telegramLinkInstruction(input: StrictFlowInput, language: string, link: string): string {
  const custom = flowScriptLine(input, "collect_telegram", language);
  if (custom && !/(@ 开头|@开头|Telegram 用户名|Telegram username|nome de usuário do Telegram|usuario de Telegram|usuario de telegram)/i.test(custom)) {
    const withVariables = applyScriptVariables(custom, input, language, "");
    const cleaned = removeCustomerAddWording(withVariables);
    const withContactInstruction = ensureTeacherContactInstruction(cleaned, language);
    return withContactInstruction.includes(link) ? withContactInstruction : `${withContactInstruction}\n${link}`;
  }
  if (language === "en") {
    return `I am sending you the teacher's Telegram link now. Please open it and contact her directly. She will guide you through the tasks and explain the next steps.\n${link}\nPlease follow her instructions.`;
  }
  if (language === "pt-BR") {
    return `Agora vou enviar o link do Telegram da professora. Abra o link e entre em contato diretamente com ela. Ela vai orientar você nas tarefas e explicar os próximos passos.\n${link}\nSiga as instruções dela.`;
  }
  if (language === "es") {
    return `Ahora le voy a enviar el enlace de Telegram de la profesora. Abra el enlace y contacte directamente con ella. Le guiará en las tareas y le explicará los siguientes pasos.\n${link}\nSiga sus instrucciones.`;
  }
  return `现在我把老师的 Telegram 链接发给您。请点击链接，主动联系导师。她会继续指导您完成任务，并说明后续操作。\n${link}\n请按照她的指示进行。`;
}

function ensureTeacherContactInstruction(content: string, language: string): string {
  if (/(主动联系|点击.*链接.*联系|contact(?:e|ar)?(?: directly)?|entre em contato|contacte directamente|contácte|contactar)/i.test(content)) return content;
  if (language === "en") return `${content}\nPlease open the link and contact the teacher directly.`;
  if (language === "pt-BR") return `${content}\nAbra o link e entre em contato diretamente com a professora.`;
  if (language === "es") return `${content}\nAbra el enlace y contacte directamente con la profesora.`;
  return `${content}\n请点击链接，主动联系导师。`;
}

function removeCustomerAddWording(content: string): string {
  return content
    .replace(/，?这样我就能加(?:您|你)[。！!]?/g, "")
    .replace(/，?我(?:来|会|能)?加(?:您|你)[。！!]?/g, "")
    .replace(/,?\s*así podré agregarte[.!]?/gi, ".")
    .replace(/,?\s*para que pueda agregarte[.!]?/gi, ".")
    .replace(/,?\s*para poder agregarle[.!]?/gi, ".")
    .trim();
}
