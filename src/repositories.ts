import { randomUUID } from "node:crypto";
import { insertTrainingSamples } from "./db.js";
import type { Db } from "./db.js";
import type { A2CAccount } from "./clients/a2c.js";
import type { ConversationStage, IntentLabel } from "./domain/intents.js";
import type { TrainingSampleForSearch } from "./domain/sampleRetrieval.js";
import type { ImportedTrainingSample } from "./import/trainingSamples.js";
import type { UserRole } from "./auth.js";

export interface Conversation {
  id: string;
  merchantId: string;
  customerPhone: string;
  a2cAccountPhone: string;
  nickname: string;
  language: string;
  stage: ConversationStage;
  extractedPhone: string;
  extractedTelegram: string;
  status: "active" | "human_handoff";
  handoffStatus: "pending" | "processing" | "done";
  handoffNotified: number;
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
  telegramBotToken: string;
  telegramHandoffChatId: string;
  telegramHandoffChatTitle: string;
  telegramHandoffChatStatus: "unbound" | "waiting" | "bound" | "invalid";
  telegramHandoffChatError: string;
  platformRegisterUrl: string;
  tgRegisterGuideUrl: string;
}

export interface MerchantA2CAccountRecord {
  id: number;
  merchantId: string;
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
  customerKey: string;
  conversationId: string;
  language: string;
  stage: string;
  extractedPhone: string;
  extractedTelegram: string;
  lastIntent: string;
  summary: string;
  facts: Record<string, unknown>;
  operatorNotes: string;
  updatedAt: string;
}

export interface CustomerRecord {
  id: number;
  merchantId: string;
  customerKey: string;
  nickname: string;
  firstA2CAccountPhone: string;
  lastA2CAccountPhone: string;
  language: string;
  stage: string;
  extractedPhone: string;
  extractedTelegram: string;
  status: "active" | "human_handoff";
  conversationCount: number;
  lastConversationId: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface TrainingMaterialRecord {
  id: number;
  merchantId: string;
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
  rawPayload?: unknown;
}

export class Repositories {
  constructor(private readonly db: Db) {}

  insertTrainingSamples(samples: ImportedTrainingSample[], merchantId = "default"): number {
    return insertTrainingSamples(this.db, samples, merchantId);
  }

