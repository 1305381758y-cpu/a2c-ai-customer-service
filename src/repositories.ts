import { randomUUID } from "node:crypto";
import type { Db } from "./db.js";
import type { A2CAccount, A2CTokenStore } from "./clients/a2c.js";
import type { TrainingSampleForSearch } from "./domain/sampleRetrieval.js";
import type { ImportedTrainingSample } from "./import/trainingSamples.js";
import type { UserRole } from "./auth.js";
import { MerchantA2CAccountRepository } from "./repositoryA2CAccounts.js";
import { ConversationReviewRepository } from "./repositoryConversationReviews.js";
import { ConversationRepository } from "./repositoryConversations.js";
import { CustomerRepository } from "./repositoryCustomers.js";
import { HandoffRepository } from "./repositoryHandoffs.js";
import { IntentLearningRepository } from "./repositoryIntentLearning.js";
import { MerchantSettingsRepository } from "./repositoryMerchantSettings.js";
import { ScriptFlowRepository } from "./repositoryScriptFlows.js";
import { TrainingContentRepository } from "./repositoryTrainingContent.js";
import { UserRepository } from "./repositoryUsers.js";
import {
  booleanPatchValue,
  mapMerchant,
  mapMerchantAgentProfile,
} from "./repositoryMappers.js";

import type {
  Conversation,
  MerchantRecord,
  MerchantConfigRecord,
  FollowUpCandidate,
  MerchantA2CAccountRecord,
  A2CInviteCodeRecord,
  MerchantCountryRecord,
  UserRecord,
  KnowledgeItemRecord,
  CustomerMemoryRecord,
  CustomerRecord,
  TrainingMaterialRecord,
  TrainingMaterialItemRecord,
  ScriptFlowRecord,
  ScriptFlowStepRecord,
  ScriptFlowVersionRecord,
  ScriptFlowRuntime,
  MerchantAgentProfileRecord,
  ConversationReviewRecord,
  ConversationReviewItemRecord,
  ConversationReviewInput,
  MessageInput,
  UnreadSummaryRecord,
  ConversationMessageRecord,
  ConversationExportRecord,
  IntentLearningEventRecord,
  IntentLearningInput
} from "./repositoryTypes.js";
export type {
  Conversation,
  MerchantRecord,
  MerchantConfigRecord,
  FollowUpCandidate,
  MerchantA2CAccountRecord,
  A2CInviteCodeRecord,
  MerchantCountryRecord,
  UserRecord,
  KnowledgeItemRecord,
  CustomerMemoryRecord,
  CustomerRecord,
  TrainingMaterialRecord,
  TrainingMaterialItemRecord,
  ScriptFlowRecord,
  ScriptFlowStepRecord,
  ScriptFlowVersionRecord,
  ScriptFlowRuntime,
  MerchantAgentProfileRecord,
  ConversationReviewRecord,
  ConversationReviewItemRecord,
  ConversationReviewInput,
  MessageInput,
  UnreadSummaryRecord,
  ConversationMessageRecord,
  ConversationExportRecord,
  IntentLearningEventRecord,
  IntentLearningInput
} from "./repositoryTypes.js";

export class Repositories {
  private readonly settings: MerchantSettingsRepository;
  private readonly a2cAccounts: MerchantA2CAccountRepository;
  private readonly conversations: ConversationRepository;
  private readonly customers: CustomerRepository;
  private readonly handoffs: HandoffRepository;
  private readonly intentLearning: IntentLearningRepository;
  private readonly reviews: ConversationReviewRepository;
  private readonly scriptFlows: ScriptFlowRepository;
  private readonly trainingContent: TrainingContentRepository;
  private readonly users: UserRepository;

