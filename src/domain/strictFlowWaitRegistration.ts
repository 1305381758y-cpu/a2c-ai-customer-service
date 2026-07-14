import type { ContextualIntentLabel, InternalIntentLabel } from "./analyzer.js";
import {
  asksForInviteOrLink,
  asksForOperationHelp,
  asksForRegistrationSteps,
  asksGenericQuestionPermission,
  asksHowToOpenLink,
  asksLookAtCurrentProblem,
  asksPaymentConcern,
  asksRegistrationFieldQuestion,
  asksTelegramExplanation,
  asksToAnswerPreviousQuestion,
  asksTrustConcern,
  asksVerificationCodeProblem,
  asksWhetherCanReadImage,
  isInboundImageOrScreenshot,
  isRegistrationInProgress,
  isReadyToStartRegistration,
  isRegistrationDoneConfirmation,
  reportsLinkLoadFailure,
  reportsRegistrationBlocker
} from "./strictFlowPredicates.js";
import { registrationFieldQuestionReply } from "./strictFlowQuestionAnswer.js";
import { buildStrictFlowResponse, naturalizeStrictReply } from "./strictFlowResponseBuilder.js";
import { configuredNextFlowStep, flowScriptLine } from "./strictFlowScriptRuntime.js";
import { registerInstruction, registrationStartInstruction } from "./strictFlowRegistration.js";
import { stageForFlowStep } from "./strictFlowState.js";
import type { StrictFlowInput, StrictFlowReply, StrictFlowStep } from "./strictFlowTypes.js";

export interface WaitRegistrationReplyContext {
  language: string;
  step: StrictFlowStep;
  text: string;
  contextualLabel: ContextualIntentLabel;
  negativeTelegram: boolean;
  asksLink: boolean;
  inferredIntent: InternalIntentLabel;
}

