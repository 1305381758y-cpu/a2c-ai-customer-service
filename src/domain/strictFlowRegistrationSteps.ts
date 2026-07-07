import type { ContextualIntentLabel, InternalIntentLabel } from "./analyzer.js";
import {
  asksAboutJob,
  asksAboutPlatform,
  asksEarningConcern,
  asksForMoreJobInfo,
  asksForOperationHelp,
  asksForRegistrationSteps,
  asksToChat,
  complainsAboutReply,
  isExplicitRefusal,
  isReadyToStartRegistration,
  isRegistrationDoneConfirmation
} from "./strictFlowPredicates.js";
import { buildInterestProgressReply, buildStrictFlowResponse, naturalizeStrictReply } from "./strictFlowResponseBuilder.js";
import { configuredNextFlowStep, flowScriptLine } from "./strictFlowScriptRuntime.js";
import { registerInstruction } from "./strictFlowRegistration.js";
import { stageForFlowStep } from "./strictFlowState.js";
import type { StrictFlowInput, StrictFlowReply, StrictFlowStep } from "./strictFlowTypes.js";

export interface RegistrationStepReplyContext {
  language: string;
  step: Extract<StrictFlowStep, "interest_screening" | "project_intro" | "registration_intent" | "send_register_link">;
  text: string;
  contextualLabel: ContextualIntentLabel;
  positive: boolean;
  asksLink: boolean;
  inferredIntent: InternalIntentLabel;
}

export function buildRegistrationStepReply(input: StrictFlowInput, context: RegistrationStepReplyContext): StrictFlowReply {
  if (context.step === "interest_screening") return buildInterestScreeningReply(input, context);
  if (context.step === "project_intro") {
    return buildStrictFlowResponse(input, context.language, "registration_intent", "need_platform_register", naturalizeStrictReply(input, context.step, context.text, context.language, flowScriptLine(input, "project_intro", context.language), "registration_intent", input.analysis.intent));
  }
  if (context.step === "registration_intent") return buildRegistrationIntentReply(input, context);

  const nextStep = configuredNextFlowStep(input, "send_register_link", "wait_registration");
  return buildStrictFlowResponse(input, context.language, nextStep, stageForFlowStep(nextStep, "need_platform_register"), registerInstruction(input, context.language), true);
}

function buildInterestScreeningReply(input: StrictFlowInput, context: RegistrationStepReplyContext): StrictFlowReply {
  const { language, step, text, contextualLabel, positive, asksLink, inferredIntent } = context;

  if (contextualLabel === "negative_refusal" || inferredIntent === "negative_refusal" || isExplicitRefusal(text)) {
    return buildStrictFlowResponse(input, language, "interest_screening", "need_platform_register", flowScriptLine(input, "refusal_ack", language));
  }
  if (positive || asksAboutJob(text) || asksEarningConcern(text)) {
    const configuredStep = configuredNextFlowStep(input, "interest_screening", "registration_intent");
    const nextStep = configuredStep === "project_intro"
      ? configuredNextFlowStep(input, "project_intro", "registration_intent")
      : configuredStep;
    return buildStrictFlowResponse(input, language, nextStep, stageForFlowStep(nextStep, "need_platform_register"), buildInterestProgressReply(input, step, text, language, input.analysis.intent));
  }
  if (inferredIntent === "ask_platform_register" || input.analysis.intent === "ask_platform_register") {
    const configuredStep = configuredNextFlowStep(input, "interest_screening", "registration_intent");
    const nextStep = configuredStep === "project_intro"
      ? configuredNextFlowStep(input, "project_intro", "registration_intent")
      : configuredStep;
    return buildStrictFlowResponse(input, language, nextStep, stageForFlowStep(nextStep, "need_platform_register"), buildInterestProgressReply(input, step, text, language, input.analysis.intent));
  }
  if (asksLink) {
    return buildStrictFlowResponse(input, language, "registration_intent", "need_platform_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "registration_intent", language), "registration_intent", input.analysis.intent));
  }
  return buildStrictFlowResponse(input, language, "interest_screening", "need_platform_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "interest_screening_retry", language), "interest_screening", input.analysis.intent));
}

function buildRegistrationIntentReply(input: StrictFlowInput, context: RegistrationStepReplyContext): StrictFlowReply {
  const { language, step, text, contextualLabel, positive, asksLink, inferredIntent } = context;

  if (contextualLabel === "not_available" || contextualLabel === "negative_refusal" || inferredIntent === "negative_refusal" || isExplicitRefusal(text)) {
    return buildStrictFlowResponse(input, language, "registration_intent", "need_platform_register", flowScriptLine(input, "refusal_ack", language));
  }
  if (asksForMoreJobInfo(text)) {
    return buildStrictFlowResponse(input, language, "registration_intent", "need_platform_register", flowScriptLine(input, "more_job_info_ack", language));
  }
  if (contextualLabel === "platform_register_done" || inferredIntent === "platform_register_done" || input.analysis.intent === "platform_register_done" || isRegistrationDoneConfirmation(text) || input.analysis.phone || input.conversation.extractedPhone) {
    if (!(input.analysis.phone || input.conversation.extractedPhone)) {
      return buildStrictFlowResponse(input, language, "wait_registration", "need_platform_register", flowScriptLine(input, "ask_registered_phone", language));
    }
    const nextStep = configuredNextFlowStep(input, "wait_registration", "telegram_confirm");
    return buildStrictFlowResponse(input, language, nextStep, stageForFlowStep(nextStep, "need_tg_register"), flowScriptLine(input, "telegram_confirm", language));
  }
  if ((contextualLabel === "need_help" || contextualLabel === "workflow_question" || inferredIntent === "need_help" || input.analysis.intent === "need_help" || asksForOperationHelp(text)) &&
    !(asksForRegistrationSteps(text) || asksLink || isReadyToStartRegistration(text))) {
    return buildStrictFlowResponse(input, language, "registration_intent", "need_platform_register", flowScriptLine(input, "registration_help_before_ready", language));
  }
  if (asksForRegistrationSteps(text) || asksLink || isReadyToStartRegistration(text)) {
    const nextStep = nextRegistrationStep(input);
    return buildStrictFlowResponse(input, language, nextStep, stageForFlowStep(nextStep, "need_platform_register"), registerInstruction(input, language), true);
  }
  if (asksAboutJob(text) || asksAboutPlatform(text) || complainsAboutReply(text) || asksToChat(text)) {
    return buildStrictFlowResponse(input, language, "registration_intent", "need_platform_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "registration_intent", language), "registration_intent", input.analysis.intent));
  }
  if (positive || asksLink || inferredIntent === "ask_link" || inferredIntent === "ask_platform_register" || input.analysis.intent === "ask_platform_register") {
    const nextStep = nextRegistrationStep(input);
    return buildStrictFlowResponse(input, language, nextStep, stageForFlowStep(nextStep, "need_platform_register"), registerInstruction(input, language), true);
  }
  return buildStrictFlowResponse(input, language, "registration_intent", "need_platform_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "registration_intent", language), "registration_intent", input.analysis.intent));
}

function nextRegistrationStep(input: StrictFlowInput): StrictFlowStep {
  if (!input.inviteCode) return "registration_intent";
  const configuredStep = configuredNextFlowStep(input, "registration_intent", "wait_registration");
  return configuredStep === "send_register_link" ? configuredNextFlowStep(input, "send_register_link", "wait_registration") : configuredStep;
}
