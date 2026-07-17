import type { Conversation } from "../repositories.js";
import { buildRuleContextualIntent } from "./strictFlowContextualIntent.js";
import { shouldSendRegistrationTutorialImage } from "./strictFlowPredicates.js";
import { controlledQuestionAnswer, flowBridgeLine } from "./strictFlowQuestionAnswer.js";
import { containsNextStepPrompt, ensureActionableStrictContent, joinReplyParts, sanitizeCustomerVisibleStrictReply } from "./strictFlowReplyText.js";
import { activeScriptStep, flowScriptLine, flowScriptLines } from "./strictFlowScriptRuntime.js";
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

export function buildInterestProgressReplyParts(input: StrictFlowInput, step: StrictFlowStep | "", text: string, language: string, intent = ""): string[] {
  const line = (key: string, lineLanguage: string) => flowScriptLine(input, key, lineLanguage);
  const introParts = removeUneditedBuiltInIntro(input, flowScriptLines(input, "project_intro", language), language);
  const prefix = controlledQuestionAnswer(input, step, text, language, line, intent);
  const parts = prefix && !prefix.pauseFlow ? [prefix.content, ...introParts] : introParts;
  const confirmation = registrationIntentLine(input, language);
  // Older/customized project-intro nodes may already contain the availability
  // question. Do not append a second confirmation in that case.
  if (confirmation && !containsNextStepPrompt(introParts.join("\n"), "registration_intent")) parts.push(confirmation);
  return parts.filter((part, index) => part.trim() && parts.indexOf(part) === index);
}

function removeUneditedBuiltInIntro(input: StrictFlowInput, parts: string[], language: string): string[] {
  if (!input.scriptFlow?.flow.active || parts.length < 2) return parts;
  const builtIn = strictFlowScriptLine("project_intro", language).trim();
  const builtInTexts = [builtIn, legacyBuiltInIntro(language)];
  const normalizedBuiltIns = builtInTexts.filter(Boolean).map(normalizeIntroText);
  const hasCustomPart = parts.some((part) => !normalizedBuiltIns.includes(normalizeIntroText(part)));
  return hasCustomPart
    ? parts.filter((part) => !normalizedBuiltIns.includes(normalizeIntroText(part)))
    : parts;
}

function normalizeIntroText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function legacyBuiltInIntro(language: string): string {
  const normalized = language.trim().toLowerCase();
  if (normalized.startsWith("pt")) {
    return "Certo, vou explicar rapidamente: este trabalho online ajuda comerciantes a melhorar vendas e ranqueamento de produtos, e a comissão depende das tarefas. Os ganhos seguem as regras da plataforma. Você tem tempo para continuar o cadastro agora?";
  }
  if (normalized.startsWith("es")) {
    return "Claro, le explico brevemente: este trabajo en línea ayuda a comerciantes a mejorar ventas y posicionamiento, y la comisión depende de las tareas. Las ganancias siguen las reglas de la página. ¿Tiene tiempo para continuar con el registro ahora?";
  }
  if (normalized.startsWith("en")) {
    return "Okay, let me briefly explain: this online part-time job helps merchants improve product sales and rankings, and commission is calculated by tasks. Earnings are subject to platform rules. Do you have time to continue registration now?";
  }
  return "";
}

function registrationIntentLine(input: StrictFlowInput, language: string): string {
  const configured = flowScriptLine(input, "registration_intent", language);
  // Some older built-in flows persisted the project introduction under the
  // confirmation node. When project introductions are split, that stale text
  // must not become a third introduction message. Use the localized
  // confirmation bridge until the node is edited or migrated.
  const configuredIntroParts = flowScriptLines(input, "project_intro", language);
  if (configuredIntroParts.length > 1) {
    return strictFlowScriptLine("bridge_registration_intent", language);
  }
  return configured || strictFlowScriptLine("bridge_registration_intent", language);
}

export function buildStrictFlowResponse(
  input: StrictFlowInput,
  language: string,
  nextFlowStep: StrictFlowStep,
  stage: Conversation["stage"],
  content: string,
  needsInviteCode = false,
  handoffReason = ""
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
    handoffReason,
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