  constructor(private readonly db: Db) {
    this.settings = new MerchantSettingsRepository(db);
    this.a2cAccounts = new MerchantA2CAccountRepository(
      db,
      { defaultCountryId: (merchantId) => this.settings.defaultCountryId(merchantId) },
      { getMerchantConfig: (merchantId) => this.settings.getConfig(merchantId) }
    );
    this.conversations = new ConversationRepository(db, {
      refreshCustomerAfterConversationDelete: (merchantId, countryId, customerKey) => this.refreshCustomerAfterConversationDelete(merchantId, countryId, customerKey)
    });
    this.customers = new CustomerRepository(db);
    this.handoffs = new HandoffRepository(db);
    this.intentLearning = new IntentLearningRepository(db);
    this.reviews = new ConversationReviewRepository(db, {
      createTrainingSample: (merchantId, sample, countryId) => this.createTrainingSample(merchantId, sample, countryId),
      createKnowledgeItem: (merchantId, input) => this.createKnowledgeItem(merchantId, input),
      defaultCountryId: (merchantId) => this.defaultCountryId(merchantId)
    });
    this.scriptFlows = new ScriptFlowRepository(db, {
      defaultCountryId: (merchantId) => this.defaultCountryId(merchantId),
      validCountryId: (merchantId, countryId) => this.validCountryId(merchantId, countryId)
    });
    this.trainingContent = new TrainingContentRepository(db, {
      defaultCountryId: (merchantId) => this.defaultCountryId(merchantId),
      validCountryId: (merchantId, countryId) => this.validCountryId(merchantId, countryId)
    });
    this.users = new UserRepository(db);
  }

  insertTrainingSamples(samples: ImportedTrainingSample[], merchantId = "default", countryId = this.defaultCountryId(merchantId)): number {
    return this.trainingContent.insertTrainingSamples(samples, merchantId, countryId);
  }

  deleteAllTrainingSamples(): { samplesDeleted: number; materialItemsDeleted: number } {
    return this.trainingContent.deleteAllTrainingSamples();
  }

