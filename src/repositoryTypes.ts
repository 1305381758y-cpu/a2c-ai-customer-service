import type { UserRole } from "./auth.js";
import type { ConversationStage, IntentLabel } from "./domain/intents.js";
import type { TrainingSampleForSearch } from "./domain/sampleRetrieval.js";

export interface Conversation {
  id: string;
  merchantId: string;
  countryId: string;
  countryCode: string;
  countryName: string;
  customerPhone: string;
  a2cAccountPhone: string;
  nickname: string;
  language: string;
  stage: ConversationStage;
  flowStep: string;
  extractedPhone: string;
  extractedTelegram: string;
  extractedWhatsApp: string;
  assignedTeacherTgLinkId?: number;
  assignedTeacherTgLinkUrl?: string;
  status: "active" | "human_handoff";
  handoffStatus: "pending" | "processing" | "done";
  handoffNotified: number;
  unreadCount: number;
  pinnedAt?: string;
  updatedAt?: string;
  billingStatus?: "free" | "charged" | "insufficient";
  sessionChargeAmount?: number;
  sessionChargedAt?: string;
}

export interface ConversationScriptStateRecord {
  id: number;
  merchantId: string;
  conversationId: string;
  flowId?: number;
  flowVersion: number;
  currentStepId?: number;
  currentFlowStep: string;
  collected: Record<string, unknown>;
  updatedAt: string;
}

export interface TeacherTgLinkRecord {
  id: number;
  merchantId: string;
  countryId: string;
  label: string;
  url: string;
  priority: number;
  rotationCount: number;
  assignedCount: number;
  status: "active" | "disabled";
  createdAt: string;
  updatedAt: string;
}

export interface MerchantRecord {
  id: string;
  name: string;
  status: "active" | "disabled";
}

export interface MerchantConfigRecord {
  merchantId: string;
  a2cBaseUrl: string;
  a2cAppId: string;
  a2cAppSecret: string;
  a2cAccountPhone: string;
  a2cWebhookVerifyToken: string;
  openaiApiKey: string;
  openaiModel: string;
  aiProvider: "minimax" | "gemini" | "deepseek";
  minimaxApiKey: string;
  minimaxModel: string;
  deepseekApiKey: string;
  deepseekModel: string;
  googleAiApiKey: string;
  googleAiModel: string;
  telegramBotToken: string;
  telegramHandoffChatId: string;
  telegramHandoffChatTitle: string;
  telegramHandoffChatStatus: "unbound" | "waiting" | "bound" | "invalid";
  telegramHandoffChatError: string;
  a2cTokenCacheKey: string;
  a2cAccessToken: string;
  a2cTokenExpiresAt: number;
  a2cAuthBlockedUntil: number;
  smartReplyEnabled: boolean;
  trainingSimulationEnabled: boolean;
  strictScriptFlowEnabled: boolean;
  platformRegisterUrl: string;
  tgRegisterGuideUrl: string;
  registrationTutorialImageUrl: string;
  sessionPrice?: number;
  balance?: number;
  balanceCurrency?: string;
}

export interface MerchantConfigVersionRecord {
  id: number;
  merchantId: string;
  version: number;
  changedKeys: string[];
  note: string;
  createdBy: string;
  createdAt: string;
}

export interface FollowUpCandidate {
  conversation: Conversation;
  lastMessageId: number;
  lastMessageAt: string;
}

export interface MerchantA2CAccountRecord {
  id: number;
  merchantId: string;
  countryId: string;
  countryCode: string;
  countryName: string;
  defaultLanguage: string;
  apiPhone: string;
  wabaId: string;
  status: number;
  numberStatus: number;
  qualityRating: number;
  messagingLimit: number;
  verifiedName: string;
  enabled: boolean;
  syncedAt: string;
}

