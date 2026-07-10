import type { A2CInviteCodeRecord, ScriptFlowRuntime, ScriptFlowStepRecord } from "../repositories.js";
import { strictFlowScriptLine } from "./strictFlowScriptText.js";
import { normalizeFlowStep } from "./strictFlowState.js";
import type { StrictFlowInput, StrictFlowStep } from "./strictFlowTypes.js";

const BUSINESS_SCRIPT_KEYS = new Set([
  "first_greeting",
  "interest_screening",
  "interest_screening_retry",
  "project_intro",
  "registration_intent",
  "send_register_link",
  "wait_registration",
  "ask_registered_phone",
  "telegram_confirm",
  "telegram_download",
  "collect_telegram",
  "human_handoff",
  "ended"
]);

export function flowScriptLine(input: StrictFlowInput, key: string, language: string): string {
  const step = activeScriptStep(input, key);
  if (step?.standardReply) {
    return applyScriptVariables(step.standardReply, input, language, "");
  }
  // A complete active merchant flow owns its business wording. Returning a
  // built-in business line here makes a copied flow look enabled while still
  // executing the system template. Helper lines (error/help acknowledgements)
  // may still use the shared safety wording below.
  if (input.scriptFlow?.flow.active && isCompleteMerchantFlow(input.scriptFlow) && BUSINESS_SCRIPT_KEYS.has(key)) {
    return "";
  }
  return strictFlowScriptLine(key, language);
}

export function activeScriptStep(input: StrictFlowInput, key: string): ScriptFlowStepRecord | undefined {
  const steps = input.scriptFlow?.steps ?? [];
  const enabledSteps = steps.filter((step) => step.enabled);
  const normalizedKey = key.toLowerCase();
  const exact = enabledSteps.find((step) => step.flowStep === key || step.flowCode.toLowerCase() === normalizedKey);
  if (exact) return exact;

  const alias = canonicalScriptKey(key);
  if (alias) {
    const canonical = enabledSteps.find((step) => step.flowStep === alias);
    if (canonical) return canonical;
  }

  if (key === "first_greeting" || key === "interest_screening_retry") {
    return enabledSteps.find((step) => step.flowStep === "interest_screening");
  }

  if (key === "project_intro") {
    return (
      findScriptStepByName(enabledSteps, /^(项目介绍|工作介绍|項目介紹)$/i) ??
      enabledSteps.find((step) => step.flowCode.toUpperCase() === "3" || step.flowCode.toUpperCase() === "C") ??
      enabledSteps.find((step) => step.flowStep !== "registration_intent" && /项目|項目|介紹|介绍|收益|工作|project|intro|income/i.test(`${step.flowName} ${step.goal} ${step.triggerCondition}`)) ??
      enabledSteps.find((step) => step.flowStep === "registration_intent" && /项目|項目|介紹|介绍|收益|工作|project|intro|income/i.test(`${step.flowName} ${step.goal} ${step.triggerCondition}`)) ??
      enabledSteps.find((step) => step.flowStep === "registration_intent")
    );
  }

  if (key === "registration_intent") {
    return (
      findScriptStepByName(enabledSteps, /^(确认意向|确认注册意向|注册意向|确认有空|确认开户注册)$/i) ??
      enabledSteps.find((step) => step.flowCode.toUpperCase() === "4" || step.flowCode.toUpperCase() === "D") ??
      enabledSteps.find((step) => step.flowStep === "registration_intent" && (step.sendLink || step.sendInvite || step.sendTutorialImage)) ??
      enabledSteps.find((step) => step.flowStep === "registration_intent" && /注册|注册链接|开户链接|邀请码|register|invite/i.test(`${step.flowName} ${step.goal} ${step.standardReply}`))
    );
  }

  if (key === "wait_registration") {
    return enabledSteps.find((step) => step.flowStep === "wait_registration" || step.sendLink || step.sendInvite || step.sendTutorialImage);
  }

  return undefined;
}

