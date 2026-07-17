import type { AppConfig } from "../config.js";
import type { Conversation, ConversationMessageRecord } from "../repositories.js";
import { type InternalIntentLabel, type MessageAnalysis } from "./analyzer.js";
import {
  asksCustomerCorrection,
  asksForInviteOrLink,
  asksGenericQuestionPermission,
  asksNextStep,
  asksSensitiveInfo,
  cancelsPendingCustomerQuestion,
  explicitlyResumesFlow,
  isAcknowledgement,
  isContextualPositive,
  isExplicitRefusal,
  isHesitant,
  isPositive,
  isRepeatGreeting,
  saysNotAvailable
} from "./strictFlowPredicates.js";
import { buildRuleContextualIntent, isFlowControlContextualIntent } from "./strictFlowContextualIntent.js";
import { controlledQuestionAnswer } from "./strictFlowQuestionAnswer.js";
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

  const customerQuestionControl = buildStrictFlowQuestionControlReply(input);
  if (customerQuestionControl) return customerQuestionControl;

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

export function buildStrictFlowQuestionControlReply(input: StrictFlowInput): StrictFlowReply | null {
  if (!(input.strictFlowEnabled ?? isStrictFlowEnabled(input.merchant, input.country))) return null;
  const step = normalizeFlowStep(input.conversation.flowStep);
  const text = input.customerText.trim();
  const language = normalizeReplyLanguage(input.analysis.language, input.conversation.language, input.country.defaultLanguage);
  const contextualIntent = input.contextualIntent ?? buildRuleContextualIntent(input);
  if (input.conversation.awaitingCustomerQuestion &&
    (cancelsPendingCustomerQuestion(text) ||
      isExplicitRefusal(text) ||
      explicitlyResumesFlow(text) ||
      shouldBypassPendingQuestion(contextualIntent.intent) ||
      Boolean(input.analysis.phone) ||
      Boolean(input.analysis.telegram))) {
    input.conversation.awaitingCustomerQuestion = false;
  }
  return buildCustomerQuestionControlReply(input, step, text, language, contextualIntent);
}

function shouldBypassPendingQuestion(intent: StrictContextualIntent["intent"]): boolean {
  if (!isFlowControlContextualIntent(intent)) return false;
  return intent !== "acknowledgement" && intent !== "positive_confirmation";
}

function buildCustomerQuestionControlReply(
  input: StrictFlowInput,
  step: StrictFlowStep | "",
  text: string,
  language: string,
  contextualIntent: StrictContextualIntent
): StrictFlowReply | null {
  if (!step || step === "human_handoff" || step === "ended") return null;
  if (input.analysis.phone || input.analysis.telegram || isExplicitRefusal(text) || cancelsPendingCustomerQuestion(text)) return null;

  if (asksCustomerCorrection(text)) {
    return withAwaitingCustomerQuestion(
      buildStrictFlowResponse(
        input,
        language,
        step,
        input.conversation.stage,
        flowScriptLine(input, "customer_correction_ack", language)
      ),
      true,
      "await_customer_question"
    );
  }

  if (asksGenericQuestionPermission(text)) {
    const line = step === "telegram_confirm" || step === "telegram_download" || step === "collect_telegram"
      ? "ask_question_prompt_tg"
      : "ask_question_prompt";
    return withAwaitingCustomerQuestion(
      buildStrictFlowResponse(input, language, step, input.conversation.stage, flowScriptLine(input, line, language)),
      true,
      "await_customer_question"
    );
  }

  if (!input.conversation.awaitingCustomerQuestion) return null;
  const answer = controlledQuestionAnswer(
    input,
    step,
    text,
    language,
    (key, lineLanguage) => flowScriptLine(input, key, lineLanguage),
    input.inferredIntent && input.inferredIntent !== "unknown" ? input.inferredIntent : input.analysis.intent
  );
  const answerTypes = new Set<ControlledQuestionType>([
    "trust",
    "payment",
    "investment",
    "earning",
    "telegram",
    "phone_reason",
    "registration_field",
    "link_open",
    "next_step",
    "platform",
    "identity",
    "sensitive",
    "help",
    "job",
    "unknown"
  ]);
  if (answer && (contextualIntent.isQuestion || answerTypes.has(answer.type))) {
    return withAwaitingCustomerQuestion(
      buildStrictFlowResponse(input, language, step, input.conversation.stage, answer.content),
      true,
      "answer_customer_question"
    );
  }

  return withAwaitingCustomerQuestion(
    buildStrictFlowResponse(input, language, step, input.conversation.stage, flowScriptLine(input, "question_wait_ack", language)),
    true,
    "await_customer_question"
  );
}

function withAwaitingCustomerQuestion(
  reply: StrictFlowReply,
  awaiting: boolean,
  replyPurpose: StrictFlowReply["replyPurpose"]
): StrictFlowReply {
  return {
    ...reply,
    needsInviteCode: false,
    tutorialImageRequested: false,
    replyParts: undefined,
    awaitingCustomerQuestion: awaiting,
    replyPurpose
  };
}