  createTrainingSample(merchantId: string, sample: ImportedTrainingSample): { id: number } {
    this.db.sqlite
      .prepare(`
        INSERT INTO training_samples
          (merchant_id, customer_message, standard_reply, stage, intent, language, keywords, priority, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        merchantId,
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

  getOrCreateConversation(customerPhone: string, a2cAccountPhone: string, nickname = "", merchantId = "default"): Conversation {
    const existing = this.db.sqlite
      .prepare("SELECT * FROM conversations WHERE merchant_id = ? AND customer_phone = ? AND a2c_account_phone = ?")
      .get(merchantId, customerPhone, a2cAccountPhone) as Record<string, unknown> | undefined;
    if (existing) return mapConversation(existing);

    const id = randomUUID();
    this.db.sqlite
      .prepare(`
        INSERT INTO conversations (id, merchant_id, customer_phone, a2c_account_phone, nickname)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(id, merchantId, customerPhone, a2cAccountPhone, nickname);
    return this.getConversation(id)!;
  }

  getConversation(id: string): Conversation | undefined {
    const row = this.db.sqlite.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? mapConversation(row) : undefined;
  }

  updateConversation(conversation: Conversation): void {
    this.db.sqlite
      .prepare(`
        UPDATE conversations
        SET language = ?, stage = ?, extracted_phone = ?, extracted_telegram = ?,
            status = ?, handoff_status = ?, handoff_notified = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(
        conversation.language,
        conversation.stage,
        conversation.extractedPhone,
        conversation.extractedTelegram,
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
          (merchant_id, customer_key, nickname, first_a2c_account_phone, last_a2c_account_phone,
           language, stage, extracted_phone, extracted_telegram, status, conversation_count, last_conversation_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(merchant_id, customer_key) DO UPDATE SET
          nickname = CASE WHEN excluded.nickname != '' THEN excluded.nickname ELSE customers.nickname END,
          last_a2c_account_phone = excluded.last_a2c_account_phone,
          language = excluded.language,
          stage = excluded.stage,
          extracted_phone = CASE WHEN excluded.extracted_phone != '' THEN excluded.extracted_phone ELSE customers.extracted_phone END,
          extracted_telegram = CASE WHEN excluded.extracted_telegram != '' THEN excluded.extracted_telegram ELSE customers.extracted_telegram END,
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
        conversation.customerPhone,
        conversation.nickname,
        existing?.firstA2CAccountPhone || conversation.a2cAccountPhone,
        conversation.a2cAccountPhone,
        conversation.language,
        conversation.stage,
        conversation.extractedPhone,
        conversation.extractedTelegram,
        conversation.status,
        conversation.id
      );
    return this.getCustomer(conversation.merchantId, conversation.customerPhone)!;
  }

  getCustomer(merchantId: string, customerKey: string): CustomerRecord | undefined {
    const row = this.db.sqlite
      .prepare("SELECT * FROM customers WHERE merchant_id = ? AND customer_key = ?")
      .get(merchantId, customerKey) as Record<string, unknown> | undefined;
    return row ? mapCustomer(row) : undefined;
  }

  listCustomers(filters: { merchantId?: string; status?: string; language?: string; limit?: number } = {}): CustomerRecord[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filters.merchantId) {
      clauses.push("merchant_id = ?");
      params.push(filters.merchantId);
    }
    if (filters.status) {
      clauses.push("status = ?");
      params.push(filters.status);
    }
    if (filters.language) {
      clauses.push("language = ?");
      params.push(filters.language);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
    params.push(limit);
    return this.db.sqlite
      .prepare(`
        SELECT *
        FROM customers
        ${where}
        ORDER BY last_seen_at DESC, id DESC
        LIMIT ?
      `)
      .all(...params)
      .map((row) => mapCustomer(row as Record<string, unknown>));
  }

  insertMessage(input: MessageInput): { inserted: boolean } {
    try {
      this.db.sqlite
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
          JSON.stringify(input.rawPayload ?? {})
        );
      return { inserted: true };
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE")) return { inserted: false };
      throw error;
    }
  }

  listConversationMessages(conversationId: string, limit = 20): Array<{ direction: string; content: string; intent: string; createdAt: string }> {
    return this.db.sqlite
      .prepare(`
        SELECT direction, content, intent, created_at AS createdAt
        FROM messages
        WHERE conversation_id = ?
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(conversationId, limit)
      .reverse() as Array<{ direction: string; content: string; intent: string; createdAt: string }>;
  }

  getCustomerMemoryByConversation(conversationId: string): CustomerMemoryRecord | undefined {
    const conversation = this.getConversation(conversationId);
    if (!conversation) return undefined;
    return this.getCustomerMemory(conversation.merchantId, conversation.customerPhone);
  }

  getCustomerMemory(merchantId: string, customerKey: string): CustomerMemoryRecord | undefined {
    const row = this.db.sqlite
      .prepare("SELECT * FROM customer_memories WHERE merchant_id = ? AND customer_key = ?")
      .get(merchantId, customerKey) as Record<string, unknown> | undefined;
    return row ? mapCustomerMemory(row) : undefined;
  }

  updateCustomerMemoryFromMessage(conversation: Conversation, input: { intent: string; content: string; direction: "inbound" | "outbound" }): CustomerMemoryRecord {
    const existing = this.getCustomerMemory(conversation.merchantId, conversation.customerPhone);
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
      nickname: conversation.nickname,
      lastIntent,
      lastMessage: clipText(input.content, 180),
      recentSignals: [...recentSignals, signal].slice(-10)
    };
    const summary = buildCustomerMemorySummary(conversation, lastIntent, existing?.operatorNotes ?? "");

    this.db.sqlite
      .prepare(`
        INSERT INTO customer_memories
          (merchant_id, customer_key, conversation_id, language, stage, extracted_phone, extracted_telegram, last_intent, summary, facts_json, operator_notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(merchant_id, customer_key) DO UPDATE SET
          conversation_id = excluded.conversation_id,
          language = excluded.language,
          stage = excluded.stage,
          extracted_phone = excluded.extracted_phone,
          extracted_telegram = excluded.extracted_telegram,
          last_intent = excluded.last_intent,
          summary = excluded.summary,
          facts_json = excluded.facts_json,
          updated_at = CURRENT_TIMESTAMP
      `)
      .run(
        conversation.merchantId,
        conversation.customerPhone,
        conversation.id,
        conversation.language,
        conversation.stage,
        conversation.extractedPhone,
        conversation.extractedTelegram,
        lastIntent,
        summary,
        JSON.stringify(nextFacts),
        existing?.operatorNotes ?? ""
      );
    return this.getCustomerMemory(conversation.merchantId, conversation.customerPhone)!;
  }

  patchCustomerMemory(conversationId: string, merchantId: string | undefined, patch: Record<string, unknown>): CustomerMemoryRecord | undefined {
    const conversation = this.getConversation(conversationId);
    if (!conversation || (merchantId && conversation.merchantId !== merchantId)) return undefined;
    const existing = this.getCustomerMemory(conversation.merchantId, conversation.customerPhone)
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
        WHERE merchant_id = ? AND customer_key = ?
      `)
      .run(JSON.stringify(facts), operatorNotes, summary, conversation.merchantId, conversation.customerPhone);
    return this.getCustomerMemory(conversation.merchantId, conversation.customerPhone);
  }

  listConversations(filters: { merchantId?: string; status?: string; language?: string; handoffStatus?: string; limit?: number } = {}): Conversation[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filters.merchantId) {
      clauses.push("merchant_id = ?");
      params.push(filters.merchantId);
    }
    if (filters.status) {
      clauses.push("status = ?");
      params.push(filters.status);
    }
    if (filters.language) {
      clauses.push("language = ?");
      params.push(filters.language);
    }
    if (filters.handoffStatus) {
      clauses.push("handoff_status = ?");
      params.push(filters.handoffStatus);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
    params.push(limit);

    return this.db.sqlite
      .prepare(`
        SELECT *
        FROM conversations
        ${where}
        ORDER BY updated_at DESC
        LIMIT ?
      `)
      .all(...params)
      .map((row) => mapConversation(row as Record<string, unknown>));
  }

  listTrainingSamples(filters: { merchantId?: string; language?: string; intent?: string; stage?: string; enabled?: boolean } = {}): TrainingSampleForSearch[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filters.merchantId) {
      clauses.push("merchant_id = ?");
      params.push(filters.merchantId);
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
        SELECT id, customer_message AS customerMessage, standard_reply AS standardReply,
               stage, intent, language, keywords, priority
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
      enabled: "enabled"
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

  listKnowledgeItems(filters: { merchantId?: string; type?: string; enabled?: boolean } = {}): KnowledgeItemRecord[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filters.merchantId) {
      clauses.push("merchant_id = ?");
      params.push(filters.merchantId);
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
        SELECT id, merchant_id, type, title, content, language, priority, enabled
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
    this.db.sqlite
      .prepare(`
        INSERT INTO knowledge_items (merchant_id, type, title, content, language, priority, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        merchantId,
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
      enabled: "enabled"
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

  createTrainingMaterial(input: {
    merchantId: string;
    sourceType: string;
    filename: string;
    mimeType: string;
    rawText: string;
    warnings: string[];
  }): TrainingMaterialRecord {
    this.db.sqlite
      .prepare(`
        INSERT INTO training_materials
          (merchant_id, source_type, filename, mime_type, raw_text, warnings_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(input.merchantId, input.sourceType, input.filename, input.mimeType, input.rawText, JSON.stringify(input.warnings));
    const row = this.db.sqlite.prepare("SELECT * FROM training_materials WHERE id = last_insert_rowid()").get() as Record<string, unknown>;
    return mapTrainingMaterial(row);
  }

  addTrainingMaterialItem(input: {
    materialId: number;
    merchantId: string;
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
    this.db.sqlite
      .prepare(`
        INSERT INTO training_material_items
          (material_id, merchant_id, kind, sample_id, knowledge_id, title, content, intent, stage, language, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        input.materialId,
        input.merchantId,
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

  listTrainingMaterials(filters: { merchantId?: string; sourceType?: string; status?: string; limit?: number } = {}): TrainingMaterialRecord[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filters.merchantId) {
      clauses.push("merchant_id = ?");
      params.push(filters.merchantId);
    }
    if (filters.sourceType) {
      clauses.push("source_type = ?");
      params.push(filters.sourceType);
    }
    if (filters.status) {
      clauses.push("status = ?");
      params.push(filters.status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
    params.push(limit);
    return this.db.sqlite
      .prepare(`
        SELECT *
        FROM training_materials
        ${where}
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(...params)
      .map((row) => mapTrainingMaterial(row as Record<string, unknown>));
  }

  getTrainingMaterial(id: number, merchantId?: string): TrainingMaterialRecord | undefined {
    const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
    const row = this.db.sqlite.prepare(`SELECT * FROM training_materials ${where}`).get(id, ...(merchantId ? [merchantId] : [])) as Record<string, unknown> | undefined;
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

  listTrainingMaterialSnippets(merchantId: string, limit = 12): TrainingMaterialItemRecord[] {
    return this.db.sqlite
      .prepare(`
        SELECT *
        FROM training_material_items
        WHERE merchant_id = ? AND enabled = 1
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(merchantId, limit)
      .map((row) => mapTrainingMaterialItem(row as Record<string, unknown>));
  }

  insertHandoffEvent(conversationId: string, telegramMessage: string, sent: boolean, error = ""): void {
    this.db.sqlite
      .prepare("INSERT INTO handoff_events (merchant_id, conversation_id, telegram_message, sent, error) VALUES ((SELECT merchant_id FROM conversations WHERE id = ?), ?, ?, ?, ?)")
      .run(conversationId, conversationId, telegramMessage, sent ? 1 : 0, error);
  }

  listMerchants(): MerchantRecord[] {
    return this.db.sqlite.prepare("SELECT id, name, status FROM merchants ORDER BY created_at DESC").all().map(mapMerchant);
  }

  createMerchant(name: string): MerchantRecord {
    const id = randomUUID();
    this.db.sqlite.prepare("INSERT INTO merchants (id, name) VALUES (?, ?)").run(id, name);
    this.db.sqlite.prepare("INSERT INTO merchant_configs (merchant_id) VALUES (?)").run(id);
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

  getMerchantConfig(merchantId: string): MerchantConfigRecord {
    this.db.sqlite.prepare("INSERT OR IGNORE INTO merchant_configs (merchant_id) VALUES (?)").run(merchantId);
    const row = this.db.sqlite.prepare("SELECT * FROM merchant_configs WHERE merchant_id = ?").get(merchantId) as Record<string, unknown>;
    return mapMerchantConfig(row);
  }

  patchMerchantConfig(merchantId: string, patch: Record<string, unknown>): MerchantConfigRecord {
    const allowed: Record<string, string> = {
      a2cBaseUrl: "a2c_base_url",
      a2cAppId: "a2c_app_id",
      a2cAppSecret: "a2c_app_secret",
      a2cAccountPhone: "a2c_account_phone",
      openaiApiKey: "openai_api_key",
      openaiModel: "openai_model",
      telegramBotToken: "telegram_bot_token",
      telegramHandoffChatId: "telegram_handoff_chat_id",
      telegramHandoffChatTitle: "telegram_handoff_chat_title",
      telegramHandoffChatStatus: "telegram_handoff_chat_status",
      telegramHandoffChatError: "telegram_handoff_chat_error",
      platformRegisterUrl: "platform_register_url",
      tgRegisterGuideUrl: "tg_register_guide_url"
    };
    this.db.sqlite.prepare("INSERT OR IGNORE INTO merchant_configs (merchant_id) VALUES (?)").run(merchantId);
    const entries = Object.entries(patch).filter(([key, value]) => key in allowed && typeof value === "string");
    if (entries.length) {
      const assignments = entries.map(([key]) => `${allowed[key]} = ?`).join(", ");
      this.db.sqlite.prepare(`UPDATE merchant_configs SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?`).run(...entries.map(([, value]) => value as string), merchantId);
    }
    return this.getMerchantConfig(merchantId);
  }

  listMerchantA2CAccounts(filters: { merchantId?: string; enabled?: boolean } = {}): MerchantA2CAccountRecord[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filters.merchantId) {
      clauses.push("merchant_id = ?");
      params.push(filters.merchantId);
    }
    if (typeof filters.enabled === "boolean") {
      clauses.push("enabled = ?");
      params.push(filters.enabled ? 1 : 0);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.db.sqlite
      .prepare(`
        SELECT *
        FROM merchant_a2c_accounts
        ${where}
        ORDER BY enabled DESC, api_phone ASC
      `)
      .all(...params)
      .map((row) => mapMerchantA2CAccount(row as Record<string, unknown>));
  }

  syncMerchantA2CAccounts(merchantId: string, accounts: A2CAccount[]): MerchantA2CAccountRecord[] {
    this.db.sqlite.prepare("INSERT OR IGNORE INTO merchant_configs (merchant_id) VALUES (?)").run(merchantId);
    const upsert = this.db.sqlite.prepare(`
      INSERT INTO merchant_a2c_accounts
        (merchant_id, api_phone, waba_id, status, number_status, quality_rating, messaging_limit, verified_name, enabled, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(merchant_id, api_phone) DO UPDATE SET
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
    if (typeof patch.enabled === "boolean") {
      this.db.sqlite
        .prepare("UPDATE merchant_a2c_accounts SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(patch.enabled ? 1 : 0, id);
      this.refreshMerchantA2CAccountPhones(account.merchantId);
    }
    return this.listMerchantA2CAccounts({ merchantId: account.merchantId }).find((item) => item.id === id);
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

  updateHandoffStatus(conversationId: string, merchantId: string, handoffStatus: "pending" | "processing" | "done"): Conversation | undefined {
    this.db.sqlite
      .prepare("UPDATE conversations SET handoff_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND merchant_id = ?")
      .run(handoffStatus, conversationId, merchantId);
    const row = this.db.sqlite.prepare("SELECT * FROM conversations WHERE id = ? AND merchant_id = ?").get(conversationId, merchantId) as Record<string, unknown> | undefined;
    return row ? mapConversation(row) : undefined;
  }
}

function mapConversation(row: Record<string, unknown>): Conversation {
  return {
    id: String(row.id),
    merchantId: String(row.merchant_id ?? "default"),
    customerPhone: String(row.customer_phone),
    a2cAccountPhone: String(row.a2c_account_phone),
    nickname: String(row.nickname ?? ""),
    language: String(row.language ?? "unknown"),
    stage: String(row.stage ?? "need_platform_register") as ConversationStage,
    extractedPhone: String(row.extracted_phone ?? ""),
    extractedTelegram: String(row.extracted_telegram ?? ""),
    status: String(row.status ?? "active") as "active" | "human_handoff",
    handoffStatus: String(row.handoff_status ?? "pending") as "pending" | "processing" | "done",
    handoffNotified: Number(row.handoff_notified ?? 0)
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
    telegramBotToken: String(row.telegram_bot_token ?? ""),
    telegramHandoffChatId: String(row.telegram_handoff_chat_id ?? ""),
    telegramHandoffChatTitle: String(row.telegram_handoff_chat_title ?? ""),
    telegramHandoffChatStatus: normalizeTelegramBindingStatus(row.telegram_handoff_chat_status),
    telegramHandoffChatError: String(row.telegram_handoff_chat_error ?? ""),
    platformRegisterUrl: String(row.platform_register_url ?? ""),
    tgRegisterGuideUrl: String(row.tg_register_guide_url ?? "")
  };
}

function mapMerchantA2CAccount(row: Record<string, unknown>): MerchantA2CAccountRecord {
  return {
    id: Number(row.id),
    merchantId: String(row.merchant_id ?? "default"),
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
    type: normalizeKnowledgeType(row.type),
    title: String(row.title ?? ""),
    content: String(row.content ?? ""),
    language: String(row.language ?? "zh"),
    priority: Number(row.priority ?? 0),
    enabled: Boolean(Number(row.enabled ?? 1))
  };
}

function mapCustomer(row: Record<string, unknown>): CustomerRecord {
  return {
    id: Number(row.id),
    merchantId: String(row.merchant_id ?? "default"),
    customerKey: String(row.customer_key ?? ""),
    nickname: String(row.nickname ?? ""),
    firstA2CAccountPhone: String(row.first_a2c_account_phone ?? ""),
    lastA2CAccountPhone: String(row.last_a2c_account_phone ?? ""),
    language: String(row.language ?? "unknown"),
    stage: String(row.stage ?? "need_platform_register"),
    extractedPhone: String(row.extracted_phone ?? ""),
    extractedTelegram: String(row.extracted_telegram ?? ""),
    status: String(row.status ?? "active") as "active" | "human_handoff",
    conversationCount: Number(row.conversation_count ?? 0),
    lastConversationId: String(row.last_conversation_id ?? ""),
    firstSeenAt: String(row.first_seen_at ?? ""),
    lastSeenAt: String(row.last_seen_at ?? "")
  };
}

function mapCustomerMemory(row: Record<string, unknown>): CustomerMemoryRecord {
  return {
    id: Number(row.id),
    merchantId: String(row.merchant_id ?? "default"),
    customerKey: String(row.customer_key ?? ""),
    conversationId: String(row.conversation_id ?? ""),
    language: String(row.language ?? "unknown"),
    stage: String(row.stage ?? "need_platform_register"),
    extractedPhone: String(row.extracted_phone ?? ""),
    extractedTelegram: String(row.extracted_telegram ?? ""),
    lastIntent: String(row.last_intent ?? "unknown"),
    summary: String(row.summary ?? ""),
    facts: parseJsonObject(row.facts_json),
    operatorNotes: String(row.operator_notes ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

function mapTrainingMaterial(row: Record<string, unknown>): TrainingMaterialRecord {
  return {
    id: Number(row.id),
    merchantId: String(row.merchant_id ?? "default"),
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

function normalizeKnowledgeType(value: unknown): KnowledgeItemRecord["type"] {
  return value === "script" || value === "rule" || value === "forbidden" || value === "faq" ? value : "faq";
}

function normalizeTelegramBindingStatus(value: unknown): MerchantConfigRecord["telegramHandoffChatStatus"] {
  return value === "waiting" || value === "bound" || value === "invalid" || value === "unbound" ? value : "unbound";
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

function clipText(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function buildCustomerMemorySummary(conversation: Conversation, lastIntent: string, operatorNotes: string): string {
  const parts = [
    `客户语言: ${conversation.language || "unknown"}`,
    `当前阶段: ${conversation.stage}`,
    `最近意图: ${lastIntent || "unknown"}`,
    `手机号: ${conversation.extractedPhone || "未识别"}`,
    `Telegram: ${conversation.extractedTelegram || "未识别"}`
  ];
  if (operatorNotes.trim()) parts.push(`人工备注: ${clipText(operatorNotes.trim(), 220)}`);
  return parts.join("；");
}
