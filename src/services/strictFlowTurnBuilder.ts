import type { AppConfig } from "../config.js";
import { strictFlowNeedsInviteCode, type StrictContextualIntent, type StrictFlowReply } from "../domain/strictFlow.js";
import { nextStrictFlowTurn } from "../domain/strictFlowRuntime.js";
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
  const strictReply = nextStrictFlowTurn({
    merchant: input.merchant,
    country: input.country,
    conversation: input.conversation,
    analysis: input.analysis,
    customerText: input.customerText,
    inviteCode,
    config: input.runtimeConfig,
    inferredIntent: input.inferredIntent,
    contextualIntent: input.contextualIntent,
    strictFlowEnabled: input.strictFlowEnabled,
    scriptFlow: input.scriptFlow
  });

  return {
    needsInviteCode,
    inviteCode,
    strictReply
  };
}
