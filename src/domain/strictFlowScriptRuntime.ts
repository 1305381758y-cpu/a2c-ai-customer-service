import type { A2CInviteCodeRecord, ScriptFlowStepRecord } from "../repositories.js";
import { strictFlowScriptLine } from "./strictFlowScriptText.js";
import { normalizeFlowStep } from "./strictFlowState.js";
import type { StrictFlowInput, StrictFlowStep } from "./strictFlowTypes.js";

export function flowScriptLine(input: StrictFlowInput, key: string, language: string): string {
  const step = activeScriptStep(input, key);
  if (step?.standardReply) {
    return applyScriptVariables(step.standardReply, input, language, "");
  }
  return strictFlowScriptLine(key, language);
}

export function activeScriptStep(input: StrictFlowInput, key: string): ScriptFlowStepRecord | undefined {
  const steps = input.scriptFlow?.steps ?? [];
  const enabledSteps = steps.filter((step) => step.enabled);
  const normalizedKey = key.toLowerCase();
  const exact = enabledSteps.find((step) => step.flowStep === key || step.flowCode.toLowerCase() === normalizedKey);
  if (exact) return exact;

  if (key === "first_greeting" || key === "interest_screening_retry") {
    return enabledSteps.find((step) => step.flowStep === "interest_screening");
  }

  if (key === "project_intro") {
    return (
      enabledSteps.find((step) => step.flowStep === "registration_intent" && /项目|介紹|介绍|收益|工作|project|intro|income/i.test(`${step.flowName} ${step.goal} ${step.triggerCondition}`)) ??
      enabledSteps.find((step) => /项目|介紹|介绍|收益|工作|project|intro|income/i.test(`${step.flowName} ${step.goal} ${step.triggerCondition}`)) ??
      enabledSteps.find((step) => step.flowCode.toUpperCase() === "B" || step.flowCode.toUpperCase() === "C") ??
      enabledSteps.find((step) => step.flowStep === "registration_intent")
    );
  }

  if (key === "registration_intent") {
    return (
      enabledSteps.find((step) => step.flowStep === "registration_intent" && (step.sendLink || step.sendInvite || step.sendTutorialImage)) ??
      enabledSteps.find((step) => step.flowStep === "registration_intent" && /注册|注册链接|开户链接|邀请码|register|invite/i.test(`${step.flowName} ${step.goal} ${step.standardReply}`))
    );
  }

  if (key === "wait_registration") {
    return enabledSteps.find((step) => step.flowStep === "wait_registration" || step.sendLink || step.sendInvite || step.sendTutorialImage);
  }

  return undefined;
}

export function configuredNextFlowStep(input: StrictFlowInput, currentKey: string, fallback: StrictFlowStep): StrictFlowStep {
  const configured = normalizeFlowStep(activeScriptStep(input, currentKey)?.nextFlowStep || "");
  return configured || fallback;
}

export function applyScriptVariables(content: string, input: StrictFlowInput, language: string, display: string): string {
  const fallbackUrl = input.country.platformRegisterUrl || input.config.PLATFORM_REGISTER_URL || "";
  const registerUrl = input.inviteCode?.registerUrl
    ? input.inviteCode.registerUrl.includes("{code}")
      ? input.inviteCode.registerUrl.replaceAll("{code}", input.inviteCode.code)
      : input.inviteCode.registerUrl
    : fallbackUrl;
  return content
    .replaceAll("{{REGISTER_URL}}", registerUrl)
    .replaceAll("{{INVITE_CODE}}", input.inviteCode?.code || "")
    .replaceAll("{{INVITE_DISPLAY}}", display || inviteDisplayText(input.inviteCode, language, fallbackUrl))
    .replaceAll("{{CUSTOMER_PHONE}}", input.conversation.extractedPhone || input.analysis.phone || "")
    .replaceAll("{{TELEGRAM_USERNAME}}", input.conversation.extractedTelegram || input.analysis.telegram || "");
}

export function inviteDisplayText(inviteCode: A2CInviteCodeRecord | undefined, language: string, fallbackUrl = ""): string {
  if (!inviteCode) return fallbackUrl || "";
  const template = inviteCode.registerUrl || fallbackUrl;
  const url = template ? template.includes("{code}") ? template.replaceAll("{code}", encodeURIComponent(inviteCode.code)) : template : "";
  if (template.includes("{code}")) {
    if (language === "en") return `Exclusive registration link: ${url}\nInvitation code: ${inviteCode.code}`;
    if (language === "pt-BR") return `Link exclusivo de cadastro: ${url}\nCódigo de convite: ${inviteCode.code}`;
    return `专属开户链接：${url}\n邀请码：${inviteCode.code}`;
  }
  if (language === "en") return `Registration link: ${url || "confirming"}\nInvitation code: ${inviteCode.code}`;
  if (language === "pt-BR") return `Link de cadastro: ${url || "confirmando"}\nCódigo de convite: ${inviteCode.code}`;
  return `开户链接：${url || "确认中"}\n邀请码：${inviteCode.code}`;
}