export function buildWaitRegistrationReply(input: StrictFlowInput, context: WaitRegistrationReplyContext): StrictFlowReply {
  const { language, step, text, contextualLabel, negativeTelegram, asksLink, inferredIntent } = context;
  const linkFailureHandoffReason = "客户反馈无法打开注册链接";

  if (contextualLabel === "incomplete_phone") {
    return buildStrictFlowResponse(input, language, "wait_registration", "need_platform_register", flowScriptLine(input, "incomplete_phone_ack", language));
  }
  if (asksWhetherCanReadImage(text)) {
    return buildStrictFlowResponse(input, language, "wait_registration", "need_platform_register", flowScriptLine(input, "image_recognition_ack", language));
  }
  if (isInboundImageOrScreenshot(text)) {
    return buildStrictFlowResponse(input, language, "wait_registration", "need_platform_register", flowScriptLine(input, "registration_screenshot_ack", language));
  }
  if (contextualLabel === "registration_field_question" || asksRegistrationFieldQuestion(text)) {
    return buildStrictFlowResponse(input, language, "wait_registration", "need_platform_register", registrationFieldQuestionReply(language, text));
  }
  if (asksVerificationCodeProblem(text)) {
    return buildStrictFlowResponse(input, language, "wait_registration", "need_platform_register", flowScriptLine(input, "verification_code_ack", language));
  }
  if (reportsLinkLoadFailure(text)) {
    if ((input.linkLoadFailureCount ?? 1) >= 2) {
      return buildStrictFlowResponse(
        input,
        language,
        "human_handoff",
        "ready_for_handoff",
        flowScriptLine(input, "link_load_failure_handoff_ack", language),
        false,
        linkFailureHandoffReason
      );
    }
    return buildStrictFlowResponse(input, language, "wait_registration", "need_platform_register", flowScriptLine(input, "link_load_failure_ack", language));
  }
  if (asksHowToOpenLink(text)) {
    if ((input.linkLoadFailureCount ?? 1) >= 2) {
      return buildStrictFlowResponse(
        input,
        language,
        "human_handoff",
        "ready_for_handoff",
        flowScriptLine(input, "link_load_failure_handoff_ack", language),
        false,
        linkFailureHandoffReason
      );
    }
    return buildStrictFlowResponse(input, language, "wait_registration", "need_platform_register", flowScriptLine(input, "link_open_ack", language));
  }
  if (reportsRegistrationBlocker(text)) {
    return buildStrictFlowResponse(input, language, "wait_registration", "need_platform_register", flowScriptLine(input, "registration_blocker_ack", language));
  }
  if (asksGenericQuestionPermission(text)) {
    return buildStrictFlowResponse(input, language, "wait_registration", "need_platform_register", flowScriptLine(input, "ask_question_prompt", language));
  }
  if (asksLookAtCurrentProblem(text)) {
    return buildStrictFlowResponse(input, language, "wait_registration", "need_platform_register", flowScriptLine(input, "look_at_problem_ack", language));
  }
  if (asksToAnswerPreviousQuestion(text)) {
    return buildStrictFlowResponse(input, language, "wait_registration", "need_platform_register", flowScriptLine(input, "registration_question_retry_ack", language));
  }
  if (asksForRegistrationSteps(text)) {
    return buildStrictFlowResponse(input, language, "wait_registration", "need_platform_register", registerInstruction(input, language, "help"), true);
  }
  if (isReadyToStartRegistration(text)) {
    return buildStrictFlowResponse(input, language, "wait_registration", "need_platform_register", registrationStartInstruction(input, language), true);
  }
  if (isRegistrationInProgress(text)) {
    return buildStrictFlowResponse(input, language, "wait_registration", "need_platform_register", flowScriptLine(input, "registration_in_progress_ack", language));
  }
  if (contextualLabel === "acknowledgement") {
    return buildStrictFlowResponse(input, language, "wait_registration", "need_platform_register", flowScriptLine(input, "wait_registration_ack", language));
  }
  if (contextualLabel === "not_registered") {
    return buildStrictFlowResponse(input, language, "wait_registration", "need_platform_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "not_registered_ack", language), "wait_registration", "not_registered"));
  }
  if (input.analysis.intent === "trust_concern" || asksTrustConcern(text)) {
    return buildStrictFlowResponse(input, language, "wait_registration", "need_platform_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "wait_registration", language), "wait_registration", "trust_concern"));
  }
  if (asksPaymentConcern(text)) {
    return buildStrictFlowResponse(input, language, "wait_registration", "need_platform_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "wait_registration", language), "wait_registration", "payment_concern"));
  }
  if (contextualLabel === "ask_tg_register" || input.analysis.intent === "ask_tg_register" || inferredIntent === "ask_tg_register" || asksTelegramExplanation(text)) {
    const line = input.conversation.extractedPhone || input.analysis.phone ? "telegram_explain_after_phone_ack" : "telegram_explain_ack";
    return buildStrictFlowResponse(input, language, "wait_registration", "need_platform_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "wait_registration", language), "wait_registration", "telegram_explain", line));
  }
  if (contextualLabel === "need_help" || contextualLabel === "workflow_question" || inferredIntent === "need_help" || input.analysis.intent === "need_help" || asksForOperationHelp(text)) {
    return buildStrictFlowResponse(input, language, "wait_registration", "need_platform_register", flowScriptLine(input, "registration_help_ack", language));
  }
  if (contextualLabel === "platform_register_done" || inferredIntent === "platform_register_done" || input.analysis.intent === "platform_register_done" || isRegistrationDoneConfirmation(text) || input.analysis.phone || input.conversation.extractedPhone) {
    if (!(input.analysis.phone || input.conversation.extractedPhone)) {
      return buildStrictFlowResponse(input, language, "wait_registration", "need_platform_register", flowScriptLine(input, "ask_registered_phone", language));
    }
    if (negativeTelegram) {
      const nextStep = configuredNextFlowStep(input, "telegram_confirm", "telegram_download");
      return buildStrictFlowResponse(input, language, nextStep, stageForFlowStep(nextStep, "need_tg_register"), flowScriptLine(input, "telegram_download", language));
    }
    const nextStep = configuredNextFlowStep(input, "wait_registration", "telegram_confirm");
    return buildStrictFlowResponse(input, language, nextStep, stageForFlowStep(nextStep, "need_tg_register"), flowScriptLine(input, input.analysis.phone || input.conversation.extractedPhone ? "telegram_confirm" : "ask_registered_phone", language));
  }
  if (asksLink || inferredIntent === "ask_link" || asksForInviteOrLink(text, input.analysis.intent)) {
    return buildStrictFlowResponse(input, language, "wait_registration", "need_platform_register", registerInstruction(input, language), true);
  }
  return buildStrictFlowResponse(input, language, "wait_registration", "need_platform_register", naturalizeStrictReply(input, step, text, language, flowScriptLine(input, "wait_registration", language), "wait_registration", input.analysis.intent));
}
