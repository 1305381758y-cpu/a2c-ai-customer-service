import { randomUUID } from "node:crypto";
import { insertTrainingSamples } from "./db.js";
import type { Db } from "./db.js";
import type { A2CAccount, A2CTokenStore } from "./clients/a2c.js";
import type { ConversationStage, IntentLabel } from "./domain/intents.js";
import type { TrainingSampleForSearch } from "./domain/sampleRetrieval.js";
import type { ImportedTrainingSample } from "./import/trainingSamples.js";
import type { UserRole } from "./auth.js";

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
  status: "active" | "human_handoff";
  handoffStatus: "pending" | "processing" | "done";
  handoffNotified: number;
  unreadCount: number;
  pinnedAt?: string;
  updatedAt?: string;
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
  openaiApiKey: string;
  openaiModel: string;
  aiProvider: "minimax" | "gemini";
  minimaxApiKey: string;
  minimaxModel: string;
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
  smartReplyEnabled: boolean;
  trainingSimulationEnabled: boolean;
  strictScriptFlowEnabled: boolean;
  platformRegisterUrl: string;
  tgRegisterGuideUrl: string;
  registrationTutorialImageUrl: string;
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

const COUNTRY_PRESETS: Array<{ names: string[]; code: string; defaultLanguage: string }> = [
  { names: ["巴西", "brazil", "br"], code: "br", defaultLanguage: "pt-BR" },
  { names: ["菲律宾", "philippines", "ph"], code: "ph", defaultLanguage: "en" },
  { names: ["日本", "japan", "jp"], code: "jp", defaultLanguage: "ja" },
  { names: ["泰国", "thailand", "th"], code: "th", defaultLanguage: "th" },
  { names: ["越南", "vietnam", "vn"], code: "vn", defaultLanguage: "vi" },
  { names: ["印尼", "印度尼西亚", "indonesia", "id"], code: "id", defaultLanguage: "id" },
  { names: ["马来西亚", "malaysia", "my"], code: "my", defaultLanguage: "ms" },
  { names: ["中国", "china", "cn"], code: "cn", defaultLanguage: "zh" },
  { names: ["美国", "united states", "usa", "us", "america"], code: "us", defaultLanguage: "en" },
  { names: ["墨西哥", "mexico", "mx"], code: "mx", defaultLanguage: "es" },
  { names: ["玻利维亚", "bolivia", "bo"], code: "bo", defaultLanguage: "es" },
  { names: ["西班牙", "spain", "es"], code: "es", defaultLanguage: "es" }
];

