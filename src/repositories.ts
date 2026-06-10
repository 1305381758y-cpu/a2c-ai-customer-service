import { randomUUID } from "node:crypto";
import { insertTrainingSamples } from "./db.js";
import type { Db } from "./db.js";
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
  platformRegisterUrl: string;
  tgRegisterGuideUrl: string;
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

  findMerchantByA2CAccount(accountPhone: string): MerchantRecord {
    const row = this.db.sqlite
      .prepare(`
        SELECT m.*
        FROM merchants m
        JOIN merchant_configs c ON c.merchant_id = m.id
        WHERE m.status = 'active' AND c.a2c_account_phone = ?
        LIMIT 1
      `)
      .get(accountPhone) as Record<string, unknown> | undefined;
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
    this.db.sqlite
      .prepare(`
        UPDATE users
        SET name = COALESCE(?, name),
            status = COALESCE(?, status),
            password_hash = COALESCE(?, password_hash),
            role = COALESCE(?, role),
            merchant_id = COALESCE(?, merchant_id),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(patch.name ?? null, patch.status ?? null, patch.passwordHash ?? null, patch.role ?? null, patch.merchantId ?? null, id);
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
    platformRegisterUrl: String(row.platform_register_url ?? ""),
    tgRegisterGuideUrl: String(row.tg_register_guide_url ?? "")
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

function normalizeKnowledgeType(value: unknown): KnowledgeItemRecord["type"] {
  return value === "script" || value === "rule" || value === "forbidden" || value === "faq" ? value : "faq";
}
