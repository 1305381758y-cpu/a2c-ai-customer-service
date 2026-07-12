import type { AppConfig } from "../config.js";
import type { Conversation, ConversationMessageRecord } from "../repositories.js";
import { type InternalIntentLabel, type MessageAnalysis } from "./analyzer.js";
import {
  asksForInviteOrLink,
  asksNextStep,
  asksSensitiveInfo,
  isAcknowledgement,
  isContextualPositive,
  isHesitant,
  isPositive,
  isRepeatGreeting,
  saysNotAvailable
} from "./strictFlowPredicates.js";
import { buildRuleContextualIntent } from "./strictFlowContextualIntent.js";
import { buildStrictFlowResponse, normalizeReplyLanguage } from "./strictFlowResponseBuilder.js";
import { flowScriptLine } from "./strictFlowScriptRuntime.js";
import { strictFlowNeedsInviteCode } from "./strictFlowInvitePolicy.js";
import { isStrictFlowEnabled } from "./strictFlowMarketPolicy.js";
import { registerInstruction } from "./strictFlowRegistration.js";
import { strictFlowVerificationLine } from "./strictFlowScriptText.js";
import { normalizeFlowStep, resolveStrictFlowStepFromState } from "./strictFlowState.js";
import { buildWaitRegistrationReply } from "./strictFlowWaitRegistration.js";
import { buildTelegramStepReply } from "./strictFlowTelegramSteps.js";
import { isNegativeTelegramAnswer } from "./strictFlowTelegram.js";
import { buildRegistrationStepReply } from "./strictFlowRegistrationSteps.js";
import type { ControlledQuestionType, StrictContextualIntent, StrictFlowInput, StrictFlowReply, StrictFlowStep } from "./strictFlowTypes.js";
export { STRICT_FLOW_STEPS, type ControlledQuestionType, type StrictContextualIntent, type StrictFlowInput, type StrictFlowReply, type StrictFlowStep } from "./strictFlowTypes.js";
export { buildStrictFlowFollowUp, normalizeFollowUpLanguage } from "./strictFlowFollowUp.js";
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

  if (step === "interest_screening" || step === "project_intro" || step === "registration_intent" || step === "send_register_link") {
    return buildRegistrationStepReply(input, {
      language,
      step,
      text,
      contextualLabel,
      positive,
      asksLink,
      inferredIntent
    });
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

  if (step === "telegram_confirm" || step === "telegram_download" || step === "collect_telegram") {
    return buildTelegramStepReply(input, {
      language,
      step,
      text,
      contextualLabel,
      negativeTelegram,
      positive,
      inferredIntent
    });
  }

  return buildStrictFlowResponse(input, language, "ended", "ready_for_handoff", strictFlowVerificationLine(language));
}
