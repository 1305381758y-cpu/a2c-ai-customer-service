import { type StrictFlowInput } from "./strictFlowTypes.js";
import { normalizeFlowStep } from "./strictFlowState.js";
import { isStrictFlowEnabled } from "./strictFlowMarketPolicy.js";
import {
  asksCustomerCorrection,
  asksEarningConcern,
  asksForInviteOrLink,
  asksForRegistrationSteps,
  asksGenericQuestionPermission,
  asksInvestmentConcern,
  asksPaymentConcern,
  asksTelegramExplanation,
  asksTrustConcern,
  cancelsPendingCustomerQuestion,
  isPositive,
  isReadyToStartRegistration,
  looksLikeQuestion
} from "./strictFlowPredicates.js";

export function strictFlowNeedsInviteCode(input: Pick<StrictFlowInput, "merchant" | "country" | "conversation" | "analysis" | "customerText" | "inferredIntent" | "strictFlowEnabled">): boolean {
  if (!(input.strictFlowEnabled ?? isStrictFlowEnabled(input.merchant, input.country)) || !input.country.requirePlatformAccount) return false;
  if (input.conversation.extractedPhone && input.conversation.extractedTelegram) return false;
  if (asksGenericQuestionPermission(input.customerText) || asksCustomerCorrection(input.customerText)) return false;
  if (input.conversation.awaitingCustomerQuestion && !cancelsPendingCustomerQuestion(input.customerText)) return false;
  if (asksTrustConcern(input.customerText) ||
    asksPaymentConcern(input.customerText) ||
    asksInvestmentConcern(input.customerText) ||
    asksEarningConcern(input.customerText) ||
    asksTelegramExplanation(input.customerText)) return false;
  if (looksLikeQuestion(input.customerText) &&
    !asksForRegistrationSteps(input.customerText) &&
    !explicitlyRequestsRegistrationPackage(input.customerText)) return false;
  const step = normalizeFlowStep(input.conversation.flowStep);
  if (step === "send_register_link") return true;
  if (step === "registration_intent") {
    return asksForInviteOrLink(input.customerText, input.analysis.intent) ||
      asksForRegistrationSteps(input.customerText) ||
      isReadyToStartRegistration(input.customerText) ||
      isPositive(input.customerText, input.analysis.intent, input.inferredIntent);
  }
  if (step === "wait_registration") {
    return input.inferredIntent === "ask_link" ||
      asksForInviteOrLink(input.customerText, input.analysis.intent) ||
      asksForRegistrationSteps(input.customerText) ||
      isReadyToStartRegistration(input.customerText);
  }
  return false;
}

function explicitlyRequestsRegistrationPackage(text: string): boolean {
  return /(发|發|给|給|要|需要|send|give|envie|manda|mandar|enviar).{0,12}(注册链接|註冊連結|开户链接|邀請碼|邀请码|registration link|register link|invitation code|invite code|link de cadastro|código de convite|codigo de convite|enlace de registro|código de invitación)/i.test(text);
}
