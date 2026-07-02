import type { ReplyInput } from "../clients/aiReplyTypes.js";
import type { MessageAnalysis } from "../domain/analyzer.js";
import { shouldUseInviteForReply } from "../domain/registrationPolicy.js";
import { rankSamples, type TrainingSampleForSearch } from "../domain/sampleRetrieval.js";
import type {
  A2CInviteCodeRecord,
  Conversation,
  CustomerMemoryRecord,
  KnowledgeItemRecord,
  MerchantAgentProfileRecord,
  MerchantCountryRecord,
  Repositories,
  TrainingMaterialItemRecord
} from "../repositories.js";

export interface AiConversationReplyContext {
  shouldIncludeRegistrationDetails: boolean;
  inviteCode?: A2CInviteCodeRecord;
  samples: TrainingSampleForSearch[];
  knowledge: KnowledgeItemRecord[];
  trainingMaterials: TrainingMaterialItemRecord[];
  history: Array<{ direction: string; content: string; intent: string; createdAt: string }>;
  replyInput: ReplyInput;
}

export function buildAiConversationReplyContext(input: {
  repos: Repositories;
  conversation: Conversation;
  country: MerchantCountryRecord;
  analysis: MessageAnalysis;
  customerText: string;
  inboundMemory: CustomerMemoryRecord;
  agentProfile: MerchantAgentProfileRecord;
}): AiConversationReplyContext {
  const enabledSamples = input.repos.listTrainingSamples({
    merchantId: input.conversation.merchantId,
    countryId: input.country.id,
    enabled: true
  });
  const knowledge = input.repos.listKnowledgeItems({
    merchantId: input.conversation.merchantId,
    countryId: input.country.id,
    enabled: true
  });
  const trainingMaterials = input.repos.listTrainingMaterialSnippets(input.conversation.merchantId, 20, input.country.id);
  const shouldIncludeRegistrationDetails = shouldUseInviteForReply(input.country, input.conversation, input.analysis.intent, input.customerText);
  const inviteCode = shouldIncludeRegistrationDetails
    ? input.repos.reserveInviteCodeForConversation(input.conversation)
    : undefined;
  const samples = rankSamples(enabledSamples, {
    text: input.customerText,
    language: input.analysis.language,
    intent: input.analysis.intent,
    stage: input.analysis.stage
  });
  const history = input.repos.listConversationMessages(input.conversation.id, 20);

  return {
    shouldIncludeRegistrationDetails,
    inviteCode,
    samples,
    knowledge,
    trainingMaterials,
    history,
    replyInput: {
      customerText: input.customerText,
      conversation: input.conversation,
      history,
      samples,
      knowledge,
      trainingMaterials,
      memory: input.inboundMemory,
      country: input.country,
      inviteCode,
      agentProfile: input.agentProfile
    }
  };
}