  clearLearningAndCustomerData(): {
    customerMemoriesDeleted: number;
    trainingMaterialItemsDeleted: number;
    trainingMaterialsDeleted: number;
    trainingSamplesDeleted: number;
    knowledgeItemsDeleted: number;
    intentLearningEventsDeleted: number;
    scriptFlowsDeleted: number;
    messagesDeleted: number;
    handoffEventsDeleted: number;
    conversationsDeleted: number;
    customersDeleted: number;
    inviteCodesReset: number;
  } {
    this.db.sqlite.exec("BEGIN");
    try {
      const customerMemories = this.db.sqlite.prepare("DELETE FROM customer_memories").run();
      const trainingMaterialItems = this.db.sqlite.prepare("DELETE FROM training_material_items").run();
      const trainingMaterials = this.db.sqlite.prepare("DELETE FROM training_materials").run();
      const trainingSamples = this.db.sqlite.prepare("DELETE FROM training_samples").run();
      const knowledgeItems = this.db.sqlite.prepare("DELETE FROM knowledge_items").run();
      const intentLearningEvents = this.db.sqlite.prepare("DELETE FROM intent_learning_events").run();
      this.db.sqlite.prepare("DELETE FROM conversation_review_items").run();
      this.db.sqlite.prepare("DELETE FROM conversation_reviews").run();
      this.db.sqlite.prepare("DELETE FROM conversation_followups").run();
      this.db.sqlite.prepare("DELETE FROM conversation_script_state").run();
      this.db.sqlite.prepare("DELETE FROM script_flow_versions").run();
      this.db.sqlite.prepare("DELETE FROM script_flow_steps").run();
      const scriptFlows = this.db.sqlite.prepare("DELETE FROM script_flows").run();
      const messages = this.db.sqlite.prepare("DELETE FROM messages").run();
      const handoffEvents = this.db.sqlite.prepare("DELETE FROM handoff_events").run();
      const conversations = this.db.sqlite.prepare("DELETE FROM conversations").run();
      const customers = this.db.sqlite.prepare("DELETE FROM customers").run();
      const inviteCodes = this.db.sqlite
        .prepare(`
          UPDATE a2c_invite_codes
          SET status = 'available',
              assigned_customer_key = '',
              assigned_conversation_id = '',
              platform_account = '',
              assigned_at = '',
              used_at = '',
              updated_at = CURRENT_TIMESTAMP
        `)
        .run();
      this.db.sqlite.exec("COMMIT");
      return {
        customerMemoriesDeleted: Number(customerMemories.changes ?? 0),
        trainingMaterialItemsDeleted: Number(trainingMaterialItems.changes ?? 0),
        trainingMaterialsDeleted: Number(trainingMaterials.changes ?? 0),
        trainingSamplesDeleted: Number(trainingSamples.changes ?? 0),
        knowledgeItemsDeleted: Number(knowledgeItems.changes ?? 0),
        intentLearningEventsDeleted: Number(intentLearningEvents.changes ?? 0),
        scriptFlowsDeleted: Number(scriptFlows.changes ?? 0),
        messagesDeleted: Number(messages.changes ?? 0),
        handoffEventsDeleted: Number(handoffEvents.changes ?? 0),
        conversationsDeleted: Number(conversations.changes ?? 0),
        customersDeleted: Number(customers.changes ?? 0),
        inviteCodesReset: Number(inviteCodes.changes ?? 0)
      };
    } catch (error) {
      this.db.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  createTrainingSample(merchantId: string, sample: ImportedTrainingSample, countryId = this.defaultCountryId(merchantId)): { id: number } {
    return this.trainingContent.createTrainingSample(merchantId, sample, countryId);
  }

  ensureBootstrapAdmin(input: { email: string; passwordHash: string }): void {
    this.users.ensureBootstrapAdmin(input);
  }

  getOrCreateConversation(customerPhone: string, a2cAccountPhone: string, nickname = "", merchantId = "default", countryId = this.countryIdForA2CAccount(merchantId, a2cAccountPhone)): Conversation {
    return this.conversations.getOrCreate(customerPhone, a2cAccountPhone, nickname, merchantId, countryId);
  }

  getConversation(id: string): Conversation | undefined {
    return this.conversations.get(id);
  }

  updateConversation(conversation: Conversation): void {
    this.conversations.update(conversation);
  }

  upsertCustomerFromConversation(conversation: Conversation): CustomerRecord {
    return this.customers.upsertFromConversation(conversation);
  }

  getCustomer(merchantId: string, customerKey: string): CustomerRecord | undefined {
    return this.customers.get(merchantId, customerKey);
  }

  listCustomers(filters: { merchantId?: string; countryId?: string; status?: string; language?: string; limit?: number } = {}): CustomerRecord[] {
    return this.customers.list(filters);
  }

  deleteCustomer(merchantId: string, customerKey: string): { deleted: boolean; conversationsDeleted: number; messagesDeleted: number } {
    return this.customers.delete(merchantId, customerKey);
  }

  insertMessage(input: MessageInput): { inserted: boolean; id?: number } {
    return this.conversations.insertMessage(input);
  }

  recordIntentLearningEvent(input: IntentLearningInput): IntentLearningEventRecord {
    return this.intentLearning.record(input);
  }

  getIntentLearningEvent(id: number, merchantId?: string): IntentLearningEventRecord | undefined {
    return this.intentLearning.get(id, merchantId);
  }

  listIntentLearningEvents(filters: { merchantId?: string; countryId?: string; status?: string; suggestedIntent?: string; limit?: number } = {}): IntentLearningEventRecord[] {
    return this.intentLearning.list(filters);
  }

  listPromotedIntentLearningEvents(filters: { merchantId: string; countryId: string; limit?: number }): IntentLearningEventRecord[] {
    return this.intentLearning.listPromoted(filters);
  }

  patchIntentLearningEvent(id: number, patch: Record<string, unknown>, merchantId?: string): IntentLearningEventRecord | undefined {
    return this.intentLearning.patch(id, patch, merchantId);
  }

  markConversationRead(conversationId: string, merchantId: string): Conversation | undefined {
    return this.conversations.markRead(conversationId, merchantId);
  }

  markConversationsRead(merchantId: string, filters: { a2cAccountPhone?: string } = {}): { updated: number } {
    return this.conversations.markAllRead(merchantId, filters);
  }

  pinConversation(conversationId: string, merchantId: string, pinned: boolean): Conversation | undefined {
    return this.conversations.pin(conversationId, merchantId, pinned);
  }

  unreadSummary(merchantId: string): UnreadSummaryRecord[] {
    return this.conversations.unreadSummary(merchantId);
  }

  listConversationMessages(conversationId: string, limit = 20): ConversationMessageRecord[] {
    return this.conversations.listMessages(conversationId, limit);
  }

  exportConversationMessages(filters: {
    merchantId?: string;
    countryId?: string;
    status?: string;
    handoffStatus?: string;
    language?: string;
    a2cAccountPhone?: string;
    customerPhone?: string;
    direction?: string;
    startAt?: string;
    endAt?: string;
    limit?: number;
  } = {}): ConversationExportRecord[] {
    return this.conversations.exportMessages(filters);
  }

  getCustomerMemoryByConversation(conversationId: string): CustomerMemoryRecord | undefined {
    return this.conversations.getCustomerMemoryByConversation(conversationId);
  }

  getCustomerMemory(merchantId: string, countryId: string, customerKey: string): CustomerMemoryRecord | undefined {
    return this.conversations.getCustomerMemory(merchantId, countryId, customerKey);
  }

  updateCustomerMemoryFromMessage(conversation: Conversation, input: { intent: string; content: string; direction: "inbound" | "outbound" }): CustomerMemoryRecord {
    return this.conversations.updateCustomerMemoryFromMessage(conversation, input);
  }

  patchCustomerMemory(conversationId: string, merchantId: string | undefined, patch: Record<string, unknown>): CustomerMemoryRecord | undefined {
    return this.conversations.patchCustomerMemory(conversationId, merchantId, patch);
  }

  listConversations(filters: { merchantId?: string; countryId?: string; status?: string; language?: string; handoffStatus?: string; a2cAccountPhone?: string; customerPhone?: string; limit?: number } = {}): Conversation[] {
    return this.conversations.list(filters);
  }

  deleteConversation(id: string, merchantId?: string): boolean {
    return this.conversations.delete(id, merchantId);
  }

  refreshCustomerAfterConversationDelete(merchantId: string, countryId: string, customerKey: string): void {
    this.customers.refreshAfterConversationDelete(merchantId, countryId, customerKey);
  }

  listTrainingSamples(filters: { merchantId?: string; countryId?: string; language?: string; intent?: string; stage?: string; enabled?: boolean } = {}): TrainingSampleForSearch[] {
    return this.trainingContent.listTrainingSamples(filters);
  }

  patchTrainingSample(id: number, patch: Record<string, unknown>, merchantId?: string): Record<string, unknown> | undefined {
    return this.trainingContent.patchTrainingSample(id, patch, merchantId);
  }

  deleteTrainingSample(id: number, merchantId?: string): boolean {
    return this.trainingContent.deleteTrainingSample(id, merchantId);
  }

  listKnowledgeItems(filters: { merchantId?: string; countryId?: string; type?: string; enabled?: boolean } = {}): KnowledgeItemRecord[] {
    return this.trainingContent.listKnowledgeItems(filters);
  }

  createKnowledgeItem(merchantId: string, input: Record<string, unknown>): KnowledgeItemRecord {
    return this.trainingContent.createKnowledgeItem(merchantId, input);
  }

  patchKnowledgeItem(id: number, patch: Record<string, unknown>, merchantId?: string): KnowledgeItemRecord | undefined {
    return this.trainingContent.patchKnowledgeItem(id, patch, merchantId);
  }

  deleteKnowledgeItem(id: number, merchantId?: string): boolean {
    return this.trainingContent.deleteKnowledgeItem(id, merchantId);
  }

  createTrainingMaterial(input: {
    merchantId: string;
    countryId?: string;
    sourceType: string;
    filename: string;
    mimeType: string;
    rawText: string;
    warnings: string[];
  }): TrainingMaterialRecord {
    return this.trainingContent.createTrainingMaterial(input);
  }

  addTrainingMaterialItem(input: {
    materialId: number;
    merchantId: string;
    countryId?: string;
    kind: "sample" | "knowledge";
    sampleId?: number;
    knowledgeId?: number;
    title: string;
    content: string;
    intent?: string;
    stage?: string;
    language?: string;
    enabled?: boolean;
  }): TrainingMaterialItemRecord {
    return this.trainingContent.addTrainingMaterialItem(input);
  }

  finalizeTrainingMaterial(id: number, merchantId: string, counts: { itemCount: number; sampleCount: number; knowledgeCount: number; warnings?: string[] }): TrainingMaterialRecord {
    return this.trainingContent.finalizeTrainingMaterial(id, merchantId, counts);
  }

  deleteTrainingMaterial(id: number, merchantId?: string): boolean {
    return this.trainingContent.deleteTrainingMaterial(id, merchantId);
  }

  listTrainingMaterials(filters: { merchantId?: string; countryId?: string; sourceType?: string; status?: string; limit?: number } = {}): TrainingMaterialRecord[] {
    return this.trainingContent.listTrainingMaterials(filters);
  }

  getTrainingMaterial(id: number, merchantId?: string): TrainingMaterialRecord | undefined {
    return this.trainingContent.getTrainingMaterial(id, merchantId);
  }

  listTrainingMaterialItems(materialId: number, merchantId?: string): TrainingMaterialItemRecord[] {
    return this.trainingContent.listTrainingMaterialItems(materialId, merchantId);
  }

  listTrainingMaterialSnippets(merchantId: string, limit = 12, countryId?: string): TrainingMaterialItemRecord[] {
    return this.trainingContent.listTrainingMaterialSnippets(merchantId, limit, countryId);
  }

  listScriptFlows(filters: { merchantId?: string; countryId?: string; status?: string } = {}): ScriptFlowRecord[] {
    return this.scriptFlows.list(filters);
  }

  getScriptFlow(id: number, merchantId?: string): ScriptFlowRuntime | undefined {
    return this.scriptFlows.get(id, merchantId);
  }

  getActiveScriptFlow(merchantId: string, countryId?: string): ScriptFlowRuntime | undefined {
    return this.scriptFlows.getActive(merchantId, countryId);
  }

  createScriptFlow(merchantId: string, input: {
    name: string;
    countryId?: string;
    sourceFilename?: string;
    steps?: Array<Record<string, unknown>>;
    createdBy?: string;
  }): ScriptFlowRuntime {
    return this.scriptFlows.create(merchantId, input);
  }

  listScriptFlowSteps(flowId: number, merchantId?: string): ScriptFlowStepRecord[] {
    return this.scriptFlows.listSteps(flowId, merchantId);
  }

  patchScriptFlow(id: number, merchantId: string | undefined, patch: Record<string, unknown>, userName = ""): ScriptFlowRuntime | undefined {
    return this.scriptFlows.patch(id, merchantId, patch, userName);
  }

  enableScriptFlow(id: number, merchantId?: string, userName = ""): ScriptFlowRuntime | undefined {
    return this.scriptFlows.enable(id, merchantId, userName);
  }

  deleteScriptFlow(id: number, merchantId?: string): boolean {
    return this.scriptFlows.delete(id, merchantId);
  }

  createScriptFlowStep(flowId: number, merchantId: string | undefined, input: Record<string, unknown>, userName = ""): ScriptFlowStepRecord | undefined {
    return this.scriptFlows.createStep(flowId, merchantId, input, userName);
  }

  patchScriptFlowStep(id: number, merchantId: string | undefined, patch: Record<string, unknown>, userName = ""): ScriptFlowStepRecord | undefined {
    return this.scriptFlows.patchStep(id, merchantId, patch, userName);
  }

  deleteScriptFlowStep(id: number, merchantId?: string, userName = ""): boolean {
    return this.scriptFlows.deleteStep(id, merchantId, userName);
  }

  duplicateScriptFlowStep(id: number, merchantId?: string, userName = ""): ScriptFlowStepRecord | undefined {
    return this.scriptFlows.duplicateStep(id, merchantId, userName);
  }

  listScriptFlowVersions(flowId: number, merchantId?: string): ScriptFlowVersionRecord[] {
    return this.scriptFlows.listVersions(flowId, merchantId);
  }

  restoreScriptFlowVersion(flowId: number, versionId: number, merchantId?: string, userName = ""): ScriptFlowRuntime | undefined {
    return this.scriptFlows.restoreVersion(flowId, versionId, merchantId, userName);
  }

  insertHandoffEvent(conversationId: string, telegramMessage: string, sent: boolean, error = ""): void {
    this.handoffs.insertEvent(conversationId, telegramMessage, sent, error);
  }

  getMerchantAgentProfile(merchantId: string): MerchantAgentProfileRecord {
    this.db.sqlite.prepare("INSERT OR IGNORE INTO merchant_agent_profiles (merchant_id) VALUES (?)").run(merchantId);
    const row = this.db.sqlite.prepare("SELECT * FROM merchant_agent_profiles WHERE merchant_id = ?").get(merchantId) as Record<string, unknown>;
    return mapMerchantAgentProfile(row);
  }

  patchMerchantAgentProfile(merchantId: string, patch: Record<string, unknown>): MerchantAgentProfileRecord {
    this.db.sqlite.prepare("INSERT OR IGNORE INTO merchant_agent_profiles (merchant_id) VALUES (?)").run(merchantId);
    const allowed: Record<string, string> = {
      agentName: "agent_name",
      roleDefinition: "role_definition",
      toneStyle: "tone_style",
      coreGoal: "core_goal",
      mustFollow: "must_follow",
      forbidden: "forbidden",
      uncertaintyPolicy: "uncertainty_policy",
      handoffPolicy: "handoff_policy",
      enabled: "enabled"
    };
    const entries = Object.entries(patch).filter(([key]) => key in allowed);
    if (entries.length) {
      const assignments = entries.map(([key]) => `${allowed[key]} = ?`).join(", ");
      const values = entries.map(([key, value]) => key === "enabled" ? booleanPatchValue(value, true) : String(value ?? ""));
      this.db.sqlite
        .prepare(`UPDATE merchant_agent_profiles SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?`)
        .run(...values, merchantId);
    }
    return this.getMerchantAgentProfile(merchantId);
  }

  getConversationReview(conversationId: string, merchantId?: string): { review: ConversationReviewRecord; items: ConversationReviewItemRecord[] } | undefined {
    return this.reviews.get(conversationId, merchantId);
  }

  upsertConversationReview(conversationId: string, merchantId: string, input: ConversationReviewInput): { review: ConversationReviewRecord; items: ConversationReviewItemRecord[] } {
    return this.reviews.upsert(conversationId, merchantId, input);
  }

  listConversationReviewItems(reviewId: number, merchantId?: string): ConversationReviewItemRecord[] {
    return this.reviews.listItems(reviewId, merchantId);
  }

  applyConversationReviewItem(itemId: number, merchantId: string): ConversationReviewItemRecord | undefined {
    return this.reviews.applyItem(itemId, merchantId);
  }

  listMerchants(): MerchantRecord[] {
    return this.db.sqlite.prepare("SELECT id, name, status FROM merchants ORDER BY created_at DESC").all().map(mapMerchant);
  }

  createMerchant(name: string): MerchantRecord {
    const id = randomUUID();
    this.db.sqlite.prepare("INSERT INTO merchants (id, name) VALUES (?, ?)").run(id, name);
    this.db.sqlite.prepare("INSERT INTO merchant_configs (merchant_id) VALUES (?)").run(id);
    this.ensureDefaultCountry(id);
    return this.getMerchant(id)!;
  }

  getMerchant(id: string): MerchantRecord | undefined {
    const row = this.db.sqlite.prepare("SELECT id, name, status FROM merchants WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? mapMerchant(row) : undefined;
  }

  patchMerchant(id: string, patch: Record<string, unknown>): MerchantRecord | undefined {
    const name = typeof patch.name === "string" ? patch.name : undefined;
    const status = patch.status === "active" || patch.status === "disabled" ? patch.status : undefined;
    if (name !== undefined || status !== undefined) {
      this.db.sqlite
        .prepare("UPDATE merchants SET name = COALESCE(?, name), status = COALESCE(?, status), updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(name ?? null, status ?? null, id);
    }
    return this.getMerchant(id);
  }

  deleteMerchant(id: string): boolean {
    if (id === "default") return false;
    const merchant = this.getMerchant(id);
    if (!merchant) return false;
    this.db.sqlite.exec("BEGIN");
    try {
      this.db.sqlite.prepare("DELETE FROM customer_memories WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM conversation_review_items WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM conversation_reviews WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM merchant_agent_profiles WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM training_material_items WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM training_materials WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM training_samples WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM knowledge_items WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM conversation_script_state WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM script_flow_versions WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM script_flow_steps WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM script_flows WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM messages WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM handoff_events WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM conversations WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM customers WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM a2c_invite_codes WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM merchant_a2c_accounts WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM users WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM merchant_configs WHERE merchant_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM merchant_countries WHERE merchant_id = ?").run(id);
      const result = this.db.sqlite.prepare("DELETE FROM merchants WHERE id = ?").run(id);
      this.db.sqlite.exec("COMMIT");
      return result.changes > 0;
    } catch (error) {
      this.db.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  getMerchantConfig(merchantId: string): MerchantConfigRecord {
    return this.settings.getConfig(merchantId);
  }

  a2cTokenStore(merchantId: string): A2CTokenStore {
    return this.settings.tokenStore(merchantId);
  }

  ensureDefaultCountry(merchantId: string): MerchantCountryRecord {
    return this.settings.ensureDefaultCountry(merchantId);
  }

  defaultCountryId(merchantId: string): string {
    return this.settings.defaultCountryId(merchantId);
  }

  ensurePrimaryCountry(merchantId: string): MerchantCountryRecord {
    return this.settings.ensurePrimaryCountry(merchantId);
  }

  validCountryId(merchantId: string, countryId: string): string {
    return this.settings.validCountryId(merchantId, countryId);
  }

  getMerchantCountry(id: string): MerchantCountryRecord | undefined {
    return this.settings.getCountry(id);
  }

  listMerchantCountries(merchantId: string): MerchantCountryRecord[] {
    return this.settings.listCountries(merchantId);
  }

  createMerchantCountry(merchantId: string, input: Record<string, unknown>): MerchantCountryRecord {
    return this.settings.createCountry(merchantId, input);
  }

  patchMerchantCountry(id: string, merchantId: string, patch: Record<string, unknown>): MerchantCountryRecord | undefined {
    return this.settings.patchCountry(id, merchantId, patch);
  }

  countryIdForA2CAccount(merchantId: string, apiPhone: string): string {
    return this.settings.countryIdForA2CAccount(merchantId, apiPhone);
  }

  patchMerchantConfig(merchantId: string, patch: Record<string, unknown>): MerchantConfigRecord {
    return this.settings.patchConfig(merchantId, patch);
  }

  listMerchantA2CAccounts(filters: { merchantId?: string; enabled?: boolean } = {}): MerchantA2CAccountRecord[] {
    return this.a2cAccounts.list(filters);
  }

  syncMerchantA2CAccounts(merchantId: string, accounts: A2CAccount[]): MerchantA2CAccountRecord[] {
    return this.a2cAccounts.sync(merchantId, accounts);
  }

  patchMerchantA2CAccount(id: number, patch: Record<string, unknown>, merchantId?: string): MerchantA2CAccountRecord | undefined {
    return this.a2cAccounts.patch(id, patch, merchantId);
  }

  listInviteCodesForA2CAccount(accountId: number, merchantId?: string): A2CInviteCodeRecord[] {
    return this.a2cAccounts.listInviteCodes(accountId, merchantId);
  }

  createInviteCodeForA2CAccount(accountId: number, input: Record<string, unknown>, merchantId?: string): A2CInviteCodeRecord {
    return this.a2cAccounts.createInviteCode(accountId, input, merchantId);
  }

  importInviteCodesForA2CAccount(accountId: number, input: { codes?: string; registerUrl?: string }, merchantId?: string): { imported: number; rows: A2CInviteCodeRecord[] } {
    return this.a2cAccounts.importInviteCodes(accountId, input, merchantId);
  }

  patchInviteCode(id: number, patch: Record<string, unknown>, merchantId?: string): A2CInviteCodeRecord | undefined {
    return this.a2cAccounts.patchInviteCode(id, patch, merchantId);
  }

  deleteInviteCode(id: number, merchantId?: string): boolean {
    return this.a2cAccounts.deleteInviteCode(id, merchantId);
  }

  reserveInviteCodeForConversation(conversation: Pick<Conversation, "id" | "merchantId" | "countryId" | "customerPhone" | "a2cAccountPhone">): A2CInviteCodeRecord | undefined {
    return this.a2cAccounts.reserveInviteCodeForConversation(conversation);
  }

  markInviteCodeUsedForConversation(conversationId: string, merchantId: string, platformAccount = ""): A2CInviteCodeRecord | undefined {
    return this.a2cAccounts.markInviteCodeUsedForConversation(conversationId, merchantId, platformAccount);
  }

  getMerchantA2CAccount(id: number, merchantId?: string): MerchantA2CAccountRecord | undefined {
    return this.a2cAccounts.getAccount(id, merchantId);
  }

  getInviteCode(id: number, merchantId?: string): A2CInviteCodeRecord | undefined {
    return this.a2cAccounts.getInviteCode(id, merchantId);
  }

  refreshMerchantA2CAccountPhones(merchantId: string): MerchantConfigRecord {
    return this.a2cAccounts.refreshPhones(merchantId);
  }

  updateTelegramBinding(merchantId: string, input: { chatId?: string; chatTitle?: string; status: MerchantConfigRecord["telegramHandoffChatStatus"]; error?: string }): MerchantConfigRecord {
    return this.settings.updateTelegramBinding(merchantId, input);
  }

  markTelegramBindingInvalid(merchantId: string, error: string): MerchantConfigRecord {
    return this.settings.markTelegramBindingInvalid(merchantId, error);
  }

  findMerchantByA2CAccount(accountPhone: string): MerchantRecord {
    const row = this.db.sqlite
      .prepare(`
        SELECT DISTINCT m.*
        FROM merchants m
        JOIN merchant_configs c ON c.merchant_id = m.id
        LEFT JOIN merchant_a2c_accounts a ON a.merchant_id = m.id AND a.enabled = 1
        WHERE m.status = 'active'
          AND (
            a.api_phone = ?
            OR
            c.a2c_account_phone = ?
            OR instr(',' || replace(c.a2c_account_phone, ' ', '') || ',', ',' || ? || ',') > 0
          )
        LIMIT 1
      `)
      .get(accountPhone, accountPhone, accountPhone) as Record<string, unknown> | undefined;
    return row ? mapMerchant(row) : this.getMerchant("default")!;
  }

  getUserByEmail(email: string): UserRecord | undefined {
    return this.users.getByEmail(email);
  }

  getUserById(id: string): UserRecord | undefined {
    return this.users.getById(id);
  }

  listUsers(filters: { merchantId?: string } = {}): UserRecord[] {
    return this.users.list(filters);
  }

  createUser(input: { merchantId: string | null; email: string; name: string; passwordHash: string; role: UserRole }): UserRecord {
    return this.users.create(input);
  }

  resetPlatformAdmin(input: { email: string; passwordHash: string; name?: string }): UserRecord {
    return this.users.resetPlatformAdmin(input);
  }

  patchUser(id: string, patch: { name?: string; status?: string; passwordHash?: string; role?: UserRole; merchantId?: string | null }): UserRecord | undefined {
    return this.users.patch(id, patch);
  }

  deleteUser(id: string): boolean {
    return this.users.delete(id);
  }

  updateHandoffStatus(conversationId: string, merchantId: string, handoffStatus: "pending" | "processing" | "done"): Conversation | undefined {
    return this.handoffs.updateStatus(conversationId, merchantId, handoffStatus);
  }

  listDueFollowUpCandidates(limit = 50): FollowUpCandidate[] {
    return this.handoffs.listDueFollowUpCandidates(limit);
  }

  recordFollowUp(input: { merchantId: string; conversationId: string; flowStep: string; type?: string; sent: boolean; error?: string }): boolean {
    return this.handoffs.recordFollowUp(input);
  }
}
