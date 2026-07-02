import type { AppConfig } from "../config.js";
import type { Conversation, ConversationMessageRecord } from "../repositories.js";
import { type InternalIntentLabel, type MessageAnalysis } from "./analyzer.js";
import {
  asksAboutJob,
  asksAboutPlatform,
  asksEarningConcern,
  asksForInviteOrLink,
  asksForMoreJobInfo,
  asksForOperationHelp,
  asksForRegistrationSteps,
  asksGenericQuestionPermission,
  asksNextStep,
  asksSensitiveInfo,
  asksToChat,
  complainsAboutReply,
  isAcknowledgement,
  isContextualPositive,
  isExplicitRefusal,
  isHesitant,
  isPositive,
  isReadyToStartRegistration,
  isRepeatGreeting,
  saysNotAvailable
} from "./strictFlowPredicates.js";
import { buildRuleContextualIntent } from "./strictFlowContextualIntent.js";
import { buildInterestProgressReply, buildStrictFlowResponse, naturalizeStrictReply, normalizeReplyLanguage } from "./strictFlowResponseBuilder.js";
import { configuredNextFlowStep, flowScriptLine } from "./strictFlowScriptRuntime.js";
import { strictFlowNeedsInviteCode } from "./strictFlowInvitePolicy.js";
import { isStrictFlowEnabled } from "./strictFlowMarketPolicy.js";
import { registerInstruction } from "./strictFlowRegistration.js";
import { strictFlowVerificationLine } from "./strictFlowScriptText.js";
import { normalizeFlowStep, resolveStrictFlowStepFromState, stageForFlowStep } from "./strictFlowState.js";
import { buildWaitRegistrationReply } from "./strictFlowWaitRegistration.js";
import {
  isNegativeTelegramAnswer,
  shouldAcknowledgeTelegramInstalled,
  shouldCollectTelegramUsername,
  shouldGuideTelegramDownload,
  shouldPauseTelegramFlow,
  shouldWaitForTelegramUsername,
  telegramUsernameHelpScriptKey
} from "./strictFlowTelegram.js";
import type { ControlledQuestionType, StrictContextualIntent, StrictFlowInput, StrictFlowReply, StrictFlowStep } from "./strictFlowTypes.js";
export { STRICT_FLOW_STEPS, type ControlledQuestionType, type StrictContextualIntent, type StrictFlowInput, type StrictFlowReply, type StrictFlowStep } from "./strictFlowTypes.js";
export { buildStrictFlowFollowUp } from "./strictFlowFollowUp.js";
export { buildRuleContextualIntent } from "./strictFlowContextualIntent.js";
export { strictFlowNeedsInviteCode } from "./strictFlowInvitePolicy.js";
export { isStrictFlowEnabled } from "./strictFlowMarketPolicy.js";
export { registerInstruction, registrationStartInstruction } from "./strictFlowRegistration.js";
export { inferStrictFlowStepFromContent, inferStrictFlowStepFromHistory, normalizeFlowStep, resolveStrictFlowStepFromState, stageForFlowStep, stageToStrictFlowStep } from "./strictFlowState.js";