export function isCompleteMerchantFlow(scriptFlow?: ScriptFlowRuntime): boolean {
  if (!scriptFlow?.flow.active) return false;
  const enabled = new Set(scriptFlow.steps.filter((step) => step.enabled).map((step) => step.flowStep));
  return [
    "first_greeting",
    "interest_screening",
    "project_intro",
    "registration_intent",
    "send_register_link",
    "wait_registration",
    "telegram_confirm",
    "telegram_download",
    "collect_telegram",
    "human_handoff",
    "ended"
  ].every((step) => enabled.has(step));
}

function canonicalScriptKey(key: string): string {
  if (key === "interest_screening_retry") return "interest_screening";
  if (key === "ask_registered_phone") return "wait_registration";
  return BUSINESS_SCRIPT_KEYS.has(key) ? key : "";
}

function findScriptStepByName(steps: ScriptFlowStepRecord[], pattern: RegExp): ScriptFlowStepRecord | undefined {
  return steps.find((step) => pattern.test(step.flowName.trim()));
}

export function configuredNextFlowStep(input: StrictFlowInput, currentKey: string, fallback: StrictFlowStep): StrictFlowStep {
  const configured = normalizeFlowStep(activeScriptStep(input, currentKey)?.nextFlowStep || "");
  return configured || fallback;
}

export function applyScriptVariables(content: string, input: StrictFlowInput, language: string, display: string): string {
  const fallbackUrl = input.country.platformRegisterUrl || input.config.PLATFORM_REGISTER_URL || "";
  const telegramLink = input.teacherTelegramLink || input.country.tgRegisterGuideUrl || input.config.TG_REGISTER_GUIDE_URL || "";
  const registerUrl = input.inviteCode?.registerUrl
    ? input.inviteCode.registerUrl.includes("{code}")
      ? input.inviteCode.registerUrl.replaceAll("{code}", input.inviteCode.code)
      : input.inviteCode.registerUrl
    : fallbackUrl;
  return content
    .replaceAll("{{REGISTER_URL}}", registerUrl)
    .replaceAll("{{INVITE_CODE}}", input.inviteCode?.code || "")
    .replaceAll("{{INVITE_DISPLAY}}", display || inviteDisplayText(input.inviteCode, language, fallbackUrl))
    .replaceAll("{{TG_LINK}}", telegramLink)
    .replaceAll("{{TELEGRAM_LINK}}", telegramLink)
    .replaceAll("{{CUSTOMER_PHONE}}", input.conversation.extractedPhone || input.analysis.phone || "")
    .replaceAll("{{TELEGRAM_USERNAME}}", input.conversation.extractedTelegram || input.analysis.telegram || "");
}

export function inviteDisplayText(inviteCode: A2CInviteCodeRecord | undefined, language: string, fallbackUrl = ""): string {
  if (!inviteCode) return fallbackUrl || "";
  const template = inviteCode.registerUrl || fallbackUrl;
  const url = template ? template.includes("{code}") ? template.replaceAll("{code}", encodeURIComponent(inviteCode.code)) : template : "";
  if (template.includes("{code}")) {
    if (language === "es") return `Enlace exclusivo de registro: ${url}\nCódigo de invitación: ${inviteCode.code}`;
    if (language === "en") return `Exclusive registration link: ${url}\nInvitation code: ${inviteCode.code}`;
    if (language === "pt-BR") return `Link exclusivo de cadastro: ${url}\nCódigo de convite: ${inviteCode.code}`;
    return `专属开户链接：${url}\n邀请码：${inviteCode.code}`;
  }
  if (language === "es") return `Enlace de registro: ${url || "confirmando"}\nCódigo de invitación: ${inviteCode.code}`;
  if (language === "en") return `Registration link: ${url || "confirming"}\nInvitation code: ${inviteCode.code}`;
  if (language === "pt-BR") return `Link de cadastro: ${url || "confirmando"}\nCódigo de convite: ${inviteCode.code}`;
  return `开户链接：${url || "确认中"}\n邀请码：${inviteCode.code}`;
}
