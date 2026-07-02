import { randomUUID } from "node:crypto";
import type { Db } from "./db.js";
import type { A2CAccount, A2CTokenStore } from "./clients/a2c.js";
import type { IntentLabel } from "./domain/intents.js";
import type { TrainingSampleForSearch } from "./domain/sampleRetrieval.js";
import type { ImportedTrainingSample } from "./import/trainingSamples.js";
import type { UserRole } from "./auth.js";
import { MerchantA2CAccountRepository } from "./repositoryA2CAccounts.js";
import { CustomerRepository } from "./repositoryCustomers.js";
import { IntentLearningRepository } from "./repositoryIntentLearning.js";
import { MerchantSettingsRepository } from "./repositoryMerchantSettings.js";
import { ScriptFlowRepository } from "./repositoryScriptFlows.js";
import { TrainingContentRepository } from "./repositoryTrainingContent.js";
import {
  booleanPatchValue,
  buildCustomerMemorySummary,
  clipText,
  mapConversation,
  mapConversationExportRecord,
  mapConversationMessage,
  mapConversationReview,
  mapConversationReviewItem,
  mapCustomerMemory,
  mapMerchant,
  mapMerchantAgentProfile,
  mapUser,
  normalizeReviewSampleStage,
  parseJsonObject,
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
  private readonly customers: CustomerRepository;
  private readonly intentLearning: IntentLearningRepository;
  private readonly scriptFlows: ScriptFlowRepository;
  private readonly trainingContent: TrainingContentRepository;

  constructor(private readonly db: Db) {
    this.settings = new MerchantSettingsRepository(db);
    this.a2cAccounts = new MerchantA2CAccountRepository(
      db,
      { defaultCountryId: (merchantId) => this.settings.defaultCountryId(merchantId) },
      { getMerchantConfig: (merchantId) => this.settings.getConfig(merchantId) }
    );
    this.customers = new CustomerRepository(db);
    this.intentLearning = new IntentLearningRepository(db);
    this.scriptFlows = new ScriptFlowRepository(db, {
      defaultCountryId: (merchantId) => this.defaultCountryId(merchantId),
      validCountryId: (merchantId, countryId) => this.validCountryId(merchantId, countryId)
    });
    this.trainingContent = new TrainingContentRepository(db, {
      defaultCountryId: (merchantId) => this.defaultCountryId(merchantId),
      validCountryId: (merchantId, countryId) => this.validCountryId(merchantId, countryId)
    });
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

  listConversations(filters: { merchantId?: string; countryId?: string; status?: string; language?: string; handoffStatus?: string; a2cAccountPhone?: string; customerPhone?: string; limit?: number } = {}): Conversation[] {
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
    if (filters.customerPhone) {
      clauses.push("c.customer_phone = ?");
      params.push(filters.customerPhone);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 50000);
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
