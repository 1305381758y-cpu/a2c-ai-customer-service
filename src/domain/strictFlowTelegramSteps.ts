import type { ContextualIntentLabel, InternalIntentLabel } from "./analyzer.js";
import { asksGenericQuestionPermission } from "./strictFlowPredicates.js";
import { buildStrictFlowResponse, naturalizeStrictReply } from "./strictFlowResponseBuilder.js";
import { configuredNextFlowStep, flowScriptLine } from "./strictFlowScriptRuntime.js";
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
    const nextStep = configuredNextFlowStep(input, "telegram_confirm", "collect_telegram");
    return buildStrictFlowResponse(input, language, nextStep, stageForFlowStep(nextStep, "need_tg_register"), flowScriptLine(input, "collect_telegram", language));
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
    const nextStep = configuredNextFlowStep(input, "telegram_download", "collect_telegram");
    return buildStrictFlowResponse(input, language, nextStep, stageForFlowStep(nextStep, "need_tg_register"), flowScriptLine(input, "telegram_installed_ack", language));
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
    return buildStrictFlowResponse(input, language, "collect_telegram", "need_tg_register", flowScriptLine(input, "collect_telegram_wait", language));
  }
  return buildStrictFlowResponse(input, language, "collect_telegram", "need_tg_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "collect_telegram_retry", language), "collect_telegram", input.analysis.intent));
}