export function resolveEffectiveStrictFlowStep(
  conversation: Pick<Conversation, "flowStep" | "stage">,
  history: ConversationMessageRecord[] = []
): StrictFlowStep | "" {
  return resolveStrictFlowStepFromState(conversation, history);
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
  const contextualIntent = input.contextualIntent ?? buildRuleContextualIntent(input);
  const contextualLabel = contextualIntent.intent;
  const positive = isContextualPositive(step, contextualLabel) || isPositive(text, input.analysis.intent, input.inferredIntent);
  const negativeTelegram = isNegativeTelegramAnswer(contextualLabel, text);
  const asksLink = asksForInviteOrLink(text, input.analysis.intent);
  const inferredIntent = input.inferredIntent ?? "unknown";

  if (!step || step === "first_greeting") {
    return buildStrictFlowResponse(input, language, "interest_screening", "need_platform_register", flowScriptLine(input, "first_greeting", language));
  }

  if ((input.analysis.telegram || input.conversation.extractedTelegram) && !(input.analysis.phone || input.conversation.extractedPhone)) {
    return buildStrictFlowResponse(input, language, "collect_telegram", "need_phone_or_tg", flowScriptLine(input, "ask_registered_phone", language));
  }

  if (step === "interest_screening") {
    if (contextualLabel === "negative_refusal" || inferredIntent === "negative_refusal" || isExplicitRefusal(text)) {
      return buildStrictFlowResponse(input, language, "interest_screening", "need_platform_register", flowScriptLine(input, "refusal_ack", language));
    }
    if (positive || asksAboutJob(text) || asksEarningConcern(text)) {
      const nextStep = configuredNextFlowStep(input, "interest_screening", "registration_intent");
      return buildStrictFlowResponse(input, language, nextStep, stageForFlowStep(nextStep, "need_platform_register"), buildInterestProgressReply(input, step, text, language, input.analysis.intent));
    }
    if (inferredIntent === "ask_platform_register" || input.analysis.intent === "ask_platform_register") {
      const nextStep = configuredNextFlowStep(input, "interest_screening", "registration_intent");
      return buildStrictFlowResponse(input, language, nextStep, stageForFlowStep(nextStep, "need_platform_register"), buildInterestProgressReply(input, step, text, language, input.analysis.intent));
    }
    if (asksLink) {
      return buildStrictFlowResponse(input, language, "registration_intent", "need_platform_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "registration_intent", language), "registration_intent", input.analysis.intent));
    }
    return buildStrictFlowResponse(input, language, "interest_screening", "need_platform_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "interest_screening_retry", language), "interest_screening", input.analysis.intent));
  }

  if (step === "project_intro") {
    return buildStrictFlowResponse(input, language, "registration_intent", "need_platform_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "project_intro", language), "registration_intent", input.analysis.intent));
  }

  if (step === "registration_intent") {
    if (contextualLabel === "not_available" || contextualLabel === "negative_refusal" || inferredIntent === "negative_refusal" || isExplicitRefusal(text)) {
      return buildStrictFlowResponse(input, language, "registration_intent", "need_platform_register", flowScriptLine(input, "refusal_ack", language));
    }
    if (asksForMoreJobInfo(text)) {
      return buildStrictFlowResponse(input, language, "registration_intent", "need_platform_register", flowScriptLine(input, "more_job_info_ack", language));
    }
    if ((contextualLabel === "need_help" || contextualLabel === "workflow_question" || inferredIntent === "need_help" || input.analysis.intent === "need_help" || asksForOperationHelp(text)) &&
      !(asksForRegistrationSteps(text) || asksLink || isReadyToStartRegistration(text))) {
      return buildStrictFlowResponse(input, language, "registration_intent", "need_platform_register", flowScriptLine(input, "registration_help_before_ready", language));
    }
    if (asksForRegistrationSteps(text) || asksLink || isReadyToStartRegistration(text)) {
      const nextStep = configuredNextFlowStep(input, "registration_intent", "wait_registration");
      return buildStrictFlowResponse(input, language, nextStep, stageForFlowStep(nextStep, "need_platform_register"), registerInstruction(input, language), true);
    }
    if (asksAboutJob(text) || asksAboutPlatform(text) || complainsAboutReply(text) || asksToChat(text)) {
      return buildStrictFlowResponse(input, language, "registration_intent", "need_platform_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "registration_intent", language), "registration_intent", input.analysis.intent));
    }
    if (positive || asksLink || inferredIntent === "ask_link" || inferredIntent === "ask_platform_register" || input.analysis.intent === "ask_platform_register") {
      const nextStep = configuredNextFlowStep(input, "registration_intent", "wait_registration");
      return buildStrictFlowResponse(input, language, nextStep, stageForFlowStep(nextStep, "need_platform_register"), registerInstruction(input, language), true);
    }
    return buildStrictFlowResponse(input, language, "registration_intent", "need_platform_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "registration_intent", language), "registration_intent", input.analysis.intent));
  }

  if (step === "send_register_link") {
    const nextStep = configuredNextFlowStep(input, "send_register_link", "wait_registration");
    return buildStrictFlowResponse(input, language, nextStep, stageForFlowStep(nextStep, "need_platform_register"), registerInstruction(input, language), true);
  }

  if (step === "wait_registration") {
    return buildWaitRegistrationReply(input, {
      language,
      step,
      text,
      contextualLabel,
      negativeTelegram,
      asksLink,
      inferredIntent
    });
  }

  if (step === "telegram_confirm") {
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

  if (step === "telegram_download") {
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

  if (step === "collect_telegram") {
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

  return buildStrictFlowResponse(input, language, "ended", "ready_for_handoff", strictFlowVerificationLine(language));
}
