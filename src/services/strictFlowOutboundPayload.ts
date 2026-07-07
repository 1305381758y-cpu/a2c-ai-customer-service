import type { A2CInviteCodeRecord, MerchantAgentProfileRecord, MerchantCountryRecord, ScriptFlowRuntime } from "../repositories.js";
import type { StrictFlowReply } from "../domain/strictFlow.js";
import type { LearnedIntentDebugInfo } from "./aiConversationReply.js";
import type { LanguageGuardResult } from "./replyLanguage.js";

export interface NaturalizedStrictReplyDebug {
  used: boolean;
  error?: string;
}

export interface StrictFlowOutboundPayloadInput {
  strictReply: StrictFlowReply;
  strictFlowEnabled: boolean;
  agentProfile: MerchantAgentProfileRecord;
  learnedIntent: LearnedIntentDebugInfo | null;
  naturalized: NaturalizedStrictReplyDebug;
  languageGuard: LanguageGuardResult;
  country: MerchantCountryRecord;
  scriptFlow?: ScriptFlowRuntime;
  inviteCode?: A2CInviteCodeRecord;
}

export function buildStrictFlowOutboundRawPayload(input: StrictFlowOutboundPayloadInput): Record<string, unknown> {
  const { strictReply, strictFlowEnabled, agentProfile, learnedIntent, naturalized, languageGuard, country, scriptFlow, inviteCode } = input;
  return {
    replyMode: strictReply.fallback ? "fallback" : "strict_flow",
    strictFlow: true,
    strictFlowEnabled,
    strictFlowStep: strictReply.nextFlowStep,
    scriptFlowId: scriptFlow?.flow.id ?? null,
    scriptFlowName: scriptFlow?.flow.name ?? "",
    scriptFlowVersion: scriptFlow?.flow.version ?? null,
    scriptFlowSource: scriptFlow?.flow.sourceFilename ?? "",
    controlledQuestionType: strictReply.controlledQuestionType || "none",
    controlledQuestionFallback: Boolean(strictReply.controlledQuestionFallback),
    strictQuestionType: strictReply.controlledQuestionType || "none",
    agentProfileName: agentProfile.agentName,
    contextualIntent: strictReply.contextualIntent,
    learnedIntent,
    intentSource: strictReply.contextualIntent?.source || "none",
    answeredPreviousQuestion: Boolean(strictReply.contextualIntent?.answeredPreviousQuestion),
    questionType: strictReply.contextualIntent?.questionType || strictReply.controlledQuestionType || "none",
    nextAction: strictReply.contextualIntent?.nextAction || "",
    usedAiNaturalizer: naturalized.used,
    naturalizerError: naturalized.error || "",
    languageGuardTarget: languageGuard.targetLanguage,
    languageGuardStatus: languageGuard.status,
    languageGuardAttempts: languageGuard.attempts,
    languageGuardFallbackUsed: languageGuard.fallbackUsed,
    languageGuardError: languageGuard.error || "",
    knowledgeHit: false,
    aiFallback: Boolean(strictReply.fallback),
    inviteCodeRequired: Boolean(country.requirePlatformAccount),
    inviteCodeMissing: Boolean(strictReply.needsInviteCode && !inviteCode),
    assignedInviteCode: inviteCode ? {
      id: inviteCode.id,
      code: inviteCode.code,
      registerUrl: inviteCode.registerUrl,
      status: inviteCode.status
    } : null
  };
}
