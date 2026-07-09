import type { Db } from "./db.js";
import type { A2CAccount, A2CTokenStore } from "./clients/a2c.js";
import type { TrainingSampleForSearch } from "./domain/sampleRetrieval.js";
import type { ImportedTrainingSample } from "./import/trainingSamples.js";
import type { UserRole } from "./auth.js";
import { createRepositoryModules, type RepositoryModules } from "./repositoryModules.js";
import type { ClearLearningAndCustomerDataResult } from "./repositoryMaintenance.js";

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
  IntentLearningInput,
  AiCallLogInput,
  AiCallStats,
  TeacherTgLinkRecord
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
  IntentLearningInput,
  AiCallLogInput,
  AiCallStats,
  TeacherTgLinkRecord
} from "./repositoryTypes.js";

export class Repositories {
  private readonly modules: RepositoryModules;

  constructor(private readonly db: Db) {
    this.modules = createRepositoryModules(db, {
      refreshCustomerAfterConversationDelete: (merchantId, countryId, customerKey) => this.refreshCustomerAfterConversationDelete(merchantId, countryId, customerKey),
      createTrainingSample: (merchantId, sample, countryId) => this.createTrainingSample(merchantId, sample, countryId),
      createKnowledgeItem: (merchantId, input) => this.createKnowledgeItem(merchantId, input),
      defaultCountryId: (merchantId) => this.defaultCountryId(merchantId),
      validCountryId: (merchantId, countryId) => this.validCountryId(merchantId, countryId)
    });
  }

  private get settings() { return this.modules.settings; }
  private get a2cAccounts() { return this.modules.a2cAccounts; }
  private get conversations() { return this.modules.conversations; }
  private get customers() { return this.modules.customers; }
  private get handoffs() { return this.modules.handoffs; }
  private get intentLearning() { return this.modules.intentLearning; }
  private get agentProfiles() { return this.modules.agentProfiles; }
  private get maintenance() { return this.modules.maintenance; }
  private get merchants() { return this.modules.merchants; }
  private get reviews() { return this.modules.reviews; }
  private get scriptFlows() { return this.modules.scriptFlows; }
  private get trainingContent() { return this.modules.trainingContent; }
  private get teacherTgLinks() { return this.modules.teacherTgLinks; }
  private get users() { return this.modules.users; }
  private get aiCalls() { return this.modules.aiCalls; }

  insertTrainingSamples(samples: ImportedTrainingSample[], merchantId = "default", countryId = this.defaultCountryId(merchantId)): number {
    return this.trainingContent.insertTrainingSamples(samples, merchantId, countryId);
  }

  deleteAllTrainingSamples(): { samplesDeleted: number; materialItemsDeleted: number } {
    return this.trainingContent.deleteAllTrainingSamples();
  }

  clearLearningAndCustomerData(): ClearLearningAndCustomerDataResult {
    return this.maintenance.clearLearningAndCustomerData();
  }

