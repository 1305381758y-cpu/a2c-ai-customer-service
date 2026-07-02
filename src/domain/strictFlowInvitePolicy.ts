import { type StrictFlowInput } from "./strictFlowTypes.js";
import { normalizeFlowStep } from "./strictFlowState.js";
import { isStrictFlowEnabled } from "./strictFlowMarketPolicy.js";
import {
  asksForInviteOrLink,
  asksForRegistrationSteps,
  isPositive,
  isReadyToStartRegistration
} from "./strictFlowPredicates.js";

export function strictFlowNeedsInviteCode(input: Pick<StrictFlowInput, "merchant" | "country" | "conversation" | "analysis" | "customerText" | "inferredIntent" | "strictFlowEnabled">): boolean {
  if (!(input.strictFlowEnabled ?? isStrictFlowEnabled(input.merchant, input.country)) || !input.country.requirePlatformAccount) return false;
  if (input.conversation.extractedPhone && input.conversation.extractedTelegram) return false;
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
