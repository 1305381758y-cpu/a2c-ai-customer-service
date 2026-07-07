import type { ContextualIntentLabel, InternalIntentLabel } from "./analyzer.js";
import { asksGenericQuestionPermission } from "./strictFlowPredicates.js";
import { buildStrictFlowResponse, naturalizeStrictReply } from "./strictFlowResponseBuilder.js";
import { applyScriptVariables, configuredNextFlowStep, flowScriptLine } from "./strictFlowScriptRuntime.js";
import { stageForFlowStep } from "./strictFlowState.js";
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
  if (context.step === "telegram_confirm") return buildTelegramConfirmReply(input, context);
  if (context.step === "telegram_download") return buildTelegramDownloadReply(input, context);
  return buildCollectTelegramReply(input, context);
}

function buildTelegramConfirmReply(input: StrictFlowInput, context: TelegramStepReplyContext): StrictFlowReply {
  const { language, step, text, contextualLabel, negativeTelegram, positive, inferredIntent } = context;

  if (contextualLabel === "telegram_username_help") {
    const line = telegramUsernameHelpScriptKey(text);
    return buildStrictFlowResponse(input, language, "collect_telegram", "need_tg_register", flowScriptLine(input, line, language));
  }
  if (negativeTelegram) {
    const nextStep = configuredNextFlowStep(input, "telegram_confirm", "telegram_download");
    return buildStrictFlowResponse(input, language, nextStep, stageForFlowStep(nextStep, "need_tg_register"), flowScriptLine(input, "telegram_download", language));
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
    return buildStrictFlowResponse(input, language, "collect_telegram", "need_tg_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "telegram_download", language), "collect_telegram", contextualLabel));
  }
  if (shouldAcknowledgeTelegramInstalled(contextualLabel, positive)) {
    return buildTelegramLinkReply(input, language);
  }
  return buildStrictFlowResponse(input, language, "collect_telegram", "need_tg_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "collect_telegram", language), "collect_telegram", input.analysis.intent));
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
  if (shouldPauseTelegramFlow(contextualLabel, inferredIntent)) {
    return buildStrictFlowResponse(input, language, "collect_telegram", "need_tg_register", flowScriptLine(input, "refusal_ack", language));
  }
  if (negativeTelegram || contextualLabel === "need_help") {
    return buildStrictFlowResponse(input, language, "telegram_download", "need_tg_register", flowScriptLine(input, "telegram_download", language));
  }
  if (shouldWaitForTelegramUsername(contextualLabel, positive)) {
    return buildTelegramLinkReply(input, language);
  }
  if (telegramLink(input)) {
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
  return (input.country.tgRegisterGuideUrl || input.config.TG_REGISTER_GUIDE_URL || "").trim();
}

function telegramLinkInstruction(input: StrictFlowInput, language: string, link: string): string {
  const custom = flowScriptLine(input, "collect_telegram", language);
  if (custom && !/(@ 开头|@开头|Telegram 用户名|Telegram username|nome de usuário do Telegram|usuario de Telegram|usuario de telegram)/i.test(custom)) {
    const withVariables = applyScriptVariables(custom, input, language, "");
    return withVariables.includes(link) ? withVariables : `${withVariables}\n${link}`;
  }
  if (language === "en") {
    return `Now I will send you the teacher's Telegram link. She will guide you to complete the tasks and then tell you how to withdraw.\n${link}\nPlease follow her instructions. She will continue guiding you so you can earn 500 to 2800 BOB net salary per day.`;
  }
  if (language === "pt-BR") {
    return `Agora vou enviar o link do Telegram da professora. Ela vai orientar você a concluir as tarefas e depois explicar como sacar.\n${link}\nSiga as instruções dela. Ela continuará orientando você para ganhar de 500 a 2800 BOB de salário líquido por dia.`;
  }
  if (language === "es") {
    return `Ahora le voy a enviar el enlace de Telegram de la profesora. Ella le guiará para completar las tareas y después le dirá cómo retirar.\n${link}\nSiga sus instrucciones. Ella seguirá guiándole para que pueda ganar de 500 a 2800 BOB de salario neto por día.`;
  }
  return `现在我会给您老师的 Telegram 链接，她会指导您完成任务。完成后，她会告诉您如何提现。\n${link}\n按照她的指示去做。她会继续指导您，让您每天赚取 500 到 2800 BOB 的净工资。`;
}