  rebuildCustomersFromConversations() {
    return this.maintenance.rebuildCustomersFromConversations();
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

  listTeacherTgLinks(merchantId: string, countryId = ""): TeacherTgLinkRecord[] {
    return this.teacherTgLinks.list(merchantId, countryId);
  }

  createTeacherTgLink(merchantId: string, countryId: string, input: Record<string, unknown>): TeacherTgLinkRecord {
    return this.teacherTgLinks.create(merchantId, countryId || this.defaultCountryId(merchantId), input);
  }

  importTeacherTgLinks(merchantId: string, countryId: string, input: Record<string, unknown>): { imported: number; rows: TeacherTgLinkRecord[] } {
    return this.teacherTgLinks.importMany(merchantId, countryId || this.defaultCountryId(merchantId), input);
  }

  patchTeacherTgLink(id: number, merchantId: string, patch: Record<string, unknown>): TeacherTgLinkRecord | undefined {
    return this.teacherTgLinks.patch(id, merchantId, patch);
  }

  deleteTeacherTgLink(id: number, merchantId: string): boolean {
    return this.teacherTgLinks.delete(id, merchantId);
  }

  assignTeacherTgLinkForConversation(conversation: Conversation, fallbackUrl = ""): TeacherTgLinkRecord | undefined {
    return this.teacherTgLinks.assignForConversation(conversation, fallbackUrl);
  }

  upsertCustomerFromConversation(conversation: Conversation): CustomerRecord {
    return this.customers.upsertFromConversation(conversation);
  }

  getCustomer(merchantId: string, customerKey: string): CustomerRecord | undefined {
    return this.customers.get(merchantId, customerKey);
  }

  listCustomers(filters: { merchantId?: string; countryId?: string; status?: string; language?: string; q?: string; startAt?: string; endAt?: string; limit?: number } = {}): CustomerRecord[] {
    return this.customers.list(filters);
  }

  countCustomers(filters: { merchantId?: string; countryId?: string; status?: string; language?: string; q?: string; startAt?: string; endAt?: string } = {}): number {
    return this.customers.count(filters);
  }

  countCreatedCustomers(filters: { merchantId?: string; countryId?: string; status?: string; language?: string; q?: string; startAt?: string; endAt?: string } = {}): number {
    return this.customers.countCreated(filters);
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

  listIntentLearningEvents(filters: { merchantId?: string; countryId?: string; status?: string; suggestedIntent?: string; q?: string; startAt?: string; endAt?: string; limit?: number } = {}): IntentLearningEventRecord[] {
    return this.intentLearning.list(filters);
  }

  countIntentLearningEvents(filters: { merchantId?: string; countryId?: string; status?: string; suggestedIntent?: string; q?: string; startAt?: string; endAt?: string } = {}): number {
    return this.intentLearning.count(filters);
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

  listConversations(filters: { merchantId?: string; countryId?: string; status?: string; language?: string; handoffStatus?: string; a2cAccountPhone?: string; customerPhone?: string; startAt?: string; endAt?: string; limit?: number } = {}): Conversation[] {
    return this.conversations.list(filters);
  }

  countConversations(filters: { merchantId?: string; countryId?: string; status?: string; language?: string; handoffStatus?: string; a2cAccountPhone?: string; customerPhone?: string; startAt?: string; endAt?: string } = {}): number {
    return this.conversations.count(filters);
  }

  countConversationsByCustomerHistory(filters: { merchantId?: string; startAt?: string; endAt?: string; repeat: boolean }): number {
    return this.conversations.countByCustomerHistory(filters);
  }

  countMessages(filters: { merchantId?: string; direction?: "inbound" | "outbound"; startAt?: string; endAt?: string } = {}): number {
    return this.conversations.countMessages(filters);
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
    return this.agentProfiles.get(merchantId);
  }

  patchMerchantAgentProfile(merchantId: string, patch: Record<string, unknown>): MerchantAgentProfileRecord {
    return this.agentProfiles.patch(merchantId, patch);
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
    return this.merchants.list();
  }

  createMerchant(name: string): MerchantRecord {
    return this.merchants.create(name);
  }

  getMerchant(id: string): MerchantRecord | undefined {
    return this.merchants.get(id);
  }

  patchMerchant(id: string, patch: Record<string, unknown>): MerchantRecord | undefined {
    return this.merchants.patch(id, patch);
  }

  deleteMerchant(id: string): boolean {
    return this.merchants.delete(id);
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
    return this.merchants.findByA2CAccount(accountPhone) ?? this.merchants.get("default")!;
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

  recordAiCall(input: AiCallLogInput): void {
    this.aiCalls.record(input);
  }

  aiCallStats(filters: { merchantId?: string; provider?: string; startAt?: string; endAt?: string } = {}): AiCallStats {
    return this.aiCalls.stats(filters);
  }
}
