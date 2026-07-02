import type { A2CInviteCodeRecord, Conversation, CustomerMemoryRecord, KnowledgeItemRecord, MerchantAgentProfileRecord, MerchantCountryRecord, TrainingMaterialItemRecord } from "../repositories.js";
import type { TrainingSampleForSearch } from "../domain/sampleRetrieval.js";

export interface ReplyInput {
  customerText: string;
  conversation: Conversation;
  history: Array<{ direction: string; content: string; intent: string; createdAt: string }>;
  samples: TrainingSampleForSearch[];
  knowledge: KnowledgeItemRecord[];
  trainingMaterials?: TrainingMaterialItemRecord[];
  memory?: CustomerMemoryRecord;
  country?: MerchantCountryRecord;
  inviteCode?: A2CInviteCodeRecord;
  agentProfile?: MerchantAgentProfileRecord;
}

export interface AiReply {
  reply: string;
  language: string;
  stage: string;
  extractedPhone: string;
  extractedTelegram: string;
  extractedWhatsApp: string;
  shouldHandoff: boolean;
  fallback?: boolean;
  error?: string;
}
