import type { ContextualIntentLabel, InternalIntentLabel } from "./analyzer.js";
import { mentionsAndroidPhone, saysNoTelegram } from "./strictFlowPredicates.js";

export type TelegramUsernameHelpScriptKey = "telegram_username_help" | "telegram_username_android_help";

export function telegramUsernameHelpScriptKey(text: string): TelegramUsernameHelpScriptKey {
  return mentionsAndroidPhone(text) ? "telegram_username_android_help" : "telegram_username_help";
}

export function isNegativeTelegramAnswer(contextualLabel: ContextualIntentLabel, text: string): boolean {
  return contextualLabel === "no_telegram" || saysNoTelegram(text);
}

export function shouldGuideTelegramDownload(contextualLabel: ContextualIntentLabel): boolean {
  return contextualLabel === "no_telegram" ||
    contextualLabel === "need_help" ||
    contextualLabel === "workflow_question" ||
    contextualLabel === "ask_tg_register";
}

export function shouldCollectTelegramUsername(
  contextualLabel: ContextualIntentLabel,
  inferredIntent: InternalIntentLabel,
  analysisIntent: string,
  positive: boolean
): boolean {
  return positive ||
    contextualLabel === "telegram_installed" ||
    contextualLabel === "ask_tg_register" ||
    inferredIntent === "ask_tg_register" ||
    analysisIntent === "ask_tg_register";
}

export function shouldAcknowledgeTelegramInstalled(contextualLabel: ContextualIntentLabel, positive: boolean): boolean {
  return contextualLabel === "telegram_installed" || contextualLabel === "acknowledgement" || positive;
}

export function shouldPauseTelegramFlow(contextualLabel: ContextualIntentLabel, inferredIntent: InternalIntentLabel): boolean {
  return contextualLabel === "negative_refusal" || inferredIntent === "negative_refusal";
}

export function shouldWaitForTelegramUsername(contextualLabel: ContextualIntentLabel, positive: boolean): boolean {
  return contextualLabel === "acknowledgement" || positive;
}
