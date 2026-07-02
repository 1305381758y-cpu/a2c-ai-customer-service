import type { AiReply } from "../clients/aiReplyTypes.js";
import type { TrainingSampleForSearch } from "../domain/sampleRetrieval.js";
import type { A2CInviteCodeRecord, MerchantAgentProfileRecord, MerchantCountryRecord, TrainingMaterialItemRecord } from "../repositories.js";
import type { LearnedIntentDebugInfo } from "./aiConversationReply.js";

export interface AiConversationOutboundPayloadInput {
  aiReply: AiReply;
  strictFlowEnabled: boolean;
  agentProfile: MerchantAgentProfileRecord;
  learnedIntent: LearnedIntentDebugInfo | null;
  samples: TrainingSampleForSearch[];
  trainingMaterials: TrainingMaterialItemRecord[];
  country: MerchantCountryRecord;
  inviteCode?: A2CInviteCodeRecord;
}

export function buildAiConversationOutboundRawPayload(input: AiConversationOutboundPayloadInput): Record<string, unknown> {
  const { aiReply, strictFlowEnabled, agentProfile, learnedIntent, samples, trainingMaterials, country, inviteCode } = input;
  return {
    replyMode: aiReply.fallback ? "fallback" : "ai",
    strictFlowEnabled,
    agentProfileName: agentProfile.agentName,
    learnedIntent,
    samples: samples.map((sample) => sample.id),
    trainingMaterials: trainingMaterials.map((item) => item.id),
    aiFallback: Boolean(aiReply.fallback),
    aiError: aiReply.error || "",
    inviteCodeRequired: Boolean(country.requirePlatformAccount),
    inviteCodeMissing: Boolean(country.requirePlatformAccount && !inviteCode),
    assignedInviteCode: inviteCode ? {
      id: inviteCode.id,
      code: inviteCode.code,
      registerUrl: inviteCode.registerUrl,
      status: inviteCode.status
    } : null
  };
}