export interface A2CInviteCodeRecord {
  id: number;
  merchantId: string;
  countryId: string;
  countryCode: string;
  countryName: string;
  a2cAccountId: number;
  a2cAccountPhone: string;
  code: string;
  registerUrl: string;
  status: "available" | "reserved" | "used" | "disabled";
  assignedCustomerKey: string;
  assignedConversationId: string;
  platformAccount: string;
  assignedAt: string;
  usedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface MerchantCountryRecord {
  id: string;
  merchantId: string;
  code: string;
  name: string;
  defaultLanguage: string;
  platformRegisterUrl: string;
  tgRegisterGuideUrl: string;
  requirePlatformAccount: boolean;
  requirePhone: boolean;
  requireTelegram: boolean;
  requireWhatsApp: boolean;
  status: "active" | "disabled";
}

export interface UserRecord {
  id: string;
  merchantId: string | null;
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  status: "active" | "disabled";
}

export interface KnowledgeItemRecord {
  id: number;
  merchantId: string;
  countryId: string;
  type: "faq" | "script" | "rule" | "forbidden";
  title: string;
  content: string;
  language: string;
  priority: number;
  enabled: boolean;
}

export interface CustomerMemoryRecord {
  id: number;
  merchantId: string;
  countryId: string;
  countryCode: string;
  countryName: string;
  customerKey: string;
  conversationId: string;
  language: string;
  stage: string;
  extractedPhone: string;
  extractedTelegram: string;
  extractedWhatsApp: string;
  lastIntent: string;
  summary: string;
  facts: Record<string, unknown>;
  operatorNotes: string;
  updatedAt: string;
}

export interface CustomerRecord {
  id: number;
  merchantId: string;
  countryId: string;
  countryCode: string;
  countryName: string;
  customerKey: string;
  nickname: string;
  firstA2CAccountPhone: string;
  lastA2CAccountPhone: string;
  language: string;
  stage: string;
  extractedPhone: string;
  extractedTelegram: string;
  extractedWhatsApp: string;
  status: "active" | "human_handoff";
  conversationCount: number;
  lastConversationId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  balance: number;
  balanceCurrency: string;
  aiProvider: "" | "minimax" | "gemini" | "deepseek";
  aiModel: string;
}

export interface CustomerBalanceTransactionRecord {
  id: number;
  merchantId: string;
  customerKey: string;
  amount: number;
  note: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingMaterialRecord {
  id: number;
  merchantId: string;
  countryId: string;
  countryCode: string;
  countryName: string;
  sourceType: string;
  filename: string;
  mimeType: string;
  status: "enabled" | "disabled";
  rawText: string;
  itemCount: number;
  sampleCount: number;
  knowledgeCount: number;
  warnings: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TrainingMaterialItemRecord {
  id: number;
  materialId: number;
  merchantId: string;
  countryId: string;
  kind: "sample" | "knowledge";
  sampleId: number | null;
  knowledgeId: number | null;
  title: string;
  content: string;
  intent: string;
  stage: string;
  language: string;
  enabled: boolean;
}

export interface ScriptFlowRecord {
  id: number;
  merchantId: string;
  countryId: string;
  countryCode: string;
  countryName: string;
  name: string;
  status: "draft" | "active" | "disabled";
  active: boolean;
  version: number;
  sourceFilename: string;
  stepCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScriptFlowStepRecord {
  id: number;
  flowId: number;
  merchantId: string;
  countryId: string;
  flowCode: string;
  flowName: string;
  flowStep: string;
  goal: string;
  triggerCondition: string;
  customerExpressions: string;
  standardReply: string;
  replyParts?: string[];
  collectInfo: string;
  sendLink: boolean;
  sendInvite: boolean;
  sendTutorialImage: boolean;
  nextCondition: string;
  nextFlowCode: string;
  nextFlowStep: string;
  forbidden: string;
  notes: string;
  sortOrder: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScriptFlowVersionRecord {
  id: number;
  flowId: number;
  merchantId: string;
  version: number;
  note: string;
  createdBy: string;
  createdAt: string;
}

export interface ScriptFlowRuntime {
  flow: ScriptFlowRecord;
  steps: ScriptFlowStepRecord[];
}

export interface MerchantAgentProfileRecord {
  merchantId: string;
  agentName: string;
  roleDefinition: string;
  toneStyle: string;
  coreGoal: string;
  mustFollow: string;
  forbidden: string;
  uncertaintyPolicy: string;
  handoffPolicy: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MerchantAgentProfileVersionRecord {
  id: number;
  merchantId: string;
  version: number;
  changedKeys: string[];
  note: string;
  createdBy: string;
  createdAt: string;
}

export interface OperationLogRecord {
  id: number;
  merchantId: string;
  actorUserId: string;
  actorName: string;
  actorRole: string;
  action: string;
  resourceType: string;
  targetId: string;
  route: string;
  method: string;
  status: "success" | "error";
  httpStatus: number;
  createdAt: string;
}

export interface ConversationReviewRecord {
  id: number;
  merchantId: string;
  conversationId: string;
  score: number;
  goalCompleted: boolean;
  summary: string;
  mainConcerns: string[];
  mistakes: string[];
  goodReplies: string[];
  suggestedSamples: Array<Record<string, unknown>>;
  suggestedKnowledge: Array<Record<string, unknown>>;
  improvementActions: string[];
  status: "draft" | "ready" | "applied";
  createdAt: string;
  updatedAt: string;
}

export interface ConversationReviewItemRecord {
  id: number;
  reviewId: number;
  merchantId: string;
  conversationId: string;
  itemType: "sample" | "knowledge";
  title: string;
  content: string;
  status: "candidate" | "applied" | "ignored";
  appliedTargetType: string;
  appliedTargetId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationReviewInput {
  score: number;
  goalCompleted: boolean;
  summary: string;
  mainConcerns: string[];
  mistakes: string[];
  goodReplies: string[];
  suggestedSamples: Array<Record<string, unknown>>;
  suggestedKnowledge: Array<Record<string, unknown>>;
  improvementActions: string[];
}

export interface MessageInput {
  conversationId: string;
  direction: "inbound" | "outbound";
  externalId?: string;
  content: string;
  msgType: string;
  language: string;
  intent: IntentLabel | "unknown";
  phoneDetected?: string;
  telegramDetected?: string;
  whatsappDetected?: string;
  rawPayload?: unknown;
}

export interface UnreadSummaryRecord {
  a2cAccountPhone: string;
  unreadCount: number;
  conversations: Array<{ conversationId: string; customerPhone: string; unreadCount: number }>;
}

export interface ConversationMessageRecord {
  id: number;
  direction: string;
  content: string;
  msgType: string;
  language: string;
  intent: string;
  rawPayload: Record<string, unknown>;
  createdAt: string;
}

export interface ConversationExportRecord {
  merchantId: string;
  countryId: string;
  countryCode: string;
  countryName: string;
  conversationId: string;
  customerPhone: string;
  nickname: string;
  a2cAccountPhone: string;
  conversationLanguage: string;
  conversationStage: string;
  flowStep: string;
  conversationStatus: string;
  handoffStatus: string;
  extractedPhone: string;
  extractedTelegram: string;
  extractedWhatsApp: string;
  messageId: number;
  direction: string;
  msgType: string;
  messageLanguage: string;
  intent: string;
  content: string;
  originalContent: string;
  translatedContent: string;
  targetLanguage: string;
  operatorTranslatedContent: string;
  replyMode: string;
  strictFlowStep: string;
  a2cSendStatus: string;
  a2cSendError: string;
  phoneDetected: string;
  telegramDetected: string;
  whatsappDetected: string;
  externalId: string;
  createdAt: string;
}

export interface IntentLearningEventRecord {
  id: number;
  merchantId: string;
  countryId: string;
  conversationId: string;
  messageId: number | null;
  candidateKey: string;
  suggestedIntent: string;
  displayName: string;
  description: string;
  customerText: string;
  language: string;
  detectedIntent: string;
  inferredIntent: string;
  contextualIntent: string;
  flowStep: string;
  status: "candidate" | "reviewed" | "ignored" | "promoted";
  occurrenceCount: number;
  examples: Array<Record<string, unknown>>;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface IntentLearningInput {
  merchantId: string;
  countryId: string;
  conversationId: string;
  messageId?: number;
  customerText: string;
  language: string;
  detectedIntent: string;
  inferredIntent: string;
  contextualIntent: string;
  flowStep: string;
  candidateKey: string;
  suggestedIntent: string;
  displayName: string;
  description: string;
}

export interface AiCallLogInput {
  merchantId?: string;
  countryId?: string;
  provider: string;
  model: string;
  taskType: string;
  status: "success" | "error";
  durationMs: number;
  error?: string;
  httpStatus?: number;
  requestSummary?: string;
  responseSummary?: string;
}

export interface AiCallStats {
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  successRate: number;
  averageDurationMs: number;
  availableProviders: string[];
  availableTaskTypes: string[];
  byType: Array<{ taskType: string; totalCalls: number; successCalls: number; errorCalls: number; successRate: number; averageDurationMs: number }>;
  byProvider: Array<{ provider: string; totalCalls: number; successCalls: number; errorCalls: number; successRate: number; averageDurationMs: number }>;
  byTypeDetails: Array<{ taskType: string; provider: string; model: string; totalCalls: number; successCalls: number; errorCalls: number; successRate: number; averageDurationMs: number; lastCalledAt: string }>;
  byError: Array<{ taskType: string; provider: string; model: string; errorMessage: string; httpStatus: number | null; requestSummary: string; responseSummary: string; errorCalls: number; lastFailedAt: string }>;
}
