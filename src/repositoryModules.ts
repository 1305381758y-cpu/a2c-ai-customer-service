import type { Db } from "./db.js";
import { MerchantA2CAccountRepository } from "./repositoryA2CAccounts.js";
import { AiCallRepository } from "./repositoryAiCalls.js";
import { ConversationReviewRepository } from "./repositoryConversationReviews.js";
import { ConversationRepository } from "./repositoryConversations.js";
import { CustomerRepository } from "./repositoryCustomers.js";
import { HandoffRepository } from "./repositoryHandoffs.js";
import { IntentLearningRepository } from "./repositoryIntentLearning.js";
import { MaintenanceRepository } from "./repositoryMaintenance.js";
import { MerchantAgentProfileRepository } from "./repositoryMerchantAgentProfiles.js";
import { MerchantRepository } from "./repositoryMerchants.js";
import { MerchantSettingsRepository } from "./repositoryMerchantSettings.js";
import { ScriptFlowRepository } from "./repositoryScriptFlows.js";
import { TrainingContentRepository } from "./repositoryTrainingContent.js";
import { TeacherTgLinkRepository } from "./repositoryTeacherTgLinks.js";
import { UserRepository } from "./repositoryUsers.js";
import type { ImportedTrainingSample } from "./import/trainingSamples.js";
import type { KnowledgeItemRecord } from "./repositoryTypes.js";

export interface RepositoryModuleCallbacks {
  refreshCustomerAfterConversationDelete(merchantId: string, countryId: string, customerKey: string): void;
  createTrainingSample(merchantId: string, sample: ImportedTrainingSample, countryId?: string): { id: number };
  createKnowledgeItem(merchantId: string, input: Record<string, unknown>): KnowledgeItemRecord;
  defaultCountryId(merchantId: string): string;
  validCountryId(merchantId: string, countryId: string): string;
}

export interface RepositoryModules {
  settings: MerchantSettingsRepository;
  a2cAccounts: MerchantA2CAccountRepository;
  conversations: ConversationRepository;
  customers: CustomerRepository;
  handoffs: HandoffRepository;
  intentLearning: IntentLearningRepository;
  agentProfiles: MerchantAgentProfileRepository;
  maintenance: MaintenanceRepository;
  merchants: MerchantRepository;
  reviews: ConversationReviewRepository;
  scriptFlows: ScriptFlowRepository;
  trainingContent: TrainingContentRepository;
  teacherTgLinks: TeacherTgLinkRepository;
  users: UserRepository;
  aiCalls: AiCallRepository;
}

export function createRepositoryModules(db: Db, callbacks: RepositoryModuleCallbacks): RepositoryModules {
  const settings = new MerchantSettingsRepository(db);
  const a2cAccounts = new MerchantA2CAccountRepository(
    db,
    { defaultCountryId: (merchantId) => settings.defaultCountryId(merchantId) },
    { getMerchantConfig: (merchantId) => settings.getConfig(merchantId) }
  );
  const conversations = new ConversationRepository(db, {
    refreshCustomerAfterConversationDelete: callbacks.refreshCustomerAfterConversationDelete
  });
  const customers = new CustomerRepository(db);
  const handoffs = new HandoffRepository(db);
  const intentLearning = new IntentLearningRepository(db);
  const agentProfiles = new MerchantAgentProfileRepository(db);
  const maintenance = new MaintenanceRepository(db);
  const merchants = new MerchantRepository(db, {
    ensureDefaultCountry: (merchantId) => {
      settings.ensureDefaultCountry(merchantId);
    }
  });
  const reviews = new ConversationReviewRepository(db, {
    createTrainingSample: callbacks.createTrainingSample,
    createKnowledgeItem: callbacks.createKnowledgeItem,
    defaultCountryId: callbacks.defaultCountryId
  });
  const scriptFlows = new ScriptFlowRepository(db, {
    defaultCountryId: callbacks.defaultCountryId,
    validCountryId: callbacks.validCountryId
  });
  const trainingContent = new TrainingContentRepository(db, {
    defaultCountryId: callbacks.defaultCountryId,
    validCountryId: callbacks.validCountryId
  });
  const teacherTgLinks = new TeacherTgLinkRepository(db);
  const users = new UserRepository(db);
  const aiCalls = new AiCallRepository(db);

  return {
    settings,
    a2cAccounts,
    conversations,
    customers,
    handoffs,
    intentLearning,
    agentProfiles,
    maintenance,
    merchants,
    reviews,
    scriptFlows,
    trainingContent,
    teacherTgLinks,
    users,
    aiCalls
  };
}
