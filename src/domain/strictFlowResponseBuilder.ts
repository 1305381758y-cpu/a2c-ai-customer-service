import type { Conversation } from "../repositories.js";
import { buildRuleContextualIntent } from "./strictFlowContextualIntent.js";
import { shouldSendRegistrationTutorialImage } from "./strictFlowPredicates.js";
import { controlledQuestionAnswer, flowBridgeLine } from "./strictFlowQuestionAnswer.js";
import { containsNextStepPrompt, ensureActionableStrictContent, joinReplyParts, sanitizeCustomerVisibleStrictReply } from "./strictFlowReplyText.js";
import { activeScriptStep, flowScriptLine } from "./strictFlowScriptRuntime.js";
import { strictFlowScriptLine } from "./strictFlowScriptText.js";
import { normalizeFlowStep } from "./strictFlowState.js";
import type { StrictFlowInput, StrictFlowReply, StrictFlowStep } from "./strictFlowTypes.js";

export function naturalizeStrictReply(input: StrictFlowInput, step: StrictFlowStep | "", text: string, language: string, flowGoal: string, nextStep: StrictFlowStep, intent = "", forcedLine = ""): string {
  const line = (key: string, lineLanguage: string) => flowScriptLine(input, key, lineLanguage);
  const prefix = controlledQuestionAnswer(input, step, text, language, line, intent, forcedLine);
  if (!prefix) return flowGoal;
  if (prefix.pauseFlow) return prefix.content;
  if (containsNextStepPrompt(prefix.content, nextStep)) return prefix.content;
  const bridge = flowBridgeLine(nextStep, language, line);
  return joinReplyParts(prefix.content, bridge || flowGoal, language);
}

export function buildInterestProgressReply(input: StrictFlowInput, step: StrictFlowStep | "", text: string, language: string, intent = ""): string {
  const intro = flowScriptLine(input, "project_intro", language);
  const prefix = controlledQuestionAnswer(input, step, text, language, (key, lineLanguage) => flowScriptLine(input, key, lineLanguage), intent);
  if (!prefix || prefix.pauseFlow) return intro;
  return joinReplyParts(prefix.content, intro, language);
}

export function buildStrictFlowResponse(
  input: StrictFlowInput,
  language: string,
  nextFlowStep: StrictFlowStep,
  stage: Conversation["stage"],
  content: string,
  needsInviteCode = false
): StrictFlowReply {
  const actionableContent = sanitizeCustomerVisibleStrictReply(ensureActionableStrictContent(content, nextFlowStep, language, strictFlowScriptLine));
  const contextualIntent = input.contextualIntent ?? buildRuleContextualIntent(input);
  const debugIntent = input.inferredIntent && input.inferredIntent !== "unknown" ? input.inferredIntent : input.analysis.intent;
  const controlled = controlledQuestionAnswer(input, normalizeFlowStep(input.conversation.flowStep), input.customerText, language, (key, lineLanguage) => flowScriptLine(input, key, lineLanguage), debugIntent);
  const currentStep = normalizeFlowStep(input.conversation.flowStep);
  const canSendRegistrationTutorialImage = Boolean(needsInviteCode && input.inviteCode);
  return {
    enabled: true,
    reply: actionableContent,
    language,
    nextFlowStep,
    stage,
    needsInviteCode,
    fallback: !input.scriptFlow?.flow.active && !input.inviteCode && needsInviteCode,
    controlledQuestionType: controlled?.type ?? "none",
    controlledQuestionFallback: Boolean(controlled?.cautiousFallback),
    contextualIntent,
    tutorialImageRequested: shouldSendConfiguredRegistrationTutorialImage(input, canSendRegistrationTutorialImage) ||
      shouldSendRegistrationTutorialImage(input.customerText, currentStep, canSendRegistrationTutorialImage, input.config.REGISTRATION_TUTORIAL_IMAGE_URL)
  };
}

function shouldSendConfiguredRegistrationTutorialImage(input: StrictFlowInput, needsInviteCode: boolean): boolean {
  if (!needsInviteCode || !input.inviteCode || !input.config.REGISTRATION_TUTORIAL_IMAGE_URL) return false;
  const sendLinkStep = activeScriptStep(input, "send_register_link");
  return Boolean(sendLinkStep?.sendTutorialImage);
}

export function normalizeReplyLanguage(detected: string, previous: string, defaultLanguage: string): string {
  const value = detected && detected !== "unknown" ? detected : previous && previous !== "unknown" ? previous : defaultLanguage;
  return value && value !== "unknown" ? value : "pt-BR";
}
