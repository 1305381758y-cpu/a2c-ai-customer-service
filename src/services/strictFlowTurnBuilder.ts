import type { AppConfig } from "../config.js";
import { strictFlowNeedsInviteCode, type StrictContextualIntent, type StrictFlowReply } from "../domain/strictFlow.js";
import { defaultStrictFlowRuntime, type StrictFlowRuntimeEngine } from "../domain/strictFlowRuntime.js";
import type { InternalIntentLabel, MessageAnalysis } from "../domain/analyzer.js";
import type {
  A2CInviteCodeRecord,
  Conversation,
  MerchantCountryRecord,
  MerchantRecord,
  Repositories,
  ScriptFlowRuntime
} from "../repositories.js";

export interface StrictFlowTurnBuildResult {
  needsInviteCode: boolean;
  inviteCode?: A2CInviteCodeRecord;
  strictReply: StrictFlowReply;
}

export function buildStrictFlowTurn(input: {
  repos: Repositories;
  runtimeConfig: AppConfig;
  merchant: MerchantRecord;
  country: MerchantCountryRecord;
  conversation: Conversation;
  analysis: MessageAnalysis;
  customerText: string;
  strictFlowEnabled: boolean;
  scriptFlow?: ScriptFlowRuntime;
  inferredIntent: InternalIntentLabel;
  contextualIntent: StrictContextualIntent;
  strictFlowRuntime?: StrictFlowRuntimeEngine;
  linkLoadFailureCount?: number;
}): StrictFlowTurnBuildResult {
  const needsInviteCode = strictFlowNeedsInviteCode({
    merchant: input.merchant,
    country: input.country,
    conversation: input.conversation,
    analysis: input.analysis,
    customerText: input.customerText,
    strictFlowEnabled: input.strictFlowEnabled,
    inferredIntent: input.inferredIntent
  });
  const inviteCode = needsInviteCode
    ? input.repos.reserveInviteCodeForConversation(input.conversation)
    : undefined;
  const contextualIntent = input.contextualIntent.intent;
  const shouldPrepareTeacherLink =
    input.conversation.flowStep === "collect_telegram" ||
    (input.conversation.flowStep === "telegram_download" && (contextualIntent === "telegram_installed" || contextualIntent === "positive_confirmation")) ||
    (input.conversation.flowStep === "telegram_confirm" && (contextualIntent === "positive_confirmation" || contextualIntent === "acknowledgement"));
  const teacherTelegramLink = shouldPrepareTeacherLink
    ? input.repos.assignTeacherTgLinkForConversation(input.conversation, input.country.tgRegisterGuideUrl || input.runtimeConfig.TG_REGISTER_GUIDE_URL)?.url
    : input.conversation.assignedTeacherTgLinkUrl || "";
  const strictReply = (input.strictFlowRuntime || defaultStrictFlowRuntime).nextTurn({
    merchant: input.merchant,
    country: input.country,
    conversation: input.conversation,
    analysis: input.analysis,
    customerText: input.customerText,
    inviteCode,
    config: input.runtimeConfig,
    teacherTelegramLink,
    inferredIntent: input.inferredIntent,
    contextualIntent: input.contextualIntent,
    strictFlowEnabled: input.strictFlowEnabled,
    scriptFlow: input.scriptFlow,
    linkLoadFailureCount: input.linkLoadFailureCount
  });

  return {
    needsInviteCode,
    inviteCode,
    strictReply
  };
}