function inferCountryProfile(input: Record<string, unknown>, current?: MerchantCountryRecord) {
  const rawName = String(input.name || current?.name || "").trim();
  const rawCode = String(input.code || "").trim().toLowerCase();
  const rawLanguage = String(input.defaultLanguage || "").trim();
  const normalizedName = rawName.toLowerCase();
  const preset = COUNTRY_PRESETS.find((item) => item.names.some((name) => {
    const normalized = name.toLowerCase();
    return normalized === normalizedName || normalized === rawCode;
  }));
  const code = rawCode || preset?.code || current?.code || normalizedName.replace(/[^a-z]/g, "").slice(0, 2) || "default";
  const defaultLanguage = rawLanguage || preset?.defaultLanguage || current?.defaultLanguage || "en";
  return { code, name: rawName || current?.name || code, defaultLanguage };
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
  collectInfo: string;
  sendLink: boolean;
  sendInvite: boolean;
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

export class Repositories {
  constructor(private readonly db: Db) {}

  insertTrainingSamples(samples: ImportedTrainingSample[], merchantId = "default", countryId = this.defaultCountryId(merchantId)): number {
    return insertTrainingSamples(this.db, samples, merchantId, countryId);
  }

  deleteAllTrainingSamples(): { samplesDeleted: number; materialItemsDeleted: number } {
    this.db.sqlite.exec("BEGIN");
    try {
      const materialItems = this.db.sqlite.prepare("DELETE FROM training_material_items WHERE sample_id IS NOT NULL OR kind = 'sample'").run();
      const samples = this.db.sqlite.prepare("DELETE FROM training_samples").run();
      this.db.sqlite.exec("COMMIT");
      return {
        samplesDeleted: Number(samples.changes ?? 0),
        materialItemsDeleted: Number(materialItems.changes ?? 0)
      };
    } catch (error) {
      this.db.sqlite.exec("ROLLBACK");
      throw error;
    }
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
    this.db.sqlite
      .prepare(`
        INSERT INTO training_samples
          (merchant_id, country_id, customer_message, standard_reply, stage, intent, language, keywords, priority, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        merchantId,
        countryId,
        sample.customerMessage,
        sample.standardReply,
        sample.stage,
        sample.intent,
        sample.language,
        sample.keywords,
        sample.priority,
        sample.enabled ? 1 : 0
      );
    const row = this.db.sqlite.prepare("SELECT last_insert_rowid() AS id").get() as { id: number };
    return { id: Number(row.id) };
  }

  ensureBootstrapAdmin(input: { email: string; passwordHash: string }): void {
    const existing = this.db.sqlite.prepare("SELECT id FROM users WHERE role = 'platform_admin' LIMIT 1").get();
    if (existing) return;
    this.db.sqlite
      .prepare("INSERT INTO users (id, merchant_id, email, name, password_hash, role) VALUES (?, NULL, ?, ?, ?, 'platform_admin')")
      .run(randomUUID(), input.email, "平台管理员", input.passwordHash);
  }

  getOrCreateConversation(customerPhone: string, a2cAccountPhone: string, nickname = "", merchantId = "default", countryId = this.countryIdForA2CAccount(merchantId, a2cAccountPhone)): Conversation {
    const existing = this.db.sqlite
      .prepare("SELECT * FROM conversations WHERE merchant_id = ? AND customer_phone = ? AND a2c_account_phone = ?")
      .get(merchantId, customerPhone, a2cAccountPhone) as Record<string, unknown> | undefined;
    if (existing) {
      const mapped = mapConversation(existing);
      if (!mapped.countryId || mapped.countryId === `${mapped.merchantId}:default` && countryId !== mapped.countryId) {
        this.db.sqlite.prepare("UPDATE conversations SET country_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(countryId, mapped.id);
        return this.getConversation(mapped.id)!;
      }
      return mapped;
    }

    const id = randomUUID();
    this.db.sqlite
      .prepare(`
        INSERT INTO conversations (id, merchant_id, country_id, customer_phone, a2c_account_phone, nickname)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(id, merchantId, countryId, customerPhone, a2cAccountPhone, nickname);
    return this.getConversation(id)!;
  }

  getConversation(id: string): Conversation | undefined {
    const row = this.db.sqlite.prepare(`
      SELECT c.*, co.code AS country_code, co.name AS country_name
      FROM conversations c
      LEFT JOIN merchant_countries co ON co.id = c.country_id
      WHERE c.id = ?
    `).get(id) as Record<string, unknown> | undefined;
    return row ? mapConversation(row) : undefined;
  }

  updateConversation(conversation: Conversation): void {
    this.db.sqlite
      .prepare(`
        UPDATE conversations
        SET country_id = ?, language = ?, stage = ?, flow_step = ?, extracted_phone = ?, extracted_telegram = ?, extracted_whatsapp = ?,
            status = ?, handoff_status = ?, handoff_notified = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(
        conversation.countryId,
        conversation.language,
        conversation.stage,
        conversation.flowStep,
        conversation.extractedPhone,
        conversation.extractedTelegram,
        conversation.extractedWhatsApp,
        conversation.status,
        conversation.handoffStatus,
        conversation.handoffNotified,
        conversation.id
      );
  }

  upsertCustomerFromConversation(conversation: Conversation): CustomerRecord {
    const existing = this.getCustomer(conversation.merchantId, conversation.customerPhone);
    this.db.sqlite
      .prepare(`
        INSERT INTO customers
          (merchant_id, country_id, customer_key, nickname, first_a2c_account_phone, last_a2c_account_phone,
           language, stage, extracted_phone, extracted_telegram, extracted_whatsapp, status, conversation_count, last_conversation_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(merchant_id, customer_key) DO UPDATE SET
          nickname = CASE WHEN excluded.nickname != '' THEN excluded.nickname ELSE customers.nickname END,
          last_a2c_account_phone = excluded.last_a2c_account_phone,
          country_id = excluded.country_id,
          language = excluded.language,
          stage = excluded.stage,
          extracted_phone = CASE WHEN excluded.extracted_phone != '' THEN excluded.extracted_phone ELSE customers.extracted_phone END,
          extracted_telegram = CASE WHEN excluded.extracted_telegram != '' THEN excluded.extracted_telegram ELSE customers.extracted_telegram END,
          extracted_whatsapp = CASE WHEN excluded.extracted_whatsapp != '' THEN excluded.extracted_whatsapp ELSE customers.extracted_whatsapp END,
          status = excluded.status,
          conversation_count = (
            SELECT COUNT(*)
            FROM conversations
            WHERE merchant_id = excluded.merchant_id AND customer_phone = excluded.customer_key
          ),
          last_conversation_id = excluded.last_conversation_id,
          last_seen_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      `)
      .run(
        conversation.merchantId,
        conversation.countryId,
        conversation.customerPhone,
        conversation.nickname,
        existing?.firstA2CAccountPhone || conversation.a2cAccountPhone,
        conversation.a2cAccountPhone,
        conversation.language,
        conversation.stage,
        conversation.extractedPhone,
        conversation.extractedTelegram,
        conversation.extractedWhatsApp,
        conversation.status,
        conversation.id
      );
    return this.getCustomer(conversation.merchantId, conversation.customerPhone)!;
  }

  getCustomer(merchantId: string, customerKey: string): CustomerRecord | undefined {
    const row = this.db.sqlite
      .prepare(`
        SELECT cu.*, co.code AS country_code, co.name AS country_name
        FROM customers cu
        LEFT JOIN merchant_countries co ON co.id = cu.country_id
        WHERE cu.merchant_id = ? AND cu.customer_key = ?
      `)
      .get(merchantId, customerKey) as Record<string, unknown> | undefined;
    return row ? mapCustomer(row) : undefined;
  }

  listCustomers(filters: { merchantId?: string; countryId?: string; status?: string; language?: string; limit?: number } = {}): CustomerRecord[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filters.merchantId) {
      clauses.push("cu.merchant_id = ?");
      params.push(filters.merchantId);
    }
    if (filters.countryId) {
      clauses.push("cu.country_id = ?");
      params.push(filters.countryId);
    }
    if (filters.status) {
      clauses.push("cu.status = ?");
      params.push(filters.status);
    }
    if (filters.language) {
      clauses.push("cu.language = ?");
      params.push(filters.language);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
    params.push(limit);
    return this.db.sqlite
      .prepare(`
        SELECT cu.*, co.code AS country_code, co.name AS country_name
        FROM customers cu
        LEFT JOIN merchant_countries co ON co.id = cu.country_id
        ${where}
        ORDER BY cu.last_seen_at DESC, cu.id DESC
        LIMIT ?
      `)
      .all(...params)
      .map((row) => mapCustomer(row as Record<string, unknown>));
  }

  deleteCustomer(merchantId: string, customerKey: string): { deleted: boolean; conversationsDeleted: number; messagesDeleted: number } {
    const customer = this.getCustomer(merchantId, customerKey);
    if (!customer) return { deleted: false, conversationsDeleted: 0, messagesDeleted: 0 };
    const conversations = this.db.sqlite
      .prepare("SELECT id FROM conversations WHERE merchant_id = ? AND customer_phone = ?")
      .all(merchantId, customerKey)
      .map((row) => String((row as { id: string }).id));

    this.db.sqlite.exec("BEGIN");
    try {
      let messagesDeleted = 0;
      if (conversations.length) {
        const placeholders = conversations.map(() => "?").join(",");
        const conversationSampleMarkers = conversations.map((id) => `conversation_sample:${id}:%`);
        messagesDeleted = Number(this.db.sqlite.prepare(`DELETE FROM messages WHERE conversation_id IN (${placeholders})`).run(...conversations).changes ?? 0);
        this.db.sqlite.prepare(`DELETE FROM intent_learning_events WHERE conversation_id IN (${placeholders})`).run(...conversations);
        this.db.sqlite.prepare(`DELETE FROM conversation_review_items WHERE conversation_id IN (${placeholders})`).run(...conversations);
        this.db.sqlite.prepare(`DELETE FROM conversation_reviews WHERE conversation_id IN (${placeholders})`).run(...conversations);
        this.db.sqlite.prepare(`DELETE FROM conversation_followups WHERE conversation_id IN (${placeholders})`).run(...conversations);
        this.db.sqlite.prepare(`DELETE FROM handoff_events WHERE conversation_id IN (${placeholders})`).run(...conversations);
        this.db.sqlite.prepare(`DELETE FROM customer_memories WHERE conversation_id IN (${placeholders})`).run(...conversations);
        this.db.sqlite.prepare(`DELETE FROM conversations WHERE id IN (${placeholders})`).run(...conversations);
        this.db.sqlite.prepare(`DELETE FROM training_samples WHERE merchant_id = ? AND (${conversationSampleMarkers.map(() => "keywords LIKE ?").join(" OR ")})`).run(merchantId, ...conversationSampleMarkers);
        this.db.sqlite.prepare(`UPDATE a2c_invite_codes
          SET status = CASE WHEN status = 'reserved' THEN 'available' ELSE status END,
              assigned_customer_key = '',
              assigned_conversation_id = '',
              platform_account = '',
              assigned_at = CASE WHEN status = 'reserved' THEN '' ELSE assigned_at END,
              updated_at = CURRENT_TIMESTAMP
          WHERE merchant_id = ? AND (assigned_customer_key = ? OR assigned_conversation_id IN (${placeholders}))
        `).run(merchantId, customerKey, ...conversations);
      } else {
        this.db.sqlite.prepare(`
          UPDATE a2c_invite_codes
          SET status = CASE WHEN status = 'reserved' THEN 'available' ELSE status END,
              assigned_customer_key = '',
              assigned_conversation_id = '',
              platform_account = '',
              assigned_at = CASE WHEN status = 'reserved' THEN '' ELSE assigned_at END,
              updated_at = CURRENT_TIMESTAMP
          WHERE merchant_id = ? AND assigned_customer_key = ?
        `).run(merchantId, customerKey);
      }
      this.db.sqlite.prepare("DELETE FROM customer_memories WHERE merchant_id = ? AND customer_key = ?").run(merchantId, customerKey);
      const deleted = this.db.sqlite.prepare("DELETE FROM customers WHERE merchant_id = ? AND customer_key = ?").run(merchantId, customerKey);
      this.db.sqlite.exec("COMMIT");
      return { deleted: deleted.changes > 0, conversationsDeleted: conversations.length, messagesDeleted };
    } catch (error) {
      this.db.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  insertMessage(input: MessageInput): { inserted: boolean; id?: number } {
    try {
      const result = this.db.sqlite
        .prepare(`
          INSERT INTO messages
            (merchant_id, conversation_id, direction, external_id, content, msg_type, language, intent, phone_detected, telegram_detected, raw_payload)
          VALUES ((SELECT merchant_id FROM conversations WHERE id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          input.conversationId,
          input.conversationId,
          input.direction,
          input.externalId ?? null,
          input.content,
          input.msgType,
          input.language,
          input.intent,
          input.phoneDetected ?? "",
          input.telegramDetected ?? "",
          JSON.stringify({ ...(typeof input.rawPayload === "object" && input.rawPayload !== null ? input.rawPayload as Record<string, unknown> : {}), whatsappDetected: input.whatsappDetected ?? "" })
        );
      if (input.direction === "inbound") {
        this.db.sqlite.prepare("UPDATE conversations SET unread_count = unread_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(input.conversationId);
      } else {
        this.learnFromConversationReply(input.conversationId, Number(result.lastInsertRowid ?? 0), input);
      }
      return { inserted: true, id: Number(result.lastInsertRowid ?? 0) || undefined };
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE")) {
        if (input.direction === "outbound") {
          const result = this.db.sqlite
            .prepare(`
              INSERT INTO messages
                (merchant_id, conversation_id, direction, external_id, content, msg_type, language, intent, phone_detected, telegram_detected, raw_payload)
              VALUES ((SELECT merchant_id FROM conversations WHERE id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .run(
              input.conversationId,
              input.conversationId,
              input.direction,
              `local_outbound:${input.conversationId}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
              input.content,
              input.msgType,
              input.language,
              input.intent,
              input.phoneDetected ?? "",
              input.telegramDetected ?? "",
              JSON.stringify({ ...(typeof input.rawPayload === "object" && input.rawPayload !== null ? input.rawPayload as Record<string, unknown> : {}), externalIdConflict: input.externalId ?? "", whatsappDetected: input.whatsappDetected ?? "" })
            );
          this.learnFromConversationReply(input.conversationId, Number(result.lastInsertRowid ?? 0), input);
          return { inserted: true, id: Number(result.lastInsertRowid ?? 0) || undefined };
        }
        return { inserted: false };
      }
      throw error;
    }
  }

  recordIntentLearningEvent(input: IntentLearningInput): IntentLearningEventRecord {
    const existing = this.db.sqlite
      .prepare("SELECT * FROM intent_learning_events WHERE merchant_id = ? AND country_id = ? AND candidate_key = ?")
      .get(input.merchantId, input.countryId, input.candidateKey) as Record<string, unknown> | undefined;
    const example = {
      text: clipText(input.customerText, 300),
      conversationId: input.conversationId,
      messageId: input.messageId ?? null,
      detectedIntent: input.detectedIntent,
      inferredIntent: input.inferredIntent,
      contextualIntent: input.contextualIntent,
      flowStep: input.flowStep,
      at: new Date().toISOString()
    };
    if (existing) {
      const examples = [example, ...parseJsonRecordArray(existing.examples_json)]
        .filter((item, index, array) => {
          const text = String((item as Record<string, unknown>).text ?? "");
          return text && array.findIndex((candidate) => String((candidate as Record<string, unknown>).text ?? "") === text) === index;
        })
        .slice(0, 8);
      this.db.sqlite
        .prepare(`
          UPDATE intent_learning_events
          SET conversation_id = ?,
              message_id = ?,
              customer_text = ?,
              language = ?,
              detected_intent = ?,
              inferred_intent = ?,
              contextual_intent = ?,
              flow_step = ?,
              occurrence_count = occurrence_count + 1,
              examples_json = ?,
              last_seen_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `)
        .run(
          input.conversationId,
          input.messageId ?? null,
          clipText(input.customerText, 1200),
          input.language || "unknown",
          input.detectedIntent || "unknown",
          input.inferredIntent || "unknown",
          input.contextualIntent || "unknown",
          input.flowStep || "",
          JSON.stringify(examples),
          Number(existing.id)
        );
      return this.getIntentLearningEvent(Number(existing.id))!;
    }

    this.db.sqlite
      .prepare(`
        INSERT INTO intent_learning_events
          (merchant_id, country_id, conversation_id, message_id, candidate_key, suggested_intent, display_name, description,
           customer_text, language, detected_intent, inferred_intent, contextual_intent, flow_step, examples_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        input.merchantId,
        input.countryId,
        input.conversationId,
        input.messageId ?? null,
        input.candidateKey,
        input.suggestedIntent,
        input.displayName,
        input.description,
        clipText(input.customerText, 1200),
        input.language || "unknown",
        input.detectedIntent || "unknown",
        input.inferredIntent || "unknown",
        input.contextualIntent || "unknown",
        input.flowStep || "",
        JSON.stringify([example])
      );
    const row = this.db.sqlite.prepare("SELECT * FROM intent_learning_events WHERE id = last_insert_rowid()").get() as Record<string, unknown>;
    return mapIntentLearningEvent(row);
  }

  getIntentLearningEvent(id: number, merchantId?: string): IntentLearningEventRecord | undefined {
    const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
    const row = this.db.sqlite.prepare(`SELECT * FROM intent_learning_events ${where}`).get(id, ...(merchantId ? [merchantId] : [])) as Record<string, unknown> | undefined;
    return row ? mapIntentLearningEvent(row) : undefined;
  }

  listIntentLearningEvents(filters: { merchantId?: string; countryId?: string; status?: string; suggestedIntent?: string; limit?: number } = {}): IntentLearningEventRecord[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filters.merchantId) {
      clauses.push("merchant_id = ?");
      params.push(filters.merchantId);
    }
    if (filters.countryId) {
      clauses.push("country_id = ?");
      params.push(filters.countryId);
    }
    if (filters.status) {
      clauses.push("status = ?");
      params.push(filters.status);
    }
    if (filters.suggestedIntent) {
      clauses.push("suggested_intent = ?");
      params.push(filters.suggestedIntent);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
    params.push(limit);
    return this.db.sqlite
      .prepare(`
        SELECT *
        FROM intent_learning_events
        ${where}
        ORDER BY occurrence_count DESC, last_seen_at DESC, id DESC
        LIMIT ?
      `)
      .all(...params)
      .map((row) => mapIntentLearningEvent(row as Record<string, unknown>));
  }

  listPromotedIntentLearningEvents(filters: { merchantId: string; countryId: string; limit?: number }): IntentLearningEventRecord[] {
    const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500);
    return this.db.sqlite
      .prepare(`
        SELECT *
        FROM intent_learning_events
        WHERE merchant_id = ?
          AND country_id = ?
          AND status = 'promoted'
        ORDER BY occurrence_count DESC, updated_at DESC, id DESC
        LIMIT ?
      `)
      .all(filters.merchantId, filters.countryId, limit)
      .map((row) => mapIntentLearningEvent(row as Record<string, unknown>));
  }

  patchIntentLearningEvent(id: number, patch: Record<string, unknown>, merchantId?: string): IntentLearningEventRecord | undefined {
    const allowed: Record<string, string> = {
      status: "status",
      suggestedIntent: "suggested_intent",
      displayName: "display_name",
      description: "description"
    };
    const assignments: string[] = [];
    const values: Array<string | number> = [];
    for (const [key, column] of Object.entries(allowed)) {
      if (patch[key] === undefined) continue;
      assignments.push(`${column} = ?`);
      values.push(String(patch[key] ?? "").slice(0, key === "description" ? 500 : 80));
    }
    if (!assignments.length) return this.getIntentLearningEvent(id, merchantId);
    const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
    this.db.sqlite
      .prepare(`UPDATE intent_learning_events SET ${assignments.join(", ")}, updated_at = CURRENT_TIMESTAMP ${where}`)
      .run(...values, id, ...(merchantId ? [merchantId] : []));
    return this.getIntentLearningEvent(id, merchantId);
  }

  private learnFromConversationReply(conversationId: string, outboundMessageId: number, input: MessageInput): void {
    const reply = String(input.content || "").trim();
    if (input.direction !== "outbound" || input.msgType !== "text" || !reply || reply.length < 2) return;
    const conversation = this.getConversation(conversationId);
    if (!conversation) return;
    const inbound = this.db.sqlite
      .prepare(`
        SELECT id, content, language, intent
        FROM messages
        WHERE conversation_id = ? AND direction = 'inbound' AND id < ?
        ORDER BY id DESC
        LIMIT 1
      `)
      .get(conversationId, outboundMessageId || Number.MAX_SAFE_INTEGER) as { id: number; content: string; language: string; intent: string } | undefined;
    const customerMessage = String(inbound?.content || "").trim();
    if (!inbound || !customerMessage || customerMessage.length < 2) return;
    const marker = `conversation_sample:${conversationId}:${inbound.id}`;
    const existing = this.db.sqlite
      .prepare("SELECT id FROM training_samples WHERE merchant_id = ? AND keywords LIKE ? LIMIT 1")
      .get(conversation.merchantId, `%${marker}%`) as { id: number } | undefined;
    const language = String(inbound.language || input.language || conversation.language || "unknown");
    const intent = String(inbound.intent || input.intent || "unknown");
    const keywords = `${marker},真实对话,自动沉淀,${conversation.a2cAccountPhone},${conversation.customerPhone}`;
    if (existing) {
      this.db.sqlite
        .prepare(`
          UPDATE training_samples
          SET standard_reply = ?, language = ?, intent = ?, stage = ?, enabled = 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND merchant_id = ?
        `)
        .run(clipText(reply, 1200), language, intent, conversation.stage, existing.id, conversation.merchantId);
      return;
    }
    this.db.sqlite
      .prepare(`
        INSERT INTO training_samples
          (merchant_id, country_id, customer_message, standard_reply, stage, intent, language, keywords, priority, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
      `)
      .run(
        conversation.merchantId,
        conversation.countryId,
        clipText(customerMessage, 1200),
        clipText(reply, 1200),
        conversation.stage,
        intent,
        language,
        keywords
      );
  }

  markConversationRead(conversationId: string, merchantId: string): Conversation | undefined {
    this.db.sqlite.prepare("UPDATE conversations SET unread_count = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND merchant_id = ?").run(conversationId, merchantId);
    return this.getConversation(conversationId);
  }

  markConversationsRead(merchantId: string, filters: { a2cAccountPhone?: string } = {}): { updated: number } {
    const clauses = ["merchant_id = ?", "unread_count > 0"];
    const params: Array<string | number> = [merchantId];
    if (filters.a2cAccountPhone) {
      clauses.push("a2c_account_phone = ?");
      params.push(filters.a2cAccountPhone);
    }
    const result = this.db.sqlite
      .prepare(`UPDATE conversations SET unread_count = 0, updated_at = CURRENT_TIMESTAMP WHERE ${clauses.join(" AND ")}`)
      .run(...params);
    return { updated: Number(result.changes ?? 0) };
  }

  pinConversation(conversationId: string, merchantId: string, pinned: boolean): Conversation | undefined {
    this.db.sqlite
      .prepare("UPDATE conversations SET pinned_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND merchant_id = ?")
      .run(pinned ? new Date().toISOString() : "", conversationId, merchantId);
    return this.getConversation(conversationId);
  }

  unreadSummary(merchantId: string): UnreadSummaryRecord[] {
    const rows = this.db.sqlite.prepare(`
      SELECT a2c_account_phone, id AS conversation_id, customer_phone, unread_count
      FROM conversations
      WHERE merchant_id = ? AND unread_count > 0
      ORDER BY updated_at DESC
    `).all(merchantId) as Array<{ a2c_account_phone: string; conversation_id: string; customer_phone: string; unread_count: number }>;
    const grouped = new Map<string, UnreadSummaryRecord>();
    for (const row of rows) {
      const account = String(row.a2c_account_phone);
      const existing = grouped.get(account) ?? { a2cAccountPhone: account, unreadCount: 0, conversations: [] };
      existing.unreadCount += Number(row.unread_count || 0);
      existing.conversations.push({
        conversationId: String(row.conversation_id),
        customerPhone: String(row.customer_phone),
        unreadCount: Number(row.unread_count || 0)
      });
      grouped.set(account, existing);
    }
    return [...grouped.values()];
  }

  listConversationMessages(conversationId: string, limit = 20): ConversationMessageRecord[] {
    return this.db.sqlite
      .prepare(`
        SELECT id, direction, content, msg_type, language, intent, raw_payload, created_at
        FROM messages
        WHERE conversation_id = ?
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(conversationId, limit)
      .reverse()
      .map((row) => mapConversationMessage(row as Record<string, unknown>));
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
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filters.merchantId) {
      clauses.push("c.merchant_id = ?");
      params.push(filters.merchantId);
    }
    if (filters.countryId) {
      clauses.push("c.country_id = ?");
      params.push(filters.countryId);
    }
    if (filters.status) {
      clauses.push("c.status = ?");
      params.push(filters.status);
    }
    if (filters.handoffStatus) {
      clauses.push("c.handoff_status = ?");
      params.push(filters.handoffStatus);
    }
    if (filters.language) {
      clauses.push("c.language = ?");
      params.push(filters.language);
    }
    if (filters.a2cAccountPhone) {
      clauses.push("c.a2c_account_phone = ?");
      params.push(filters.a2cAccountPhone);
    }
    if (filters.customerPhone) {
      clauses.push("c.customer_phone = ?");
      params.push(filters.customerPhone);
    }
    if (filters.direction) {
      clauses.push("m.direction = ?");
      params.push(filters.direction);
    }
    if (filters.startAt) {
      clauses.push("m.created_at >= ?");
      params.push(filters.startAt);
    }
    if (filters.endAt) {
      clauses.push("m.created_at <= ?");
      params.push(filters.endAt);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = Math.min(Math.max(filters.limit ?? 5000, 1), 50000);
    params.push(limit);

    return this.db.sqlite
      .prepare(`
        SELECT
          c.merchant_id,
          c.country_id,
          co.code AS country_code,
          co.name AS country_name,
          c.id AS conversation_id,
          c.customer_phone,
          c.nickname,
          c.a2c_account_phone,
          c.language AS conversation_language,
          c.stage AS conversation_stage,
          c.flow_step,
          c.status AS conversation_status,
          c.handoff_status,
          c.extracted_phone,
          c.extracted_telegram,
          c.extracted_whatsapp,
          m.id AS message_id,
          m.direction,
          m.external_id,
          m.content,
          m.msg_type,
          m.language AS message_language,
          m.intent,
          m.phone_detected,
          m.telegram_detected,
          m.raw_payload,
          m.created_at
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        LEFT JOIN merchant_countries co ON co.id = c.country_id
        ${where}
        ORDER BY m.id ASC
        LIMIT ?
      `)
      .all(...params)
      .map((row) => mapConversationExportRecord(row as Record<string, unknown>));
  }

  getCustomerMemoryByConversation(conversationId: string): CustomerMemoryRecord | undefined {
    const conversation = this.getConversation(conversationId);
    if (!conversation) return undefined;
    return this.getCustomerMemory(conversation.merchantId, conversation.countryId, conversation.customerPhone);
  }

  getCustomerMemory(merchantId: string, countryId: string, customerKey: string): CustomerMemoryRecord | undefined {
    const row = this.db.sqlite
      .prepare(`
        SELECT cm.*, co.code AS country_code, co.name AS country_name
        FROM customer_memories cm
        LEFT JOIN merchant_countries co ON co.id = cm.country_id
        WHERE cm.merchant_id = ? AND cm.country_id = ? AND cm.customer_key = ?
      `)
      .get(merchantId, countryId, customerKey) as Record<string, unknown> | undefined;
    return row ? mapCustomerMemory(row) : undefined;
  }

  updateCustomerMemoryFromMessage(conversation: Conversation, input: { intent: string; content: string; direction: "inbound" | "outbound" }): CustomerMemoryRecord {
    const existing = this.getCustomerMemory(conversation.merchantId, conversation.countryId, conversation.customerPhone);
    const facts = existing?.facts ?? {};
    const recentSignals = Array.isArray(facts.recentSignals) ? facts.recentSignals as Array<Record<string, unknown>> : [];
    const signal = {
      direction: input.direction,
      intent: input.intent,
      content: clipText(input.content, 180),
      at: new Date().toISOString()
    };
    const lastIntent = input.direction === "inbound" || input.intent !== "unknown" ? input.intent : existing?.lastIntent ?? "unknown";
    const nextFacts = {
      ...facts,
      customerPhone: conversation.customerPhone,
      a2cAccountPhone: conversation.a2cAccountPhone,
      countryId: conversation.countryId,
      countryName: conversation.countryName,
      nickname: conversation.nickname,
      lastIntent,
      lastMessage: clipText(input.content, 180),
      recentSignals: [...recentSignals, signal].slice(-10)
    };
    const summary = buildCustomerMemorySummary(conversation, lastIntent, existing?.operatorNotes ?? "");

    this.db.sqlite
      .prepare(`
        INSERT INTO customer_memories
          (merchant_id, country_id, customer_key, conversation_id, language, stage, extracted_phone, extracted_telegram, extracted_whatsapp, last_intent, summary, facts_json, operator_notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(merchant_id, country_id, customer_key) DO UPDATE SET
          conversation_id = excluded.conversation_id,
          language = excluded.language,
          stage = excluded.stage,
          extracted_phone = excluded.extracted_phone,
          extracted_telegram = excluded.extracted_telegram,
          extracted_whatsapp = excluded.extracted_whatsapp,
          last_intent = excluded.last_intent,
          summary = excluded.summary,
          facts_json = excluded.facts_json,
          updated_at = CURRENT_TIMESTAMP
      `)
      .run(
        conversation.merchantId,
        conversation.countryId,
        conversation.customerPhone,
        conversation.id,
        conversation.language,
        conversation.stage,
        conversation.extractedPhone,
        conversation.extractedTelegram,
        conversation.extractedWhatsApp,
        lastIntent,
        summary,
        JSON.stringify(nextFacts),
        existing?.operatorNotes ?? ""
      );
    return this.getCustomerMemory(conversation.merchantId, conversation.countryId, conversation.customerPhone)!;
  }

  patchCustomerMemory(conversationId: string, merchantId: string | undefined, patch: Record<string, unknown>): CustomerMemoryRecord | undefined {
    const conversation = this.getConversation(conversationId);
    if (!conversation || (merchantId && conversation.merchantId !== merchantId)) return undefined;
    const existing = this.getCustomerMemory(conversation.merchantId, conversation.countryId, conversation.customerPhone)
      ?? this.updateCustomerMemoryFromMessage(conversation, { intent: "unknown", content: "", direction: "inbound" });
    const facts = typeof patch.facts === "object" && patch.facts !== null && !Array.isArray(patch.facts)
      ? patch.facts as Record<string, unknown>
      : existing.facts;
    const operatorNotes = typeof patch.operatorNotes === "string" ? patch.operatorNotes : existing.operatorNotes;
    const summary = buildCustomerMemorySummary(conversation, existing.lastIntent, operatorNotes);
    this.db.sqlite
      .prepare(`
        UPDATE customer_memories
        SET facts_json = ?, operator_notes = ?, summary = ?, updated_at = CURRENT_TIMESTAMP
        WHERE merchant_id = ? AND country_id = ? AND customer_key = ?
      `)
      .run(JSON.stringify(facts), operatorNotes, summary, conversation.merchantId, conversation.countryId, conversation.customerPhone);
    return this.getCustomerMemory(conversation.merchantId, conversation.countryId, conversation.customerPhone);
  }

  listConversations(filters: { merchantId?: string; countryId?: string; status?: string; language?: string; handoffStatus?: string; a2cAccountPhone?: string; limit?: number } = {}): Conversation[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filters.merchantId) {
      clauses.push("c.merchant_id = ?");
      params.push(filters.merchantId);
    }
    if (filters.countryId) {
      clauses.push("c.country_id = ?");
      params.push(filters.countryId);
    }
    if (filters.status) {
      clauses.push("c.status = ?");
      params.push(filters.status);
    }
    if (filters.language) {
      clauses.push("c.language = ?");
      params.push(filters.language);
    }
    if (filters.handoffStatus) {
      clauses.push("c.handoff_status = ?");
      params.push(filters.handoffStatus);
    }
    if (filters.a2cAccountPhone) {
      clauses.push("c.a2c_account_phone = ?");
      params.push(filters.a2cAccountPhone);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
    params.push(limit);

    return this.db.sqlite
      .prepare(`
        SELECT c.*, co.code AS country_code, co.name AS country_name
        FROM conversations c
        LEFT JOIN merchant_countries co ON co.id = c.country_id
        ${where}
        ORDER BY CASE WHEN COALESCE(c.pinned_at, '') != '' THEN 0 ELSE 1 END,
                 c.pinned_at DESC,
                 CASE WHEN c.unread_count > 0 THEN 0 ELSE 1 END,
                 c.updated_at DESC
        LIMIT ?
      `)
      .all(...params)
      .map((row) => mapConversation(row as Record<string, unknown>));
  }

  deleteConversation(id: string, merchantId?: string): boolean {
    const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
    const conversation = this.db.sqlite.prepare(`SELECT * FROM conversations ${where}`).get(id, ...(merchantId ? [merchantId] : [])) as Record<string, unknown> | undefined;
    if (!conversation) return false;
    const mapped = mapConversation(conversation);
    this.db.sqlite.exec("BEGIN");
    try {
      const replacementMemoryConversation = this.db.sqlite
        .prepare(`
          SELECT id
          FROM conversations
          WHERE merchant_id = ? AND country_id = ? AND customer_phone = ? AND id != ?
          ORDER BY updated_at DESC
          LIMIT 1
        `)
        .get(mapped.merchantId, mapped.countryId, mapped.customerPhone, id) as { id: string } | undefined;
      if (replacementMemoryConversation) {
        this.db.sqlite
          .prepare(`
            UPDATE customer_memories
            SET conversation_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE merchant_id = ? AND country_id = ? AND customer_key = ? AND conversation_id = ?
          `)
          .run(replacementMemoryConversation.id, mapped.merchantId, mapped.countryId, mapped.customerPhone, id);
      } else {
        this.db.sqlite
          .prepare("DELETE FROM customer_memories WHERE merchant_id = ? AND country_id = ? AND customer_key = ?")
          .run(mapped.merchantId, mapped.countryId, mapped.customerPhone);
      }
      this.db.sqlite.prepare("DELETE FROM customer_memories WHERE conversation_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM conversation_review_items WHERE conversation_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM conversation_reviews WHERE conversation_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM conversation_followups WHERE conversation_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM messages WHERE conversation_id = ?").run(id);
      this.db.sqlite.prepare("DELETE FROM handoff_events WHERE conversation_id = ?").run(id);
      const result = this.db.sqlite.prepare(`DELETE FROM conversations ${where}`).run(id, ...(merchantId ? [merchantId] : []));
      this.refreshCustomerAfterConversationDelete(mapped.merchantId, mapped.countryId, mapped.customerPhone);
      this.db.sqlite.exec("COMMIT");
      return result.changes > 0;
    } catch (error) {
      this.db.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  refreshCustomerAfterConversationDelete(merchantId: string, countryId: string, customerKey: string): void {
    const remainingInCountry = this.db.sqlite
      .prepare("SELECT COUNT(*) AS count FROM conversations WHERE merchant_id = ? AND country_id = ? AND customer_phone = ?")
      .get(merchantId, countryId, customerKey) as { count: number } | undefined;
    if ((remainingInCountry?.count ?? 0) === 0) {
      this.db.sqlite
        .prepare("DELETE FROM customer_memories WHERE merchant_id = ? AND country_id = ? AND customer_key = ?")
        .run(merchantId, countryId, customerKey);
    }

    const latest = this.db.sqlite
      .prepare(`
        SELECT id, a2c_account_phone, status, updated_at
        FROM conversations
        WHERE merchant_id = ? AND customer_phone = ?
        ORDER BY updated_at DESC
        LIMIT 1
      `)
      .get(merchantId, customerKey) as { id: string; a2c_account_phone: string; status: string; updated_at: string } | undefined;
    const count = this.db.sqlite
      .prepare("SELECT COUNT(*) AS count FROM conversations WHERE merchant_id = ? AND customer_phone = ?")
      .get(merchantId, customerKey) as { count: number } | undefined;
    if ((count?.count ?? 0) === 0) {
      this.db.sqlite
        .prepare("DELETE FROM customers WHERE merchant_id = ? AND customer_key = ?")
        .run(merchantId, customerKey);
      return;
    }
    this.db.sqlite
      .prepare(`
        UPDATE customers
        SET conversation_count = ?,
            last_conversation_id = ?,
            last_a2c_account_phone = COALESCE(?, last_a2c_account_phone),
            status = COALESCE(?, status),
            last_seen_at = COALESCE(?, last_seen_at),
            updated_at = CURRENT_TIMESTAMP
        WHERE merchant_id = ? AND customer_key = ?
      `)
      .run(count?.count ?? 0, latest?.id ?? "", latest?.a2c_account_phone ?? null, latest?.status ?? null, latest?.updated_at ?? null, merchantId, customerKey);
  }

  listTrainingSamples(filters: { merchantId?: string; countryId?: string; language?: string; intent?: string; stage?: string; enabled?: boolean } = {}): TrainingSampleForSearch[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filters.merchantId) {
      clauses.push("merchant_id = ?");
      params.push(filters.merchantId);
    }
    if (filters.countryId) {
      clauses.push("country_id = ?");
      params.push(filters.countryId);
    }
    if (filters.language) {
      clauses.push("language = ?");
      params.push(filters.language);
    }
    if (filters.intent) {
      clauses.push("intent = ?");
      params.push(filters.intent);
    }
    if (filters.stage) {
      clauses.push("stage = ?");
      params.push(filters.stage);
    }
    if (typeof filters.enabled === "boolean") {
      clauses.push("enabled = ?");
      params.push(filters.enabled ? 1 : 0);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.db.sqlite
      .prepare(`
        SELECT id, country_id AS countryId, customer_message AS customerMessage, standard_reply AS standardReply,
               stage, intent, language, keywords, priority, enabled
        FROM training_samples
        ${where}
        ORDER BY priority DESC, id DESC
        LIMIT 500
      `)
      .all(...params) as unknown as TrainingSampleForSearch[];
  }

  patchTrainingSample(id: number, patch: Record<string, unknown>, merchantId?: string): Record<string, unknown> | undefined {
    const allowed: Record<string, string> = {
      customerMessage: "customer_message",
      standardReply: "standard_reply",
      stage: "stage",
      intent: "intent",
      language: "language",
      keywords: "keywords",
      priority: "priority",
      enabled: "enabled",
      countryId: "country_id"
    };
    const entries = Object.entries(patch).filter(([key]) => key in allowed);
    if (entries.length) {
      const assignments = entries.map(([key]) => `${allowed[key]} = ?`).join(", ");
      const values = entries.map(([key, value]) => (key === "enabled" ? (value ? 1 : 0) : value)) as Array<string | number | null>;
      const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
      this.db.sqlite.prepare(`UPDATE training_samples SET ${assignments}, updated_at = CURRENT_TIMESTAMP ${where}`).run(...values, id, ...(merchantId ? [merchantId] : []));
    }
    const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
    return this.db.sqlite.prepare(`SELECT * FROM training_samples ${where}`).get(id, ...(merchantId ? [merchantId] : [])) as Record<string, unknown> | undefined;
  }

  deleteTrainingSample(id: number, merchantId?: string): boolean {
    const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
    const row = this.db.sqlite.prepare(`SELECT id FROM training_samples ${where}`).get(id, ...(merchantId ? [merchantId] : [])) as { id: number } | undefined;
    if (!row) return false;
    this.db.sqlite.prepare("DELETE FROM training_material_items WHERE sample_id = ?").run(id);
    const result = this.db.sqlite.prepare(`DELETE FROM training_samples ${where}`).run(id, ...(merchantId ? [merchantId] : []));
    return result.changes > 0;
  }

  listKnowledgeItems(filters: { merchantId?: string; countryId?: string; type?: string; enabled?: boolean } = {}): KnowledgeItemRecord[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filters.merchantId) {
      clauses.push("merchant_id = ?");
      params.push(filters.merchantId);
    }
    if (filters.countryId) {
      clauses.push("country_id = ?");
      params.push(filters.countryId);
    }
    if (filters.type) {
      clauses.push("type = ?");
      params.push(filters.type);
    }
    if (typeof filters.enabled === "boolean") {
      clauses.push("enabled = ?");
      params.push(filters.enabled ? 1 : 0);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.db.sqlite
      .prepare(`
        SELECT id, merchant_id, country_id, type, title, content, language, priority, enabled
        FROM knowledge_items
        ${where}
        ORDER BY priority DESC, id DESC
        LIMIT 500
      `)
      .all(...params)
      .map((row) => mapKnowledgeItem(row as Record<string, unknown>));
  }

  createKnowledgeItem(merchantId: string, input: Record<string, unknown>): KnowledgeItemRecord {
    const title = String(input.title || "").trim();
    const content = String(input.content || "").trim();
    if (!title || !content) throw new Error("title and content are required");
    const countryId = this.validCountryId(merchantId, String(input.countryId || "")) || this.defaultCountryId(merchantId);
    this.db.sqlite
      .prepare(`
        INSERT INTO knowledge_items (merchant_id, country_id, type, title, content, language, priority, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        merchantId,
        countryId,
        normalizeKnowledgeType(input.type),
        title,
        content,
        String(input.language || "zh"),
        Number(input.priority || 0),
        input.enabled === false ? 0 : 1
      );
    const row = this.db.sqlite.prepare("SELECT * FROM knowledge_items WHERE id = last_insert_rowid()").get() as Record<string, unknown>;
    return mapKnowledgeItem(row);
  }

  patchKnowledgeItem(id: number, patch: Record<string, unknown>, merchantId?: string): KnowledgeItemRecord | undefined {
    const allowed: Record<string, string> = {
      type: "type",
      title: "title",
      content: "content",
      language: "language",
      priority: "priority",
      enabled: "enabled",
      countryId: "country_id"
    };
    const entries = Object.entries(patch).filter(([key]) => key in allowed);
    if (entries.length) {
      const assignments = entries.map(([key]) => `${allowed[key]} = ?`).join(", ");
      const values = entries.map(([key, value]) => {
        if (key === "enabled") return value ? 1 : 0;
        if (key === "priority") return Number(value || 0);
        if (key === "type") return normalizeKnowledgeType(value);
        return String(value ?? "");
      }) as Array<string | number>;
      const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
      this.db.sqlite.prepare(`UPDATE knowledge_items SET ${assignments}, updated_at = CURRENT_TIMESTAMP ${where}`).run(...values, id, ...(merchantId ? [merchantId] : []));
    }
    const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
    const row = this.db.sqlite.prepare(`SELECT * FROM knowledge_items ${where}`).get(id, ...(merchantId ? [merchantId] : [])) as Record<string, unknown> | undefined;
    return row ? mapKnowledgeItem(row) : undefined;
  }

  deleteKnowledgeItem(id: number, merchantId?: string): boolean {
    const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
    const row = this.db.sqlite.prepare(`SELECT id FROM knowledge_items ${where}`).get(id, ...(merchantId ? [merchantId] : [])) as { id: number } | undefined;
    if (!row) return false;
    this.db.sqlite.prepare("DELETE FROM training_material_items WHERE knowledge_id = ?").run(id);
    const result = this.db.sqlite.prepare(`DELETE FROM knowledge_items ${where}`).run(id, ...(merchantId ? [merchantId] : []));
    return result.changes > 0;
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
    const countryId = this.validCountryId(input.merchantId, input.countryId || "") || this.defaultCountryId(input.merchantId);
    this.db.sqlite
      .prepare(`
        INSERT INTO training_materials
          (merchant_id, country_id, source_type, filename, mime_type, raw_text, warnings_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(input.merchantId, countryId, input.sourceType, input.filename, input.mimeType, input.rawText, JSON.stringify(input.warnings));
    const row = this.db.sqlite.prepare("SELECT * FROM training_materials WHERE id = last_insert_rowid()").get() as Record<string, unknown>;
    return mapTrainingMaterial(row);
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
    const countryId = this.validCountryId(input.merchantId, input.countryId || "") || this.defaultCountryId(input.merchantId);
    this.db.sqlite
      .prepare(`
        INSERT INTO training_material_items
          (material_id, merchant_id, country_id, kind, sample_id, knowledge_id, title, content, intent, stage, language, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        input.materialId,
        input.merchantId,
        countryId,
        input.kind,
        input.sampleId ?? null,
        input.knowledgeId ?? null,
        input.title,
        input.content,
        input.intent ?? "unknown",
        input.stage ?? "",
        input.language ?? "zh",
        input.enabled === false ? 0 : 1
      );
    const row = this.db.sqlite.prepare("SELECT * FROM training_material_items WHERE id = last_insert_rowid()").get() as Record<string, unknown>;
    return mapTrainingMaterialItem(row);
  }

  finalizeTrainingMaterial(id: number, merchantId: string, counts: { itemCount: number; sampleCount: number; knowledgeCount: number; warnings?: string[] }): TrainingMaterialRecord {
    this.db.sqlite
      .prepare(`
        UPDATE training_materials
        SET item_count = ?, sample_count = ?, knowledge_count = ?, warnings_json = COALESCE(?, warnings_json), updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND merchant_id = ?
      `)
      .run(
        counts.itemCount,
        counts.sampleCount,
        counts.knowledgeCount,
        counts.warnings ? JSON.stringify(counts.warnings) : null,
        id,
        merchantId
      );
    return this.getTrainingMaterial(id, merchantId)!;
  }

  deleteTrainingMaterial(id: number, merchantId?: string): boolean {
    const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
    const material = this.db.sqlite.prepare(`SELECT id FROM training_materials ${where}`).get(id, ...(merchantId ? [merchantId] : [])) as { id: number } | undefined;
    if (!material) return false;
    const sampleIds = this.db.sqlite
      .prepare("SELECT sample_id AS id FROM training_material_items WHERE material_id = ? AND sample_id IS NOT NULL")
      .all(id)
      .map((row) => Number((row as { id: number }).id));
    const knowledgeIds = this.db.sqlite
      .prepare("SELECT knowledge_id AS id FROM training_material_items WHERE material_id = ? AND knowledge_id IS NOT NULL")
      .all(id)
      .map((row) => Number((row as { id: number }).id));
    this.db.sqlite.prepare("DELETE FROM training_material_items WHERE material_id = ?").run(id);
    if (sampleIds.length) {
      this.db.sqlite.prepare(`DELETE FROM training_samples WHERE id IN (${sampleIds.map(() => "?").join(",")})`).run(...sampleIds);
    }
    if (knowledgeIds.length) {
      this.db.sqlite.prepare(`DELETE FROM knowledge_items WHERE id IN (${knowledgeIds.map(() => "?").join(",")})`).run(...knowledgeIds);
    }
    this.db.sqlite.prepare(`DELETE FROM training_materials ${where}`).run(id, ...(merchantId ? [merchantId] : []));
    return true;
  }

  listTrainingMaterials(filters: { merchantId?: string; countryId?: string; sourceType?: string; status?: string; limit?: number } = {}): TrainingMaterialRecord[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filters.merchantId) {
      clauses.push("tm.merchant_id = ?");
      params.push(filters.merchantId);
    }
    if (filters.countryId) {
      clauses.push("tm.country_id = ?");
      params.push(filters.countryId);
    }
    if (filters.sourceType) {
      clauses.push("tm.source_type = ?");
      params.push(filters.sourceType);
    }
    if (filters.status) {
      clauses.push("tm.status = ?");
      params.push(filters.status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
    params.push(limit);
    return this.db.sqlite
      .prepare(`
        SELECT tm.*, co.code AS country_code, co.name AS country_name
        FROM training_materials tm
        LEFT JOIN merchant_countries co ON co.id = tm.country_id
        ${where}
        ORDER BY tm.id DESC
        LIMIT ?
      `)
      .all(...params)
      .map((row) => mapTrainingMaterial(row as Record<string, unknown>));
  }

  getTrainingMaterial(id: number, merchantId?: string): TrainingMaterialRecord | undefined {
    const where = merchantId ? "WHERE tm.id = ? AND tm.merchant_id = ?" : "WHERE tm.id = ?";
    const row = this.db.sqlite.prepare(`
      SELECT tm.*, co.code AS country_code, co.name AS country_name
      FROM training_materials tm
      LEFT JOIN merchant_countries co ON co.id = tm.country_id
      ${where}
    `).get(id, ...(merchantId ? [merchantId] : [])) as Record<string, unknown> | undefined;
    return row ? mapTrainingMaterial(row) : undefined;
  }

  listTrainingMaterialItems(materialId: number, merchantId?: string): TrainingMaterialItemRecord[] {
    const where = merchantId ? "WHERE material_id = ? AND merchant_id = ?" : "WHERE material_id = ?";
    return this.db.sqlite
      .prepare(`
        SELECT *
        FROM training_material_items
        ${where}
        ORDER BY id ASC
      `)
      .all(materialId, ...(merchantId ? [merchantId] : []))
      .map((row) => mapTrainingMaterialItem(row as Record<string, unknown>));
  }

  listTrainingMaterialSnippets(merchantId: string, limit = 12, countryId?: string): TrainingMaterialItemRecord[] {
    const countryClause = countryId ? "AND country_id = ?" : "";
    const params: Array<string | number> = countryId ? [merchantId, countryId, limit] : [merchantId, limit];
    return this.db.sqlite
      .prepare(`
        SELECT *
        FROM training_material_items
        WHERE merchant_id = ? AND enabled = 1 ${countryClause}
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(...params)
      .map((row) => mapTrainingMaterialItem(row as Record<string, unknown>));
  }

  listScriptFlows(filters: { merchantId?: string; countryId?: string; status?: string } = {}): ScriptFlowRecord[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filters.merchantId) {
      clauses.push("sf.merchant_id = ?");
      params.push(filters.merchantId);
    }
    if (filters.countryId) {
      clauses.push("sf.country_id = ?");
      params.push(filters.countryId);
    }
    if (filters.status) {
      clauses.push("sf.status = ?");
      params.push(filters.status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.db.sqlite
      .prepare(`
        SELECT sf.*, co.code AS country_code, co.name AS country_name, COUNT(s.id) AS step_count
        FROM script_flows sf
        LEFT JOIN merchant_countries co ON co.id = sf.country_id
        LEFT JOIN script_flow_steps s ON s.flow_id = sf.id
        ${where}
        GROUP BY sf.id
        ORDER BY sf.active DESC, sf.updated_at DESC, sf.id DESC
      `)
      .all(...params)
      .map((row) => mapScriptFlow(row as Record<string, unknown>));
  }

  getScriptFlow(id: number, merchantId?: string): ScriptFlowRuntime | undefined {
    const where = merchantId ? "WHERE sf.id = ? AND sf.merchant_id = ?" : "WHERE sf.id = ?";
    const row = this.db.sqlite.prepare(`
      SELECT sf.*, co.code AS country_code, co.name AS country_name,
        (SELECT COUNT(*) FROM script_flow_steps s WHERE s.flow_id = sf.id) AS step_count
      FROM script_flows sf
      LEFT JOIN merchant_countries co ON co.id = sf.country_id
      ${where}
    `).get(id, ...(merchantId ? [merchantId] : [])) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return { flow: mapScriptFlow(row), steps: this.listScriptFlowSteps(id, merchantId) };
  }

  getActiveScriptFlow(merchantId: string, countryId?: string): ScriptFlowRuntime | undefined {
    const row = this.db.sqlite.prepare(`
      SELECT sf.*, co.code AS country_code, co.name AS country_name,
        (SELECT COUNT(*) FROM script_flow_steps s WHERE s.flow_id = sf.id) AS step_count
      FROM script_flows sf
      LEFT JOIN merchant_countries co ON co.id = sf.country_id
      WHERE sf.merchant_id = ? AND sf.active = 1 AND sf.status = 'active'
        AND (? = '' OR sf.country_id = ?)
      ORDER BY CASE WHEN sf.country_id = ? THEN 0 ELSE 1 END, sf.updated_at DESC
      LIMIT 1
    `).get(merchantId, countryId || "", countryId || "", countryId || "") as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return { flow: mapScriptFlow(row), steps: this.listScriptFlowSteps(Number(row.id), merchantId) };
  }

  createScriptFlow(merchantId: string, input: {
    name: string;
    countryId?: string;
    sourceFilename?: string;
    steps?: Array<Record<string, unknown>>;
    createdBy?: string;
  }): ScriptFlowRuntime {
    const name = input.name.trim();
    if (!name) throw new Error("话本名称不能为空");
    const countryId = this.validCountryId(merchantId, input.countryId || "") || this.defaultCountryId(merchantId);
    this.db.sqlite.exec("BEGIN");
    try {
      this.db.sqlite
        .prepare(`
          INSERT INTO script_flows (merchant_id, country_id, name, status, active, source_filename)
          VALUES (?, ?, ?, 'draft', 0, ?)
        `)
        .run(merchantId, countryId, name, input.sourceFilename || "");
      const flow = this.db.sqlite.prepare("SELECT id FROM script_flows WHERE id = last_insert_rowid()").get() as { id: number };
      const steps = input.steps || [];
      steps.forEach((step, index) => this.insertScriptFlowStep(flow.id, merchantId, countryId, step, index + 1));
      this.db.sqlite.exec("COMMIT");
      this.saveScriptFlowVersion(flow.id, merchantId, "创建话本", input.createdBy || "");
      return this.getScriptFlow(flow.id, merchantId)!;
    } catch (error) {
      this.db.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  listScriptFlowSteps(flowId: number, merchantId?: string): ScriptFlowStepRecord[] {
    const where = merchantId ? "WHERE flow_id = ? AND merchant_id = ?" : "WHERE flow_id = ?";
    return this.db.sqlite
      .prepare(`
        SELECT *
        FROM script_flow_steps
        ${where}
        ORDER BY sort_order ASC, id ASC
      `)
      .all(flowId, ...(merchantId ? [merchantId] : []))
      .map((row) => mapScriptFlowStep(row as Record<string, unknown>));
  }

  patchScriptFlow(id: number, merchantId: string | undefined, patch: Record<string, unknown>, userName = ""): ScriptFlowRuntime | undefined {
    const flow = this.getScriptFlow(id, merchantId);
    if (!flow) return undefined;
    const allowed: Record<string, string> = {
      name: "name",
      status: "status",
      countryId: "country_id"
    };
    const entries = Object.entries(patch).filter(([key]) => key in allowed);
    if (entries.length) {
      const assignments = entries.map(([key]) => `${allowed[key]} = ?`).join(", ");
      const values = entries.map(([key, value]) => {
        if (key === "status") return normalizeScriptFlowStatus(value);
        if (key === "countryId") return this.validCountryId(flow.flow.merchantId, String(value || "")) || flow.flow.countryId;
        return String(value ?? "");
      });
      const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
      this.db.sqlite.prepare(`UPDATE script_flows SET ${assignments}, updated_at = CURRENT_TIMESTAMP ${where}`).run(...values, id, ...(merchantId ? [merchantId] : []));
      this.saveScriptFlowVersion(id, flow.flow.merchantId, "修改话本基础信息", userName);
    }
    return this.getScriptFlow(id, merchantId);
  }

  enableScriptFlow(id: number, merchantId?: string, userName = ""): ScriptFlowRuntime | undefined {
    const flow = this.getScriptFlow(id, merchantId);
    if (!flow) return undefined;
    this.db.sqlite.exec("BEGIN");
    try {
      this.db.sqlite.prepare("UPDATE script_flows SET active = 0, status = CASE WHEN status = 'active' THEN 'draft' ELSE status END WHERE merchant_id = ?").run(flow.flow.merchantId);
      this.db.sqlite.prepare("UPDATE script_flows SET active = 1, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
      this.db.sqlite.exec("COMMIT");
      this.saveScriptFlowVersion(id, flow.flow.merchantId, "启用话本", userName);
      return this.getScriptFlow(id, merchantId);
    } catch (error) {
      this.db.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  deleteScriptFlow(id: number, merchantId?: string): boolean {
    const flow = this.getScriptFlow(id, merchantId);
    if (!flow) return false;
    if (flow.flow.active) throw new Error("当前启用的话本不能直接删除，请先启用其他话本或停用该话本");
    const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
    const result = this.db.sqlite.prepare(`DELETE FROM script_flows ${where}`).run(id, ...(merchantId ? [merchantId] : []));
    return result.changes > 0;
  }

  createScriptFlowStep(flowId: number, merchantId: string | undefined, input: Record<string, unknown>, userName = ""): ScriptFlowStepRecord | undefined {
    const flow = this.getScriptFlow(flowId, merchantId);
    if (!flow) return undefined;
    const maxOrder = this.db.sqlite.prepare("SELECT COALESCE(MAX(sort_order), 0) AS value FROM script_flow_steps WHERE flow_id = ?").get(flowId) as { value: number };
    this.insertScriptFlowStep(flowId, flow.flow.merchantId, flow.flow.countryId, input, Number(maxOrder.value || 0) + 1);
    this.bumpScriptFlow(flowId, flow.flow.merchantId, "新增流程节点", userName);
    return this.listScriptFlowSteps(flowId, merchantId).at(-1);
  }

  patchScriptFlowStep(id: number, merchantId: string | undefined, patch: Record<string, unknown>, userName = ""): ScriptFlowStepRecord | undefined {
    const existing = this.getScriptFlowStep(id, merchantId);
    if (!existing) return undefined;
    const allowed: Record<string, string> = {
      flowCode: "flow_code",
      flowName: "flow_name",
      flowStep: "flow_step",
      goal: "goal",
      triggerCondition: "trigger_condition",
      customerExpressions: "customer_expressions",
      standardReply: "standard_reply",
      collectInfo: "collect_info",
      sendLink: "send_link",
      sendInvite: "send_invite",
      nextCondition: "next_condition",
      nextFlowCode: "next_flow_code",
      nextFlowStep: "next_flow_step",
      forbidden: "forbidden",
      notes: "notes",
      sortOrder: "sort_order",
      enabled: "enabled"
    };
    const entries = Object.entries(patch).filter(([key]) => key in allowed);
    if (entries.length) {
      const assignments = entries.map(([key]) => `${allowed[key]} = ?`).join(", ");
      const values = entries.map(([key, value]) => normalizeScriptFlowStepValue(key, value));
      const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
      this.db.sqlite.prepare(`UPDATE script_flow_steps SET ${assignments}, updated_at = CURRENT_TIMESTAMP ${where}`).run(...values, id, ...(merchantId ? [merchantId] : []));
      this.bumpScriptFlow(existing.flowId, existing.merchantId, "修改流程节点", userName);
    }
    return this.getScriptFlowStep(id, merchantId);
  }

  deleteScriptFlowStep(id: number, merchantId?: string, userName = ""): boolean {
    const step = this.getScriptFlowStep(id, merchantId);
    if (!step) return false;
    const references = this.db.sqlite
      .prepare(`
        SELECT id FROM script_flow_steps
        WHERE flow_id = ? AND id != ? AND enabled = 1
          AND ((next_flow_step != '' AND next_flow_step = ?) OR (next_flow_code != '' AND next_flow_code = ?))
        LIMIT 1
      `)
      .get(step.flowId, id, step.flowStep, step.flowCode) as { id: number } | undefined;
    if (references) throw new Error("有其他节点引用了这个节点，请先修改下一步条件后再删除");
    const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
    const result = this.db.sqlite.prepare(`DELETE FROM script_flow_steps ${where}`).run(id, ...(merchantId ? [merchantId] : []));
    if (result.changes > 0) this.bumpScriptFlow(step.flowId, step.merchantId, "删除流程节点", userName);
    return result.changes > 0;
  }

  duplicateScriptFlowStep(id: number, merchantId?: string, userName = ""): ScriptFlowStepRecord | undefined {
    const step = this.getScriptFlowStep(id, merchantId);
    if (!step) return undefined;
    return this.createScriptFlowStep(step.flowId, merchantId, {
      ...step,
      flowCode: `${step.flowCode}_copy`,
      flowName: `${step.flowName || step.flowCode} 副本`,
      sortOrder: step.sortOrder + 1
    }, userName);
  }

  listScriptFlowVersions(flowId: number, merchantId?: string): ScriptFlowVersionRecord[] {
    const where = merchantId ? "WHERE flow_id = ? AND merchant_id = ?" : "WHERE flow_id = ?";
    return this.db.sqlite
      .prepare(`
        SELECT id, flow_id, merchant_id, version, note, created_by, created_at
        FROM script_flow_versions
        ${where}
        ORDER BY version DESC, id DESC
      `)
      .all(flowId, ...(merchantId ? [merchantId] : []))
      .map((row) => mapScriptFlowVersion(row as Record<string, unknown>));
  }

  restoreScriptFlowVersion(flowId: number, versionId: number, merchantId?: string, userName = ""): ScriptFlowRuntime | undefined {
    const flow = this.getScriptFlow(flowId, merchantId);
    if (!flow) return undefined;
    const where = merchantId ? "WHERE id = ? AND flow_id = ? AND merchant_id = ?" : "WHERE id = ? AND flow_id = ?";
    const version = this.db.sqlite.prepare(`SELECT * FROM script_flow_versions ${where}`).get(versionId, flowId, ...(merchantId ? [merchantId] : [])) as Record<string, unknown> | undefined;
    if (!version) return undefined;
    const snapshot = parseJsonObject(version.snapshot_json);
    const steps = Array.isArray(snapshot.steps) ? snapshot.steps as Array<Record<string, unknown>> : [];
    this.db.sqlite.exec("BEGIN");
    try {
      this.db.sqlite.prepare("DELETE FROM script_flow_steps WHERE flow_id = ?").run(flowId);
      steps.forEach((step, index) => this.insertScriptFlowStep(flowId, flow.flow.merchantId, flow.flow.countryId, step, index + 1));
      this.db.sqlite.exec("COMMIT");
      this.bumpScriptFlow(flowId, flow.flow.merchantId, `恢复版本 ${version.version}`, userName);
      return this.getScriptFlow(flowId, merchantId);
    } catch (error) {
      this.db.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  private insertScriptFlowStep(flowId: number, merchantId: string, countryId: string, input: Record<string, unknown>, fallbackOrder: number): void {
    const flowCode = String(input.flowCode ?? input.flow_code ?? input["流程编号"] ?? "").trim() || `step_${fallbackOrder}`;
    const flowStep = normalizeScriptFlowStep(String(input.flowStep ?? input.flow_step ?? input["流程步骤"] ?? flowCode));
    const standardReply = String(input.standardReply ?? input.standard_reply ?? input["客服标准话术"] ?? input.content ?? "").trim();
    if (!standardReply) throw new Error(`流程 ${flowCode} 缺少客服标准话术`);
    this.db.sqlite
      .prepare(`
        INSERT INTO script_flow_steps
          (flow_id, merchant_id, country_id, flow_code, flow_name, flow_step, goal, trigger_condition, customer_expressions,
           standard_reply, collect_info, send_link, send_invite, next_condition, next_flow_code, next_flow_step,
           forbidden, notes, sort_order, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        flowId,
        merchantId,
        countryId,
        flowCode,
        String(input.flowName ?? input.flow_name ?? input["流程名称"] ?? "").trim(),
        flowStep,
        String(input.goal ?? input["当前节点目标"] ?? input["本节点目标"] ?? "").trim(),
        String(input.triggerCondition ?? input.trigger_condition ?? input["触发条件"] ?? "").trim(),
        String(input.customerExpressions ?? input.customer_expressions ?? input["客户常见表达"] ?? "").trim(),
        standardReply,
        String(input.collectInfo ?? input.collect_info ?? input["需要收集的信息"] ?? "").trim(),
        booleanPatchValue(input.sendLink ?? input.send_link ?? input["是否发链接"], false),
        booleanPatchValue(input.sendInvite ?? input.send_invite ?? input["是否发邀请码"], false),
        String(input.nextCondition ?? input.next_condition ?? input["下一步条件"] ?? "").trim(),
        String(input.nextFlowCode ?? input.next_flow_code ?? input["下一流程编号"] ?? "").trim(),
        normalizeScriptFlowStep(String(input.nextFlowStep ?? input.next_flow_step ?? "")),
        String(input.forbidden ?? input["禁止事项"] ?? "").trim(),
        String(input.notes ?? input["备注"] ?? "").trim(),
        Number(input.sortOrder ?? input.sort_order ?? input["排序"] ?? fallbackOrder),
        booleanPatchValue(input.enabled ?? input["启用"], true)
      );
  }

  private getScriptFlowStep(id: number, merchantId?: string): ScriptFlowStepRecord | undefined {
    const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
    const row = this.db.sqlite.prepare(`SELECT * FROM script_flow_steps ${where}`).get(id, ...(merchantId ? [merchantId] : [])) as Record<string, unknown> | undefined;
    return row ? mapScriptFlowStep(row) : undefined;
  }

  private bumpScriptFlow(flowId: number, merchantId: string, note: string, userName = ""): void {
    this.db.sqlite
      .prepare("UPDATE script_flows SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND merchant_id = ?")
      .run(flowId, merchantId);
    this.saveScriptFlowVersion(flowId, merchantId, note, userName);
  }

  private saveScriptFlowVersion(flowId: number, merchantId: string, note: string, userName = ""): void {
    const flow = this.getScriptFlow(flowId, merchantId);
    if (!flow) return;
    const snapshot = JSON.stringify({
      flow: flow.flow,
      steps: flow.steps
    });
    this.db.sqlite
      .prepare(`
        INSERT INTO script_flow_versions (flow_id, merchant_id, version, snapshot_json, note, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(flowId, merchantId, flow.flow.version, snapshot, note, userName);
  }

  insertHandoffEvent(conversationId: string, telegramMessage: string, sent: boolean, error = ""): void {
    this.db.sqlite
      .prepare("INSERT INTO handoff_events (merchant_id, conversation_id, telegram_message, sent, error) VALUES ((SELECT merchant_id FROM conversations WHERE id = ?), ?, ?, ?, ?)")
      .run(conversationId, conversationId, telegramMessage, sent ? 1 : 0, error);
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
    const where = merchantId ? "WHERE conversation_id = ? AND merchant_id = ?" : "WHERE conversation_id = ?";
    const row = this.db.sqlite.prepare(`SELECT * FROM conversation_reviews ${where}`).get(conversationId, ...(merchantId ? [merchantId] : [])) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    const review = mapConversationReview(row);
    return { review, items: this.listConversationReviewItems(review.id, merchantId) };
  }

  upsertConversationReview(conversationId: string, merchantId: string, input: ConversationReviewInput): { review: ConversationReviewRecord; items: ConversationReviewItemRecord[] } {
    const existing = this.db.sqlite
      .prepare("SELECT id FROM conversation_reviews WHERE conversation_id = ? AND merchant_id = ?")
      .get(conversationId, merchantId) as { id: number } | undefined;
    const params = [
      Math.max(0, Math.min(100, Math.round(input.score || 0))),
      input.goalCompleted ? 1 : 0,
      clipText(input.summary || "", 1200),
      JSON.stringify(input.mainConcerns || []),
      JSON.stringify(input.mistakes || []),
      JSON.stringify(input.goodReplies || []),
      JSON.stringify(input.suggestedSamples || []),
      JSON.stringify(input.suggestedKnowledge || []),
      JSON.stringify(input.improvementActions || []),
      "ready"
    ];
    this.db.sqlite.exec("BEGIN");
    try {
      let reviewId = existing?.id;
      if (reviewId) {
        this.db.sqlite
          .prepare(`
            UPDATE conversation_reviews
            SET score = ?, goal_completed = ?, summary = ?, main_concerns_json = ?, mistakes_json = ?,
                good_replies_json = ?, suggested_samples_json = ?, suggested_knowledge_json = ?,
                improvement_actions_json = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `)
          .run(...params, reviewId);
        this.db.sqlite.prepare("DELETE FROM conversation_review_items WHERE review_id = ? AND status = 'candidate'").run(reviewId);
      } else {
        const result = this.db.sqlite
          .prepare(`
            INSERT INTO conversation_reviews
              (merchant_id, conversation_id, score, goal_completed, summary, main_concerns_json, mistakes_json,
               good_replies_json, suggested_samples_json, suggested_knowledge_json, improvement_actions_json, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(merchantId, conversationId, ...params);
        reviewId = Number(result.lastInsertRowid ?? 0);
      }
      this.insertReviewSuggestionItems(reviewId, merchantId, conversationId, input);
      this.db.sqlite.exec("COMMIT");
      const current = this.getConversationReview(conversationId, merchantId);
      if (!current) throw new Error("review not found after save");
      return current;
    } catch (error) {
      this.db.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  listConversationReviewItems(reviewId: number, merchantId?: string): ConversationReviewItemRecord[] {
    const where = merchantId ? "WHERE review_id = ? AND merchant_id = ?" : "WHERE review_id = ?";
    return this.db.sqlite
      .prepare(`SELECT * FROM conversation_review_items ${where} ORDER BY id ASC`)
      .all(reviewId, ...(merchantId ? [merchantId] : []))
      .map((row) => mapConversationReviewItem(row as Record<string, unknown>));
  }

  applyConversationReviewItem(itemId: number, merchantId: string): ConversationReviewItemRecord | undefined {
    const row = this.db.sqlite
      .prepare("SELECT * FROM conversation_review_items WHERE id = ? AND merchant_id = ?")
      .get(itemId, merchantId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    const item = mapConversationReviewItem(row);
    if (item.status === "applied") return item;
    const payload = parseJsonObject(item.content);
    let targetType = "";
    let targetId = "";
    if (item.itemType === "sample") {
      const created = this.createTrainingSample(merchantId, {
        customerMessage: String(payload.customerMessage || item.title || "客户问题"),
        standardReply: String(payload.standardReply || payload.reply || item.content || ""),
        stage: normalizeReviewSampleStage(payload.stage),
        intent: String(payload.intent || "unknown") as IntentLabel,
        language: String(payload.language || "zh"),
        keywords: String(payload.keywords || "复盘候选,人工确认"),
        priority: Number(payload.priority || 0),
        enabled: true
      }, this.defaultCountryId(merchantId));
      targetType = "training_sample";
      targetId = String(created.id);
    } else {
      const created = this.createKnowledgeItem(merchantId, {
        title: String(payload.title || item.title || "复盘知识建议"),
        content: String(payload.content || payload.answer || item.content || ""),
        type: String(payload.type || "faq"),
        language: String(payload.language || "zh"),
        priority: Number(payload.priority || 0),
        enabled: true
      });
      targetType = "knowledge_item";
      targetId = String(created.id);
    }
    this.db.sqlite
      .prepare(`
        UPDATE conversation_review_items
        SET status = 'applied', applied_target_type = ?, applied_target_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND merchant_id = ?
      `)
      .run(targetType, targetId, itemId, merchantId);
    return mapConversationReviewItem(this.db.sqlite.prepare("SELECT * FROM conversation_review_items WHERE id = ?").get(itemId) as Record<string, unknown>);
  }

  private insertReviewSuggestionItems(reviewId: number, merchantId: string, conversationId: string, input: ConversationReviewInput): void {
    for (const sample of input.suggestedSamples || []) {
      const title = clipText(String(sample.customerMessage || sample.title || "候选优秀回复样本"), 120);
      this.db.sqlite
        .prepare(`
          INSERT INTO conversation_review_items
            (review_id, merchant_id, conversation_id, item_type, title, content, status)
          VALUES (?, ?, ?, 'sample', ?, ?, 'candidate')
        `)
        .run(reviewId, merchantId, conversationId, title, JSON.stringify(sample));
    }
    for (const knowledge of input.suggestedKnowledge || []) {
      const title = clipText(String(knowledge.title || "候选知识补充"), 120);
      this.db.sqlite
        .prepare(`
          INSERT INTO conversation_review_items
            (review_id, merchant_id, conversation_id, item_type, title, content, status)
          VALUES (?, ?, ?, 'knowledge', ?, ?, 'candidate')
        `)
        .run(reviewId, merchantId, conversationId, title, JSON.stringify(knowledge));
    }
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
    this.db.sqlite.prepare("INSERT OR IGNORE INTO merchant_configs (merchant_id) VALUES (?)").run(merchantId);
    const row = this.db.sqlite.prepare("SELECT * FROM merchant_configs WHERE merchant_id = ?").get(merchantId) as Record<string, unknown>;
    return mapMerchantConfig(row);
  }

  a2cTokenStore(merchantId: string): A2CTokenStore {
    return {
      get: (cacheKey) => {
        const config = this.getMerchantConfig(merchantId);
        if (config.a2cTokenCacheKey !== cacheKey || !config.a2cAccessToken || !config.a2cTokenExpiresAt) return undefined;
        return { accessToken: config.a2cAccessToken, expiresAt: config.a2cTokenExpiresAt };
      },
      set: (cacheKey, accessToken, expiresAt) => {
        this.db.sqlite.prepare("INSERT OR IGNORE INTO merchant_configs (merchant_id) VALUES (?)").run(merchantId);
        this.db.sqlite
          .prepare(`
            UPDATE merchant_configs
            SET a2c_token_cache_key = ?,
                a2c_access_token = ?,
                a2c_token_expires_at = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE merchant_id = ?
          `)
          .run(cacheKey, accessToken, expiresAt, merchantId);
      },
      clear: (cacheKey) => {
        const config = this.getMerchantConfig(merchantId);
        if (config.a2cTokenCacheKey && config.a2cTokenCacheKey !== cacheKey) return;
        this.db.sqlite
          .prepare(`
            UPDATE merchant_configs
            SET a2c_token_cache_key = '',
                a2c_access_token = '',
                a2c_token_expires_at = 0,
                updated_at = CURRENT_TIMESTAMP
            WHERE merchant_id = ?
          `)
          .run(merchantId);
      }
    };
  }

  ensureDefaultCountry(merchantId: string): MerchantCountryRecord {
    const id = `${merchantId}:default`;
    this.db.sqlite.prepare(`
      INSERT OR IGNORE INTO merchant_countries
        (id, merchant_id, code, name, default_language)
      VALUES (?, ?, 'default', '默认国家', 'unknown')
    `).run(id, merchantId);
    return this.getMerchantCountry(id)!;
  }

  defaultCountryId(merchantId: string): string {
    return this.ensurePrimaryCountry(merchantId).id;
  }

  ensurePrimaryCountry(merchantId: string): MerchantCountryRecord {
    this.ensureDefaultCountry(merchantId);
    const row = this.db.sqlite
      .prepare(`
        SELECT *
        FROM merchant_countries
        WHERE merchant_id = ? AND status = 'active'
        ORDER BY CASE WHEN code = 'default' THEN 1 ELSE 0 END, updated_at DESC, created_at DESC
        LIMIT 1
      `)
      .get(merchantId) as Record<string, unknown> | undefined;
    return row ? mapMerchantCountry(row) : this.ensureDefaultCountry(merchantId);
  }

  validCountryId(merchantId: string, countryId: string): string {
    if (!countryId) return "";
    const row = this.db.sqlite.prepare("SELECT id FROM merchant_countries WHERE id = ? AND merchant_id = ?").get(countryId, merchantId) as { id: string } | undefined;
    return row?.id ?? "";
  }

  getMerchantCountry(id: string): MerchantCountryRecord | undefined {
    const row = this.db.sqlite.prepare("SELECT * FROM merchant_countries WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? mapMerchantCountry(row) : undefined;
  }

  listMerchantCountries(merchantId: string): MerchantCountryRecord[] {
    return [this.ensurePrimaryCountry(merchantId)];
  }

  createMerchantCountry(merchantId: string, input: Record<string, unknown>): MerchantCountryRecord {
    const current = this.ensurePrimaryCountry(merchantId);
    const profile = inferCountryProfile(input, current);
    const code = profile.code;
    const id = current.id;
    this.db.sqlite.prepare("DELETE FROM merchant_countries WHERE merchant_id = ? AND code = ? AND id != ?").run(merchantId, code, id);
    this.db.sqlite.prepare(`
      UPDATE merchant_countries
      SET code = ?,
          name = ?,
          default_language = ?,
          platform_register_url = ?,
          tg_register_guide_url = ?,
          require_platform_account = ?,
          require_phone = ?,
          require_telegram = ?,
          require_whatsapp = ?,
          status = 'active',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND merchant_id = ?
    `).run(
      code,
      profile.name,
      profile.defaultLanguage,
      String(input.platformRegisterUrl ?? current.platformRegisterUrl ?? ""),
      String(input.tgRegisterGuideUrl ?? current.tgRegisterGuideUrl ?? ""),
      booleanPatchValue(input.requirePlatformAccount, current.requirePlatformAccount),
      booleanPatchValue(input.requirePhone, current.requirePhone),
      booleanPatchValue(input.requireTelegram, current.requireTelegram),
      booleanPatchValue(input.requireWhatsApp, current.requireWhatsApp),
      id,
      merchantId
    );
    this.reassignMerchantToSingleCountry(merchantId, id);
    return this.getMerchantCountry(id)!;
  }

  patchMerchantCountry(id: string, merchantId: string, patch: Record<string, unknown>): MerchantCountryRecord | undefined {
    const allowed: Record<string, string> = {
      code: "code",
      name: "name",
      defaultLanguage: "default_language",
      platformRegisterUrl: "platform_register_url",
      tgRegisterGuideUrl: "tg_register_guide_url",
      requirePlatformAccount: "require_platform_account",
      requirePhone: "require_phone",
      requireTelegram: "require_telegram",
      requireWhatsApp: "require_whatsapp",
      status: "status"
    };
    const entries = Object.entries(patch).filter(([key]) => key in allowed);
    if (entries.length) {
      const current = this.getMerchantCountry(id);
      const normalizedPatch = { ...patch };
      if (current && ("name" in patch || "code" in patch || "defaultLanguage" in patch)) {
        const profile = inferCountryProfile(patch, current);
        normalizedPatch.code = profile.code;
        normalizedPatch.name = profile.name;
        normalizedPatch.defaultLanguage = profile.defaultLanguage;
      }
      if (typeof normalizedPatch.code === "string" && normalizedPatch.code.trim()) {
        this.db.sqlite.prepare("DELETE FROM merchant_countries WHERE merchant_id = ? AND code = ? AND id != ?").run(merchantId, normalizedPatch.code.trim(), id);
      }
      const normalizedEntries = Object.entries(normalizedPatch).filter(([key]) => key in allowed);
      const assignments = normalizedEntries.map(([key]) => `${allowed[key]} = ?`).join(", ");
      const values = normalizedEntries.map(([key, value]) => {
        if (key.startsWith("require")) return value ? 1 : 0;
        return String(value ?? "");
      }) as Array<string | number>;
      this.db.sqlite.prepare(`UPDATE merchant_countries SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND merchant_id = ?`).run(...values, id, merchantId);
      this.reassignMerchantToSingleCountry(merchantId, id);
    }
    const row = this.db.sqlite.prepare("SELECT * FROM merchant_countries WHERE id = ? AND merchant_id = ?").get(id, merchantId) as Record<string, unknown> | undefined;
    return row ? mapMerchantCountry(row) : undefined;
  }

  countryIdForA2CAccount(merchantId: string, apiPhone: string): string {
    void apiPhone;
    return this.defaultCountryId(merchantId);
  }

  patchMerchantConfig(merchantId: string, patch: Record<string, unknown>): MerchantConfigRecord {
    const allowed: Record<string, string> = {
      a2cBaseUrl: "a2c_base_url",
      a2cAppId: "a2c_app_id",
      a2cAppSecret: "a2c_app_secret",
      a2cAccountPhone: "a2c_account_phone",
      openaiApiKey: "openai_api_key",
      openaiModel: "openai_model",
      aiProvider: "ai_provider",
      minimaxApiKey: "minimax_api_key",
      minimaxModel: "minimax_model",
      googleAiApiKey: "google_ai_api_key",
      googleAiModel: "google_ai_model",
      telegramBotToken: "telegram_bot_token",
      telegramHandoffChatId: "telegram_handoff_chat_id",
      telegramHandoffChatTitle: "telegram_handoff_chat_title",
      telegramHandoffChatStatus: "telegram_handoff_chat_status",
      telegramHandoffChatError: "telegram_handoff_chat_error",
      smartReplyEnabled: "smart_reply_enabled",
      trainingSimulationEnabled: "training_simulation_enabled",
      strictScriptFlowEnabled: "strict_script_flow_enabled",
      platformRegisterUrl: "platform_register_url",
      tgRegisterGuideUrl: "tg_register_guide_url",
      registrationTutorialImageUrl: "registration_tutorial_image_url"
    };
    this.db.sqlite.prepare("INSERT OR IGNORE INTO merchant_configs (merchant_id) VALUES (?)").run(merchantId);
    const entries = Object.entries(patch).filter(([key, value]) => key in allowed && (typeof value === "string" || typeof value === "boolean"));
    if (entries.length) {
      const assignments = entries.map(([key]) => `${allowed[key]} = ?`).join(", ");
      this.db.sqlite.prepare(`UPDATE merchant_configs SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?`).run(...entries.map(([key, value]) => {
        if (key === "smartReplyEnabled") return booleanPatchValue(value, true);
        if (key === "trainingSimulationEnabled") return booleanPatchValue(value, false);
        if (key === "strictScriptFlowEnabled") return booleanPatchValue(value, false);
        if (key === "aiProvider") return value === "gemini" ? "gemini" : "minimax";
        return value as string;
      }), merchantId);
    }
    return this.getMerchantConfig(merchantId);
  }

  listMerchantA2CAccounts(filters: { merchantId?: string; enabled?: boolean } = {}): MerchantA2CAccountRecord[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filters.merchantId) {
      clauses.push("a.merchant_id = ?");
      params.push(filters.merchantId);
    }
    if (typeof filters.enabled === "boolean") {
      clauses.push("a.enabled = ?");
      params.push(filters.enabled ? 1 : 0);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.db.sqlite
      .prepare(`
        SELECT a.*, co.code AS country_code, co.name AS country_name, co.default_language
        FROM merchant_a2c_accounts a
        LEFT JOIN merchant_countries co ON co.id = a.country_id
        ${where}
        ORDER BY a.enabled DESC, a.api_phone ASC
      `)
      .all(...params)
      .map((row) => mapMerchantA2CAccount(row as Record<string, unknown>));
  }

  syncMerchantA2CAccounts(merchantId: string, accounts: A2CAccount[]): MerchantA2CAccountRecord[] {
    this.db.sqlite.prepare("INSERT OR IGNORE INTO merchant_configs (merchant_id) VALUES (?)").run(merchantId);
    const defaultCountryId = this.defaultCountryId(merchantId);
    const upsert = this.db.sqlite.prepare(`
      INSERT INTO merchant_a2c_accounts
        (merchant_id, country_id, api_phone, waba_id, status, number_status, quality_rating, messaging_limit, verified_name, enabled, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(merchant_id, api_phone) DO UPDATE SET
        country_id = excluded.country_id,
        waba_id = excluded.waba_id,
        status = excluded.status,
        number_status = excluded.number_status,
        quality_rating = excluded.quality_rating,
        messaging_limit = excluded.messaging_limit,
        verified_name = excluded.verified_name,
        synced_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `);
    this.db.sqlite.exec("BEGIN");
    try {
      for (const account of accounts) {
        const apiPhone = String(account.apiPhone || "").trim();
        if (!apiPhone) continue;
        upsert.run(
          merchantId,
          defaultCountryId,
          apiPhone,
          account.wabaId ?? "",
          Number(account.status ?? 0),
          Number(account.numberStatus ?? 0),
          Number(account.qualityRating ?? 0),
          Number(account.messagingLimit ?? 0),
          account.verifiedName ?? ""
        );
      }
      this.db.sqlite.exec("COMMIT");
    } catch (error) {
      this.db.sqlite.exec("ROLLBACK");
      throw error;
    }
    this.refreshMerchantA2CAccountPhones(merchantId);
    return this.listMerchantA2CAccounts({ merchantId });
  }

  patchMerchantA2CAccount(id: number, patch: Record<string, unknown>, merchantId?: string): MerchantA2CAccountRecord | undefined {
    const row = this.db.sqlite
      .prepare(`SELECT * FROM merchant_a2c_accounts WHERE id = ? ${merchantId ? "AND merchant_id = ?" : ""}`)
      .get(id, ...(merchantId ? [merchantId] : [])) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    const account = mapMerchantA2CAccount(row);
    const updates: string[] = [];
    const values: Array<string | number> = [];
    if (typeof patch.enabled === "boolean") {
      updates.push("enabled = ?");
      values.push(patch.enabled ? 1 : 0);
    }
    if (typeof patch.countryId === "string") {
      updates.push("country_id = ?");
      values.push(this.defaultCountryId(account.merchantId));
    }
    if (updates.length) {
      this.db.sqlite
        .prepare(`UPDATE merchant_a2c_accounts SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(...values, id);
      this.refreshMerchantA2CAccountPhones(account.merchantId);
    }
    return this.listMerchantA2CAccounts({ merchantId: account.merchantId }).find((item) => item.id === id);
  }

  private reassignMerchantToSingleCountry(merchantId: string, countryId: string): void {
    if (!this.validCountryId(merchantId, countryId)) return;
    this.db.sqlite
      .prepare(`
        DELETE FROM customer_memories
        WHERE merchant_id = ?
          AND id NOT IN (
            SELECT MAX(id)
            FROM customer_memories
            WHERE merchant_id = ?
            GROUP BY customer_key
          )
      `)
      .run(merchantId, merchantId);
    this.db.sqlite.prepare("UPDATE merchant_countries SET status = CASE WHEN id = ? THEN 'active' ELSE 'disabled' END, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?").run(countryId, merchantId);
    this.db.sqlite.prepare("UPDATE merchant_a2c_accounts SET country_id = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?").run(countryId, merchantId);
    this.db.sqlite.prepare("UPDATE conversations SET country_id = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?").run(countryId, merchantId);
    this.db.sqlite.prepare("UPDATE customers SET country_id = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?").run(countryId, merchantId);
    this.db.sqlite.prepare("UPDATE customer_memories SET country_id = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?").run(countryId, merchantId);
    this.db.sqlite.prepare("UPDATE training_samples SET country_id = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?").run(countryId, merchantId);
    this.db.sqlite.prepare("UPDATE knowledge_items SET country_id = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?").run(countryId, merchantId);
    this.db.sqlite.prepare("UPDATE training_materials SET country_id = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?").run(countryId, merchantId);
    this.db.sqlite.prepare("UPDATE training_material_items SET country_id = ? WHERE merchant_id = ?").run(countryId, merchantId);
    this.db.sqlite.prepare("UPDATE a2c_invite_codes SET country_id = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?").run(countryId, merchantId);
  }

  listInviteCodesForA2CAccount(accountId: number, merchantId?: string): A2CInviteCodeRecord[] {
    const account = this.getMerchantA2CAccount(accountId, merchantId);
    if (!account) return [];
    return this.db.sqlite
      .prepare(`
        SELECT ic.*, co.code AS country_code, co.name AS country_name
        FROM a2c_invite_codes ic
        LEFT JOIN merchant_countries co ON co.id = ic.country_id
        WHERE ic.a2c_account_id = ? AND ic.merchant_id = ?
        ORDER BY
          CASE ic.status WHEN 'available' THEN 0 WHEN 'reserved' THEN 1 WHEN 'used' THEN 2 ELSE 3 END,
          ic.id DESC
      `)
      .all(account.id, account.merchantId)
      .map((row) => mapA2CInviteCode(row as Record<string, unknown>));
  }

  createInviteCodeForA2CAccount(accountId: number, input: Record<string, unknown>, merchantId?: string): A2CInviteCodeRecord {
    const account = this.getMerchantA2CAccount(accountId, merchantId);
    if (!account) throw new Error("a2c account not found");
    const code = String(input.code || "").trim();
    if (!code) throw new Error("invite code is required");
    const registerUrl = String(input.registerUrl || "").trim();
    const status = normalizeInviteCodeStatus(input.status, "available");
    this.db.sqlite
      .prepare(`
        INSERT INTO a2c_invite_codes
          (merchant_id, country_id, a2c_account_id, a2c_account_phone, code, register_url, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(merchant_id, a2c_account_phone, code) DO UPDATE SET
          country_id = excluded.country_id,
          a2c_account_id = excluded.a2c_account_id,
          register_url = excluded.register_url,
          status = CASE WHEN a2c_invite_codes.status = 'used' THEN a2c_invite_codes.status ELSE excluded.status END,
          updated_at = CURRENT_TIMESTAMP
      `)
      .run(account.merchantId, account.countryId, account.id, account.apiPhone, code, registerUrl, status);
    const row = this.db.sqlite
      .prepare(`
        SELECT ic.*, co.code AS country_code, co.name AS country_name
        FROM a2c_invite_codes ic
        LEFT JOIN merchant_countries co ON co.id = ic.country_id
        WHERE ic.merchant_id = ? AND ic.a2c_account_phone = ? AND ic.code = ?
      `)
      .get(account.merchantId, account.apiPhone, code) as Record<string, unknown>;
    return mapA2CInviteCode(row);
  }

  importInviteCodesForA2CAccount(accountId: number, input: { codes?: string; registerUrl?: string }, merchantId?: string): { imported: number; rows: A2CInviteCodeRecord[] } {
    const account = this.getMerchantA2CAccount(accountId, merchantId);
    if (!account) throw new Error("a2c account not found");
    const registerUrl = String(input.registerUrl || "").trim();
    const codes = String(input.codes || "")
      .split(/[\n,，;\t ]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    const uniqueCodes = [...new Set(codes)];
    let imported = 0;
    const insert = this.db.sqlite.prepare(`
      INSERT INTO a2c_invite_codes
        (merchant_id, country_id, a2c_account_id, a2c_account_phone, code, register_url, status)
      VALUES (?, ?, ?, ?, ?, ?, 'available')
      ON CONFLICT(merchant_id, a2c_account_phone, code) DO UPDATE SET
        country_id = excluded.country_id,
        a2c_account_id = excluded.a2c_account_id,
        register_url = CASE WHEN excluded.register_url != '' THEN excluded.register_url ELSE a2c_invite_codes.register_url END,
        updated_at = CURRENT_TIMESTAMP
    `);
    this.db.sqlite.exec("BEGIN");
    try {
      for (const code of uniqueCodes) {
        const result = insert.run(account.merchantId, account.countryId, account.id, account.apiPhone, code, registerUrl);
        if (result.changes > 0) imported += 1;
      }
      this.db.sqlite.exec("COMMIT");
    } catch (error) {
      this.db.sqlite.exec("ROLLBACK");
      throw error;
    }
    return { imported, rows: this.listInviteCodesForA2CAccount(account.id, account.merchantId) };
  }

  patchInviteCode(id: number, patch: Record<string, unknown>, merchantId?: string): A2CInviteCodeRecord | undefined {
    const existing = this.getInviteCode(id, merchantId);
    if (!existing) return undefined;
    const allowed: Record<string, string> = {
      code: "code",
      registerUrl: "register_url",
      status: "status",
      assignedCustomerKey: "assigned_customer_key",
      assignedConversationId: "assigned_conversation_id",
      platformAccount: "platform_account"
    };
    const entries = Object.entries(patch).filter(([key]) => key in allowed);
    if (entries.length) {
      const assignments = entries.map(([key]) => `${allowed[key]} = ?`).join(", ");
      const values = entries.map(([key, value]) => key === "status" ? normalizeInviteCodeStatus(value, existing.status) : String(value ?? ""));
      this.db.sqlite
        .prepare(`UPDATE a2c_invite_codes SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND merchant_id = ?`)
        .run(...values, id, existing.merchantId);
    }
    return this.getInviteCode(id, existing.merchantId);
  }

  deleteInviteCode(id: number, merchantId?: string): boolean {
    const existing = this.getInviteCode(id, merchantId);
    if (!existing) return false;
    const result = this.db.sqlite.prepare("DELETE FROM a2c_invite_codes WHERE id = ? AND merchant_id = ?").run(id, existing.merchantId);
    return result.changes > 0;
  }

  reserveInviteCodeForConversation(conversation: Pick<Conversation, "id" | "merchantId" | "countryId" | "customerPhone" | "a2cAccountPhone">): A2CInviteCodeRecord | undefined {
    const existing = this.db.sqlite
      .prepare(`
        SELECT ic.*, co.code AS country_code, co.name AS country_name
        FROM a2c_invite_codes ic
        LEFT JOIN merchant_countries co ON co.id = ic.country_id
        WHERE ic.merchant_id = ? AND ic.assigned_conversation_id = ? AND ic.status IN ('reserved', 'used')
        ORDER BY ic.id DESC
        LIMIT 1
      `)
      .get(conversation.merchantId, conversation.id) as Record<string, unknown> | undefined;
    if (existing) return mapA2CInviteCode(existing);

    const availableRows = this.db.sqlite
      .prepare(`
        SELECT ic.*, co.code AS country_code, co.name AS country_name
        FROM a2c_invite_codes ic
        LEFT JOIN merchant_countries co ON co.id = ic.country_id
        WHERE ic.merchant_id = ?
          AND ic.status = 'available'
        ORDER BY
          CASE WHEN ic.country_id = ? THEN 0 WHEN ic.country_id = '' THEN 1 ELSE 2 END,
          ic.id ASC
        LIMIT 200
      `)
      .all(conversation.merchantId, conversation.countryId) as Array<Record<string, unknown>>;
    const available =
      availableRows.find((row) => inviteCodeAccountMatches(String(row.a2c_account_phone ?? ""), conversation.a2cAccountPhone)) ??
      availableRows.find((row) => String(row.country_id ?? "") === conversation.countryId) ??
      availableRows.find((row) => String(row.country_id ?? "") === "") ??
      availableRows[0];
    if (!available) return undefined;

    const code = mapA2CInviteCode(available);
    this.db.sqlite
      .prepare(`
        UPDATE a2c_invite_codes
        SET status = 'reserved',
            country_id = ?,
            assigned_customer_key = ?,
            assigned_conversation_id = ?,
            assigned_at = COALESCE(NULLIF(assigned_at, ''), CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND merchant_id = ? AND status = 'available'
      `)
      .run(conversation.countryId, conversation.customerPhone, conversation.id, code.id, conversation.merchantId);
    return this.getInviteCode(code.id, conversation.merchantId);
  }

  markInviteCodeUsedForConversation(conversationId: string, merchantId: string, platformAccount = ""): A2CInviteCodeRecord | undefined {
    const existing = this.db.sqlite
      .prepare(`
        SELECT ic.*, co.code AS country_code, co.name AS country_name
        FROM a2c_invite_codes ic
        LEFT JOIN merchant_countries co ON co.id = ic.country_id
        WHERE ic.merchant_id = ? AND ic.assigned_conversation_id = ? AND ic.status IN ('reserved', 'available')
        ORDER BY ic.id DESC
        LIMIT 1
      `)
      .get(merchantId, conversationId) as Record<string, unknown> | undefined;
    if (!existing) return undefined;
    const code = mapA2CInviteCode(existing);
    this.db.sqlite
      .prepare(`
        UPDATE a2c_invite_codes
        SET status = 'used',
            platform_account = CASE WHEN ? != '' THEN ? ELSE platform_account END,
            used_at = COALESCE(NULLIF(used_at, ''), CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND merchant_id = ?
      `)
      .run(platformAccount, platformAccount, code.id, merchantId);
    return this.getInviteCode(code.id, merchantId);
  }

  getMerchantA2CAccount(id: number, merchantId?: string): MerchantA2CAccountRecord | undefined {
    const row = this.db.sqlite
      .prepare(`SELECT * FROM merchant_a2c_accounts WHERE id = ? ${merchantId ? "AND merchant_id = ?" : ""}`)
      .get(id, ...(merchantId ? [merchantId] : [])) as Record<string, unknown> | undefined;
    return row ? mapMerchantA2CAccount(row) : undefined;
  }

  getInviteCode(id: number, merchantId?: string): A2CInviteCodeRecord | undefined {
    const row = this.db.sqlite
      .prepare(`
        SELECT ic.*, co.code AS country_code, co.name AS country_name
        FROM a2c_invite_codes ic
        LEFT JOIN merchant_countries co ON co.id = ic.country_id
        WHERE ic.id = ? ${merchantId ? "AND ic.merchant_id = ?" : ""}
      `)
      .get(id, ...(merchantId ? [merchantId] : [])) as Record<string, unknown> | undefined;
    return row ? mapA2CInviteCode(row) : undefined;
  }

  refreshMerchantA2CAccountPhones(merchantId: string): MerchantConfigRecord {
    const phones = this.listMerchantA2CAccounts({ merchantId, enabled: true }).map((account) => account.apiPhone).join(",");
    this.db.sqlite.prepare("INSERT OR IGNORE INTO merchant_configs (merchant_id) VALUES (?)").run(merchantId);
    this.db.sqlite
      .prepare("UPDATE merchant_configs SET a2c_account_phone = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?")
      .run(phones, merchantId);
    return this.getMerchantConfig(merchantId);
  }

  updateTelegramBinding(merchantId: string, input: { chatId?: string; chatTitle?: string; status: MerchantConfigRecord["telegramHandoffChatStatus"]; error?: string }): MerchantConfigRecord {
    this.db.sqlite.prepare("INSERT OR IGNORE INTO merchant_configs (merchant_id) VALUES (?)").run(merchantId);
    this.db.sqlite
      .prepare(`
        UPDATE merchant_configs
        SET telegram_handoff_chat_id = COALESCE(?, telegram_handoff_chat_id),
            telegram_handoff_chat_title = COALESCE(?, telegram_handoff_chat_title),
            telegram_handoff_chat_status = ?,
            telegram_handoff_chat_error = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE merchant_id = ?
      `)
      .run(input.chatId ?? null, input.chatTitle ?? null, input.status, input.error ?? "", merchantId);
    return this.getMerchantConfig(merchantId);
  }

  markTelegramBindingInvalid(merchantId: string, error: string): MerchantConfigRecord {
    return this.updateTelegramBinding(merchantId, { status: "invalid", error });
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
    const row = this.db.sqlite.prepare("SELECT * FROM users WHERE lower(email) = lower(?)").get(email) as Record<string, unknown> | undefined;
    return row ? mapUser(row) : undefined;
  }

  getUserById(id: string): UserRecord | undefined {
    const row = this.db.sqlite.prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? mapUser(row) : undefined;
  }

  listUsers(filters: { merchantId?: string } = {}): UserRecord[] {
    const where = filters.merchantId ? "WHERE merchant_id = ?" : "";
    const params = filters.merchantId ? [filters.merchantId] : [];
    return this.db.sqlite.prepare(`SELECT * FROM users ${where} ORDER BY created_at DESC`).all(...params).map((row) => mapUser(row as Record<string, unknown>));
  }

  createUser(input: { merchantId: string | null; email: string; name: string; passwordHash: string; role: UserRole }): UserRecord {
    const id = randomUUID();
    this.db.sqlite
      .prepare("INSERT INTO users (id, merchant_id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, input.merchantId, input.email, input.name, input.passwordHash, input.role);
    return this.getUserById(id)!;
  }

  resetPlatformAdmin(input: { email: string; passwordHash: string; name?: string }): UserRecord {
    const existing = this.getUserByEmail(input.email);
    if (existing) {
      return this.patchUser(existing.id, {
        name: input.name ?? existing.name,
        status: "active",
        passwordHash: input.passwordHash,
        role: "platform_admin",
        merchantId: null
      })!;
    }
    return this.createUser({
      merchantId: null,
      email: input.email,
      name: input.name ?? "平台管理员",
      passwordHash: input.passwordHash,
      role: "platform_admin"
    });
  }

  patchUser(id: string, patch: { name?: string; status?: string; passwordHash?: string; role?: UserRole; merchantId?: string | null }): UserRecord | undefined {
    const assignments = ["updated_at = CURRENT_TIMESTAMP"];
    const values: Array<string | null> = [];
    if (patch.name !== undefined) {
      assignments.push("name = ?");
      values.push(patch.name);
    }
    if (patch.status !== undefined) {
      assignments.push("status = ?");
      values.push(patch.status);
    }
    if (patch.passwordHash !== undefined) {
      assignments.push("password_hash = ?");
      values.push(patch.passwordHash);
    }
    if (patch.role !== undefined) {
      assignments.push("role = ?");
      values.push(patch.role);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "merchantId")) {
      assignments.push("merchant_id = ?");
      values.push(patch.merchantId ?? null);
    }
    this.db.sqlite.prepare(`UPDATE users SET ${assignments.join(", ")} WHERE id = ?`).run(...values, id);
    return this.getUserById(id);
  }

  deleteUser(id: string): boolean {
    const result = this.db.sqlite.prepare("DELETE FROM users WHERE id = ?").run(id);
    return result.changes > 0;
  }

  updateHandoffStatus(conversationId: string, merchantId: string, handoffStatus: "pending" | "processing" | "done"): Conversation | undefined {
    this.db.sqlite
      .prepare("UPDATE conversations SET handoff_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND merchant_id = ?")
      .run(handoffStatus, conversationId, merchantId);
    const row = this.db.sqlite.prepare("SELECT * FROM conversations WHERE id = ? AND merchant_id = ?").get(conversationId, merchantId) as Record<string, unknown> | undefined;
    return row ? mapConversation(row) : undefined;
  }

  listDueFollowUpCandidates(limit = 50): FollowUpCandidate[] {
    return this.db.sqlite
      .prepare(`
        WITH last_messages AS (
          SELECT m.*
          FROM messages m
          JOIN (
            SELECT conversation_id, MAX(id) AS last_id
            FROM messages
            GROUP BY conversation_id
          ) lm ON lm.last_id = m.id
        )
        SELECT c.*, co.code AS country_code, co.name AS country_name,
               lm.id AS last_message_id, lm.created_at AS last_message_at
        FROM conversations c
        JOIN last_messages lm ON lm.conversation_id = c.id
        LEFT JOIN merchant_countries co ON co.id = c.country_id
        LEFT JOIN conversation_followups f
          ON f.conversation_id = c.id
         AND f.flow_step = COALESCE(NULLIF(c.flow_step, ''), c.stage)
         AND f.followup_type = 'idle_2m'
        WHERE c.status = 'active'
          AND lm.direction = 'outbound'
          AND lm.created_at <= datetime('now', '-2 minutes')
          AND COALESCE(c.flow_step, '') NOT IN ('', 'human_handoff', 'ended')
          AND lm.raw_payload NOT LIKE '%"a2cSendStatus":"failed"%'
          AND lm.raw_payload NOT LIKE '%"simulation":true%'
          AND f.id IS NULL
        ORDER BY lm.created_at ASC
        LIMIT ?
      `)
      .all(Math.min(Math.max(limit, 1), 200))
      .map((row) => ({
        conversation: mapConversation(row as Record<string, unknown>),
        lastMessageId: Number((row as Record<string, unknown>).last_message_id ?? 0),
        lastMessageAt: String((row as Record<string, unknown>).last_message_at ?? "")
      }));
  }

  recordFollowUp(input: { merchantId: string; conversationId: string; flowStep: string; type?: string; sent: boolean; error?: string }): boolean {
    try {
      const result = this.db.sqlite
        .prepare(`
          INSERT INTO conversation_followups
            (merchant_id, conversation_id, flow_step, followup_type, sent, error)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .run(input.merchantId, input.conversationId, input.flowStep || "unknown", input.type || "idle_2m", input.sent ? 1 : 0, input.error || "");
      return Number(result.changes ?? 0) > 0;
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE")) return false;
      throw error;
    }
  }
}

function mapConversation(row: Record<string, unknown>): Conversation {
  return {
    id: String(row.id),
    merchantId: String(row.merchant_id ?? "default"),
    countryId: String(row.country_id ?? `${String(row.merchant_id ?? "default")}:default`),
    countryCode: String(row.country_code ?? "default"),
    countryName: String(row.country_name ?? "默认国家"),
    customerPhone: String(row.customer_phone),
    a2cAccountPhone: String(row.a2c_account_phone),
    nickname: String(row.nickname ?? ""),
    language: String(row.language ?? "unknown"),
    stage: String(row.stage ?? "need_platform_register") as ConversationStage,
    flowStep: String(row.flow_step ?? ""),
    extractedPhone: String(row.extracted_phone ?? ""),
    extractedTelegram: String(row.extracted_telegram ?? ""),
    extractedWhatsApp: String(row.extracted_whatsapp ?? ""),
    status: String(row.status ?? "active") as "active" | "human_handoff",
    handoffStatus: String(row.handoff_status ?? "pending") as "pending" | "processing" | "done",
    handoffNotified: Number(row.handoff_notified ?? 0),
    unreadCount: Number(row.unread_count ?? 0),
    pinnedAt: String(row.pinned_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

function mapConversationMessage(row: Record<string, unknown>): ConversationMessageRecord {
  return {
    id: Number(row.id ?? 0),
    direction: String(row.direction),
    content: String(row.content ?? ""),
    msgType: String(row.msg_type ?? "text"),
    language: String(row.language ?? "unknown"),
    intent: String(row.intent ?? "unknown"),
    rawPayload: parseJsonObject(row.raw_payload),
    createdAt: String(row.created_at ?? "")
  };
}

function mapConversationExportRecord(row: Record<string, unknown>): ConversationExportRecord {
  const rawPayload = parseJsonObject(row.raw_payload);
  return {
    merchantId: String(row.merchant_id ?? "default"),
    countryId: String(row.country_id ?? ""),
    countryCode: String(row.country_code ?? "default"),
    countryName: String(row.country_name ?? "默认国家"),
    conversationId: String(row.conversation_id ?? ""),
    customerPhone: String(row.customer_phone ?? ""),
    nickname: String(row.nickname ?? ""),
    a2cAccountPhone: String(row.a2c_account_phone ?? ""),
    conversationLanguage: String(row.conversation_language ?? "unknown"),
    conversationStage: String(row.conversation_stage ?? ""),
    flowStep: String(row.flow_step ?? ""),
    conversationStatus: String(row.conversation_status ?? ""),
    handoffStatus: String(row.handoff_status ?? ""),
    extractedPhone: String(row.extracted_phone ?? ""),
    extractedTelegram: String(row.extracted_telegram ?? ""),
    extractedWhatsApp: String(row.extracted_whatsapp ?? ""),
    messageId: Number(row.message_id ?? 0),
    direction: String(row.direction ?? ""),
    msgType: String(row.msg_type ?? "text"),
    messageLanguage: String(row.message_language ?? "unknown"),
    intent: String(row.intent ?? "unknown"),
    content: String(row.content ?? ""),
    originalContent: String(rawPayload.originalContent ?? row.content ?? ""),
    translatedContent: String(rawPayload.translatedContent ?? ""),
    targetLanguage: String(rawPayload.targetLanguage ?? ""),
    operatorTranslatedContent: String(rawPayload.operatorTranslatedContent ?? ""),
    replyMode: String(rawPayload.replyMode ?? ""),
    strictFlowStep: String(rawPayload.strictFlowStep ?? ""),
    a2cSendStatus: String(rawPayload.a2cSendStatus ?? ""),
    a2cSendError: String(rawPayload.a2cSendError ?? ""),
    phoneDetected: String(row.phone_detected ?? ""),
    telegramDetected: String(row.telegram_detected ?? ""),
    whatsappDetected: String(rawPayload.whatsappDetected ?? ""),
    externalId: String(row.external_id ?? ""),
    createdAt: String(row.created_at ?? "")
  };
}

function mapIntentLearningEvent(row: Record<string, unknown>): IntentLearningEventRecord {
  return {
    id: Number(row.id ?? 0),
    merchantId: String(row.merchant_id ?? "default"),
    countryId: String(row.country_id ?? ""),
    conversationId: String(row.conversation_id ?? ""),
    messageId: row.message_id === null || row.message_id === undefined ? null : Number(row.message_id),
    candidateKey: String(row.candidate_key ?? ""),
    suggestedIntent: String(row.suggested_intent ?? "custom_unknown"),
    displayName: String(row.display_name ?? ""),
    description: String(row.description ?? ""),
    customerText: String(row.customer_text ?? ""),
    language: String(row.language ?? "unknown"),
    detectedIntent: String(row.detected_intent ?? "unknown"),
    inferredIntent: String(row.inferred_intent ?? "unknown"),
    contextualIntent: String(row.contextual_intent ?? "unknown"),
    flowStep: String(row.flow_step ?? ""),
    status: String(row.status ?? "candidate") as IntentLearningEventRecord["status"],
    occurrenceCount: Number(row.occurrence_count ?? 0),
    examples: parseJsonRecordArray(row.examples_json),
    lastSeenAt: String(row.last_seen_at ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

function mapMerchant(row: Record<string, unknown>): MerchantRecord {
  return { id: String(row.id), name: String(row.name), status: String(row.status ?? "active") as "active" | "disabled" };
}

function mapMerchantConfig(row: Record<string, unknown>): MerchantConfigRecord {
  return {
    merchantId: String(row.merchant_id),
    a2cBaseUrl: String(row.a2c_base_url ?? ""),
    a2cAppId: String(row.a2c_app_id ?? ""),
    a2cAppSecret: String(row.a2c_app_secret ?? ""),
    a2cAccountPhone: String(row.a2c_account_phone ?? ""),
    openaiApiKey: String(row.openai_api_key ?? ""),
    openaiModel: String(row.openai_model ?? "gpt-5-mini"),
    aiProvider: row.ai_provider === "gemini" ? "gemini" : "minimax",
    minimaxApiKey: String(row.minimax_api_key ?? ""),
    minimaxModel: String(row.minimax_model ?? "MiniMax-M3"),
    googleAiApiKey: String(row.google_ai_api_key ?? ""),
    googleAiModel: String(row.google_ai_model ?? "gemini-2.5-flash"),
    telegramBotToken: String(row.telegram_bot_token ?? ""),
    telegramHandoffChatId: String(row.telegram_handoff_chat_id ?? ""),
    telegramHandoffChatTitle: String(row.telegram_handoff_chat_title ?? ""),
    telegramHandoffChatStatus: normalizeTelegramBindingStatus(row.telegram_handoff_chat_status),
    telegramHandoffChatError: String(row.telegram_handoff_chat_error ?? ""),
    a2cTokenCacheKey: String(row.a2c_token_cache_key ?? ""),
    a2cAccessToken: String(row.a2c_access_token ?? ""),
    a2cTokenExpiresAt: Number(row.a2c_token_expires_at ?? 0),
    smartReplyEnabled: Boolean(Number(row.smart_reply_enabled ?? 1)),
    trainingSimulationEnabled: Boolean(Number(row.training_simulation_enabled ?? 0)),
    strictScriptFlowEnabled: Boolean(Number(row.strict_script_flow_enabled ?? 0)),
    platformRegisterUrl: String(row.platform_register_url ?? ""),
    tgRegisterGuideUrl: String(row.tg_register_guide_url ?? ""),
    registrationTutorialImageUrl: String(row.registration_tutorial_image_url ?? "")
  };
}

function mapMerchantAgentProfile(row: Record<string, unknown>): MerchantAgentProfileRecord {
  return {
    merchantId: String(row.merchant_id ?? "default"),
    agentName: String(row.agent_name ?? "开户注册接待专员"),
    roleDefinition: String(row.role_definition ?? "拥有10年开户注册接待经验的客户引导专员，负责自然、耐心地引导客户完成开户注册。"),
    toneStyle: String(row.tone_style ?? "简短、口语化、耐心、像真人客服，不长篇大论。"),
    coreGoal: String(row.core_goal ?? "引导客户完成开户注册并提交手机号和 Telegram。"),
    mustFollow: String(row.must_follow ?? "客户提问时先简短回答，再轻轻拉回当前流程；每次只处理当前最需要的一步。"),
    forbidden: String(row.forbidden ?? "不能暴露 AI、机器人、模型、自动客服身份；不能承诺固定收益；不能要求私下转账；不能收集密码、验证码、银行卡或证件敏感信息。"),
    uncertaintyPolicy: String(row.uncertainty_policy ?? "不确定的业务规则、收益、充值、任务细节，以页面说明或人工确认为准。"),
    handoffPolicy: String(row.handoff_policy ?? "客户提交手机号和 Telegram 后回复正在核实并转人工；客户强烈要求人工或连续无法解决时也可转人工。"),
    enabled: Boolean(Number(row.enabled ?? 1)),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

function mapConversationReview(row: Record<string, unknown>): ConversationReviewRecord {
  return {
    id: Number(row.id ?? 0),
    merchantId: String(row.merchant_id ?? "default"),
    conversationId: String(row.conversation_id ?? ""),
    score: Number(row.score ?? 0),
    goalCompleted: Boolean(Number(row.goal_completed ?? 0)),
    summary: String(row.summary ?? ""),
    mainConcerns: parseJsonArray(row.main_concerns_json),
    mistakes: parseJsonArray(row.mistakes_json),
    goodReplies: parseJsonArray(row.good_replies_json),
    suggestedSamples: parseJsonRecordArray(row.suggested_samples_json),
    suggestedKnowledge: parseJsonRecordArray(row.suggested_knowledge_json),
    improvementActions: parseJsonArray(row.improvement_actions_json),
    status: normalizeConversationReviewStatus(row.status),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

function mapConversationReviewItem(row: Record<string, unknown>): ConversationReviewItemRecord {
  return {
    id: Number(row.id ?? 0),
    reviewId: Number(row.review_id ?? 0),
    merchantId: String(row.merchant_id ?? "default"),
    conversationId: String(row.conversation_id ?? ""),
    itemType: normalizeConversationReviewItemType(row.item_type),
    title: String(row.title ?? ""),
    content: String(row.content ?? ""),
    status: normalizeConversationReviewItemStatus(row.status),
    appliedTargetType: String(row.applied_target_type ?? ""),
    appliedTargetId: String(row.applied_target_id ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

function mapMerchantA2CAccount(row: Record<string, unknown>): MerchantA2CAccountRecord {
  const merchantId = String(row.merchant_id ?? "default");
  return {
    id: Number(row.id),
    merchantId,
    countryId: String(row.country_id ?? `${merchantId}:default`),
    countryCode: String(row.country_code ?? "default"),
    countryName: String(row.country_name ?? "默认国家"),
    defaultLanguage: String(row.default_language ?? "unknown"),
    apiPhone: String(row.api_phone ?? ""),
    wabaId: String(row.waba_id ?? ""),
    status: Number(row.status ?? 0),
    numberStatus: Number(row.number_status ?? 0),
    qualityRating: Number(row.quality_rating ?? 0),
    messagingLimit: Number(row.messaging_limit ?? 0),
    verifiedName: String(row.verified_name ?? ""),
    enabled: Boolean(Number(row.enabled ?? 1)),
    syncedAt: String(row.synced_at ?? "")
  };
}

function mapA2CInviteCode(row: Record<string, unknown>): A2CInviteCodeRecord {
  const merchantId = String(row.merchant_id ?? "default");
  return {
    id: Number(row.id ?? 0),
    merchantId,
    countryId: String(row.country_id ?? `${merchantId}:default`),
    countryCode: String(row.country_code ?? "default"),
    countryName: String(row.country_name ?? "默认国家"),
    a2cAccountId: Number(row.a2c_account_id ?? 0),
    a2cAccountPhone: String(row.a2c_account_phone ?? ""),
    code: String(row.code ?? ""),
    registerUrl: String(row.register_url ?? ""),
    status: normalizeInviteCodeStatus(row.status, "available"),
    assignedCustomerKey: String(row.assigned_customer_key ?? ""),
    assignedConversationId: String(row.assigned_conversation_id ?? ""),
    platformAccount: String(row.platform_account ?? ""),
    assignedAt: String(row.assigned_at ?? ""),
    usedAt: String(row.used_at ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

function mapMerchantCountry(row: Record<string, unknown>): MerchantCountryRecord {
  return {
    id: String(row.id),
    merchantId: String(row.merchant_id ?? "default"),
    code: String(row.code ?? "default"),
    name: String(row.name ?? "默认国家"),
    defaultLanguage: String(row.default_language ?? "unknown"),
    platformRegisterUrl: String(row.platform_register_url ?? ""),
    tgRegisterGuideUrl: String(row.tg_register_guide_url ?? ""),
    requirePlatformAccount: Boolean(Number(row.require_platform_account ?? 1)),
    requirePhone: Boolean(Number(row.require_phone ?? 1)),
    requireTelegram: Boolean(Number(row.require_telegram ?? 1)),
    requireWhatsApp: Boolean(Number(row.require_whatsapp ?? 0)),
    status: String(row.status ?? "active") as "active" | "disabled"
  };
}

function mapUser(row: Record<string, unknown>): UserRecord {
  return {
    id: String(row.id),
    merchantId: row.merchant_id ? String(row.merchant_id) : null,
    email: String(row.email),
    name: String(row.name),
    passwordHash: String(row.password_hash),
    role: String(row.role) as UserRole,
    status: String(row.status ?? "active") as "active" | "disabled"
  };
}

function mapKnowledgeItem(row: Record<string, unknown>): KnowledgeItemRecord {
  return {
    id: Number(row.id),
    merchantId: String(row.merchant_id ?? "default"),
    countryId: String(row.country_id ?? `${String(row.merchant_id ?? "default")}:default`),
    type: normalizeKnowledgeType(row.type),
    title: String(row.title ?? ""),
    content: String(row.content ?? ""),
    language: String(row.language ?? "zh"),
    priority: Number(row.priority ?? 0),
    enabled: Boolean(Number(row.enabled ?? 1))
  };
}

function mapCustomer(row: Record<string, unknown>): CustomerRecord {
  const merchantId = String(row.merchant_id ?? "default");
  return {
    id: Number(row.id),
    merchantId,
    countryId: String(row.country_id ?? `${merchantId}:default`),
    countryCode: String(row.country_code ?? "default"),
    countryName: String(row.country_name ?? "默认国家"),
    customerKey: String(row.customer_key ?? ""),
    nickname: String(row.nickname ?? ""),
    firstA2CAccountPhone: String(row.first_a2c_account_phone ?? ""),
    lastA2CAccountPhone: String(row.last_a2c_account_phone ?? ""),
    language: String(row.language ?? "unknown"),
    stage: String(row.stage ?? "need_platform_register"),
    extractedPhone: String(row.extracted_phone ?? ""),
    extractedTelegram: String(row.extracted_telegram ?? ""),
    extractedWhatsApp: String(row.extracted_whatsapp ?? ""),
    status: String(row.status ?? "active") as "active" | "human_handoff",
    conversationCount: Number(row.conversation_count ?? 0),
    lastConversationId: String(row.last_conversation_id ?? ""),
    firstSeenAt: String(row.first_seen_at ?? ""),
    lastSeenAt: String(row.last_seen_at ?? "")
  };
}

function mapCustomerMemory(row: Record<string, unknown>): CustomerMemoryRecord {
  const merchantId = String(row.merchant_id ?? "default");
  return {
    id: Number(row.id),
    merchantId,
    countryId: String(row.country_id ?? `${merchantId}:default`),
    countryCode: String(row.country_code ?? "default"),
    countryName: String(row.country_name ?? "默认国家"),
    customerKey: String(row.customer_key ?? ""),
    conversationId: String(row.conversation_id ?? ""),
    language: String(row.language ?? "unknown"),
    stage: String(row.stage ?? "need_platform_register"),
    extractedPhone: String(row.extracted_phone ?? ""),
    extractedTelegram: String(row.extracted_telegram ?? ""),
    extractedWhatsApp: String(row.extracted_whatsapp ?? ""),
    lastIntent: String(row.last_intent ?? "unknown"),
    summary: String(row.summary ?? ""),
    facts: parseJsonObject(row.facts_json),
    operatorNotes: String(row.operator_notes ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

function mapTrainingMaterial(row: Record<string, unknown>): TrainingMaterialRecord {
  const merchantId = String(row.merchant_id ?? "default");
  return {
    id: Number(row.id),
    merchantId,
    countryId: String(row.country_id ?? `${merchantId}:default`),
    countryCode: String(row.country_code ?? "default"),
    countryName: String(row.country_name ?? "默认国家"),
    sourceType: String(row.source_type ?? "txt"),
    filename: String(row.filename ?? ""),
    mimeType: String(row.mime_type ?? ""),
    status: String(row.status ?? "enabled") as "enabled" | "disabled",
    rawText: String(row.raw_text ?? ""),
    itemCount: Number(row.item_count ?? 0),
    sampleCount: Number(row.sample_count ?? 0),
    knowledgeCount: Number(row.knowledge_count ?? 0),
    warnings: parseJsonArray(row.warnings_json),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

function mapTrainingMaterialItem(row: Record<string, unknown>): TrainingMaterialItemRecord {
  return {
    id: Number(row.id),
    materialId: Number(row.material_id),
    merchantId: String(row.merchant_id ?? "default"),
    countryId: String(row.country_id ?? `${String(row.merchant_id ?? "default")}:default`),
    kind: String(row.kind ?? "knowledge") as "sample" | "knowledge",
    sampleId: row.sample_id === null || row.sample_id === undefined ? null : Number(row.sample_id),
    knowledgeId: row.knowledge_id === null || row.knowledge_id === undefined ? null : Number(row.knowledge_id),
    title: String(row.title ?? ""),
    content: String(row.content ?? ""),
    intent: String(row.intent ?? "unknown"),
    stage: String(row.stage ?? ""),
    language: String(row.language ?? "zh"),
    enabled: Boolean(Number(row.enabled ?? 1))
  };
}

function mapScriptFlow(row: Record<string, unknown>): ScriptFlowRecord {
  const merchantId = String(row.merchant_id ?? "default");
  return {
    id: Number(row.id),
    merchantId,
    countryId: String(row.country_id ?? `${merchantId}:default`),
    countryCode: String(row.country_code ?? "default"),
    countryName: String(row.country_name ?? "默认国家"),
    name: String(row.name ?? ""),
    status: normalizeScriptFlowStatus(row.status),
    active: Boolean(Number(row.active ?? 0)),
    version: Number(row.version ?? 1),
    sourceFilename: String(row.source_filename ?? ""),
    stepCount: Number(row.step_count ?? 0),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

function mapScriptFlowStep(row: Record<string, unknown>): ScriptFlowStepRecord {
  return {
    id: Number(row.id),
    flowId: Number(row.flow_id),
    merchantId: String(row.merchant_id ?? "default"),
    countryId: String(row.country_id ?? `${String(row.merchant_id ?? "default")}:default`),
    flowCode: String(row.flow_code ?? ""),
    flowName: String(row.flow_name ?? ""),
    flowStep: String(row.flow_step ?? ""),
    goal: String(row.goal ?? ""),
    triggerCondition: String(row.trigger_condition ?? ""),
    customerExpressions: String(row.customer_expressions ?? ""),
    standardReply: String(row.standard_reply ?? ""),
    collectInfo: String(row.collect_info ?? ""),
    sendLink: Boolean(Number(row.send_link ?? 0)),
    sendInvite: Boolean(Number(row.send_invite ?? 0)),
    nextCondition: String(row.next_condition ?? ""),
    nextFlowCode: String(row.next_flow_code ?? ""),
    nextFlowStep: String(row.next_flow_step ?? ""),
    forbidden: String(row.forbidden ?? ""),
    notes: String(row.notes ?? ""),
    sortOrder: Number(row.sort_order ?? 0),
    enabled: Boolean(Number(row.enabled ?? 1)),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

function mapScriptFlowVersion(row: Record<string, unknown>): ScriptFlowVersionRecord {
  return {
    id: Number(row.id),
    flowId: Number(row.flow_id),
    merchantId: String(row.merchant_id ?? "default"),
    version: Number(row.version ?? 1),
    note: String(row.note ?? ""),
    createdBy: String(row.created_by ?? ""),
    createdAt: String(row.created_at ?? "")
  };
}

function normalizeKnowledgeType(value: unknown): KnowledgeItemRecord["type"] {
  return value === "script" || value === "rule" || value === "forbidden" || value === "faq" ? value : "faq";
}

function normalizeScriptFlowStatus(value: unknown): ScriptFlowRecord["status"] {
  return value === "active" || value === "disabled" || value === "draft" ? value : "draft";
}

function normalizeScriptFlowStep(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
  const dictionary: Record<string, string> = {
    a: "interest_screening",
    "首次问候": "interest_screening",
    first_greeting: "interest_screening",
    greeting: "interest_screening",
    b: "interest_screening",
    "兴趣筛选": "interest_screening",
    interest_screening: "interest_screening",
    c: "registration_intent",
    "项目介绍": "registration_intent",
    project_intro: "registration_intent",
    d: "registration_intent",
    "注册意向": "registration_intent",
    registration_intent: "registration_intent",
    e: "wait_registration",
    "发送注册链接": "wait_registration",
    "发送链接": "wait_registration",
    send_register_link: "wait_registration",
    f: "wait_registration",
    "等待注册": "wait_registration",
    wait_registration: "wait_registration",
    g: "telegram_confirm",
    "telegram确认": "telegram_confirm",
    "tg确认": "telegram_confirm",
    telegram_confirm: "telegram_confirm",
    h: "telegram_download",
    "telegram下载": "telegram_download",
    "tg下载": "telegram_download",
    telegram_download: "telegram_download",
    i: "collect_telegram",
    "获取telegram账号": "collect_telegram",
    "收集telegram": "collect_telegram",
    collect_telegram: "collect_telegram",
    j: "human_handoff",
    "转交真人": "human_handoff",
    human_handoff: "human_handoff",
    k: "ended",
    "结束": "ended",
    ended: "ended"
  };
  return dictionary[normalized] || normalized;
}

function normalizeScriptFlowStepValue(key: string, value: unknown): string | number {
  if (key === "sendLink" || key === "sendInvite" || key === "enabled") return booleanPatchValue(value, true);
  if (key === "sortOrder") return Number(value || 0);
  if (key === "flowStep" || key === "nextFlowStep") return normalizeScriptFlowStep(String(value || ""));
  return String(value ?? "");
}

function normalizeTelegramBindingStatus(value: unknown): MerchantConfigRecord["telegramHandoffChatStatus"] {
  return value === "waiting" || value === "bound" || value === "invalid" || value === "unbound" ? value : "unbound";
}

function normalizeInviteCodeStatus(value: unknown, fallback: A2CInviteCodeRecord["status"]): A2CInviteCodeRecord["status"] {
  return value === "available" || value === "reserved" || value === "used" || value === "disabled" ? value : fallback;
}

function normalizeConversationReviewStatus(value: unknown): ConversationReviewRecord["status"] {
  return value === "draft" || value === "ready" || value === "applied" ? value : "ready";
}

function normalizeConversationReviewItemType(value: unknown): ConversationReviewItemRecord["itemType"] {
  return value === "sample" || value === "knowledge" ? value : "knowledge";
}

function normalizeConversationReviewItemStatus(value: unknown): ConversationReviewItemRecord["status"] {
  return value === "applied" || value === "ignored" || value === "candidate" ? value : "candidate";
}

function normalizeReviewSampleStage(value: unknown): ConversationStage {
  const text = String(value || "");
  if (text === "need_tg_register" || text === "need_phone_or_tg" || text === "ready_for_handoff" || text === "need_platform_register") return text;
  return "need_platform_register";
}

function booleanPatchValue(value: unknown, fallback: boolean): number {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (normalized === "true" || normalized === "1") return 1;
    if (normalized === "false" || normalized === "0") return 0;
  }
  return fallback ? 1 : 0;
}

function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function inviteCodeAccountMatches(inviteAccountPhone: string, conversationAccountPhone: string): boolean {
  const rawInvitePhone = inviteAccountPhone.trim();
  const rawConversationPhone = conversationAccountPhone.trim();
  if (!rawInvitePhone || !rawConversationPhone) return false;
  if (rawInvitePhone === rawConversationPhone) return true;
  const inviteDigits = phoneDigits(inviteAccountPhone);
  const conversationDigits = phoneDigits(conversationAccountPhone);
  if (!inviteDigits || !conversationDigits) return false;
  if (inviteDigits === conversationDigits) return true;
  const minComparableLength = 8;
  return (
    inviteDigits.length >= minComparableLength &&
    conversationDigits.length >= minComparableLength &&
    (inviteDigits.endsWith(conversationDigits) || conversationDigits.endsWith(inviteDigits))
  );
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(value || "{}")) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value || "[]")) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function parseJsonRecordArray(value: unknown): Array<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(String(value || "[]")) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
      : [];
  } catch {
    return [];
  }
}

function clipText(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function buildCustomerMemorySummary(conversation: Conversation, lastIntent: string, operatorNotes: string): string {
  const parts = [
    `客户语言: ${conversation.language || "unknown"}`,
    `国家: ${conversation.countryName || conversation.countryCode || "默认国家"}`,
    `当前阶段: ${conversation.stage}`,
    `最近意图: ${lastIntent || "unknown"}`,
    `手机号: ${conversation.extractedPhone || "未识别"}`,
    `Telegram: ${conversation.extractedTelegram || "未识别"}`,
    `WhatsApp: ${conversation.extractedWhatsApp || "未识别"}`
  ];
  if (operatorNotes.trim()) parts.push(`人工备注: ${clipText(operatorNotes.trim(), 220)}`);
  return parts.join("；");
}
