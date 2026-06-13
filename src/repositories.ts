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
  extractedPhone: string;
  extractedTelegram: string;
  extractedWhatsApp: string;
  status: "active" | "human_handoff";
  handoffStatus: "pending" | "processing" | "done";
  handoffNotified: number;
  unreadCount: number;
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
  platformRegisterUrl: string;
  tgRegisterGuideUrl: string;
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

export class Repositories {
  constructor(private readonly db: Db) {}

  insertTrainingSamples(samples: ImportedTrainingSample[], merchantId = "default", countryId = this.defaultCountryId(merchantId)): number {
    return insertTrainingSamples(this.db, samples, merchantId, countryId);
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
        SET country_id = ?, language = ?, stage = ?, extracted_phone = ?, extracted_telegram = ?, extracted_whatsapp = ?,
            status = ?, handoff_status = ?, handoff_notified = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(
        conversation.countryId,
        conversation.language,
        conversation.stage,
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
          JSON.stringify({ ...(typeof input.rawPayload === "object" && input.rawPayload !== null ? input.rawPayload as Record<string, unknown> : {}), whatsappDetected: input.whatsappDetected ?? "" })
        );
      if (input.direction === "inbound") {
        this.db.sqlite.prepare("UPDATE conversations SET unread_count = unread_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(input.conversationId);
      }
      return { inserted: true };
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE")) {
        if (input.direction === "outbound") {
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
              `local_outbound:${input.conversationId}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
              input.content,
              input.msgType,
              input.language,
              input.intent,
              input.phoneDetected ?? "",
              input.telegramDetected ?? "",
              JSON.stringify({ ...(typeof input.rawPayload === "object" && input.rawPayload !== null ? input.rawPayload as Record<string, unknown> : {}), externalIdConflict: input.externalId ?? "", whatsappDetected: input.whatsappDetected ?? "" })
            );
          return { inserted: true };
        }
        return { inserted: false };
      }
      throw error;
    }
  }

  markConversationRead(conversationId: string, merchantId: string): Conversation | undefined {
    this.db.sqlite.prepare("UPDATE conversations SET unread_count = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND merchant_id = ?").run(conversationId, merchantId);
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
        ORDER BY c.updated_at DESC
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
    return this.ensureDefaultCountry(merchantId).id;
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
    this.ensureDefaultCountry(merchantId);
    return this.db.sqlite
      .prepare("SELECT * FROM merchant_countries WHERE merchant_id = ? ORDER BY status ASC, code ASC")
      .all(merchantId)
      .map((row) => mapMerchantCountry(row as Record<string, unknown>));
  }

  createMerchantCountry(merchantId: string, input: Record<string, unknown>): MerchantCountryRecord {
    const code = String(input.code || "").trim() || "default";
    const id = `${merchantId}:${code}`;
    this.db.sqlite.prepare(`
      INSERT INTO merchant_countries
        (id, merchant_id, code, name, default_language, platform_register_url, tg_register_guide_url, require_platform_account, require_phone, require_telegram, require_whatsapp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      merchantId,
      code,
      String(input.name || code),
      String(input.defaultLanguage || "unknown"),
      String(input.platformRegisterUrl || ""),
      String(input.tgRegisterGuideUrl || ""),
      input.requirePlatformAccount === false ? 0 : 1,
      input.requirePhone === false ? 0 : 1,
      input.requireTelegram === false ? 0 : 1,
      input.requireWhatsApp === true ? 1 : 0
    );
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
      const assignments = entries.map(([key]) => `${allowed[key]} = ?`).join(", ");
      const values = entries.map(([key, value]) => {
        if (key.startsWith("require")) return value ? 1 : 0;
        return String(value ?? "");
      }) as Array<string | number>;
      this.db.sqlite.prepare(`UPDATE merchant_countries SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND merchant_id = ?`).run(...values, id, merchantId);
    }
    const row = this.db.sqlite.prepare("SELECT * FROM merchant_countries WHERE id = ? AND merchant_id = ?").get(id, merchantId) as Record<string, unknown> | undefined;
    return row ? mapMerchantCountry(row) : undefined;
  }

  countryIdForA2CAccount(merchantId: string, apiPhone: string): string {
    const row = this.db.sqlite
      .prepare("SELECT country_id FROM merchant_a2c_accounts WHERE merchant_id = ? AND api_phone = ?")
      .get(merchantId, apiPhone) as { country_id?: string } | undefined;
    return this.validCountryId(merchantId, String(row?.country_id || "")) || this.defaultCountryId(merchantId);
  }

  patchMerchantConfig(merchantId: string, patch: Record<string, unknown>): MerchantConfigRecord {
    const allowed: Record<string, string> = {
      a2cBaseUrl: "a2c_base_url",
      a2cAppId: "a2c_app_id",
      a2cAppSecret: "a2c_app_secret",
      a2cAccountPhone: "a2c_account_phone",
      openaiApiKey: "openai_api_key",
      openaiModel: "openai_model",
      googleAiApiKey: "google_ai_api_key",
      googleAiModel: "google_ai_model",
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
        country_id = COALESCE(NULLIF(merchant_a2c_accounts.country_id, ''), excluded.country_id),
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
      const countryId = this.validCountryId(account.merchantId, patch.countryId);
      if (countryId) {
        updates.push("country_id = ?");
        values.push(countryId);
      }
    }
    if (updates.length) {
      this.db.sqlite
        .prepare(`UPDATE merchant_a2c_accounts SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(...values, id);
      this.refreshMerchantA2CAccountPhones(account.merchantId);
    }
    return this.listMerchantA2CAccounts({ merchantId: account.merchantId }).find((item) => item.id === id);
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

    const available = (this.db.sqlite
      .prepare(`
        SELECT ic.*, co.code AS country_code, co.name AS country_name
        FROM a2c_invite_codes ic
        LEFT JOIN merchant_countries co ON co.id = ic.country_id
        WHERE ic.merchant_id = ?
          AND ic.country_id = ?
          AND ic.a2c_account_phone = ?
          AND ic.status = 'available'
        ORDER BY ic.id ASC
        LIMIT 1
      `)
      .get(conversation.merchantId, conversation.countryId, conversation.a2cAccountPhone) as Record<string, unknown> | undefined) ?? (this.db.sqlite
      .prepare(`
        SELECT ic.*, co.code AS country_code, co.name AS country_name
        FROM a2c_invite_codes ic
        LEFT JOIN merchant_countries co ON co.id = ic.country_id
        WHERE ic.merchant_id = ?
          AND ic.a2c_account_phone = ?
          AND ic.status = 'available'
        ORDER BY
          CASE WHEN ic.country_id = '' THEN 0 ELSE 1 END,
          ic.id ASC
        LIMIT 1
      `)
      .get(conversation.merchantId, conversation.a2cAccountPhone) as Record<string, unknown> | undefined);
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
    countryId: String(row.country_id ?? `${String(row.merchant_id ?? "default")}:default`),
    countryCode: String(row.country_code ?? "default"),
    countryName: String(row.country_name ?? "默认国家"),
    customerPhone: String(row.customer_phone),
    a2cAccountPhone: String(row.a2c_account_phone),
    nickname: String(row.nickname ?? ""),
    language: String(row.language ?? "unknown"),
    stage: String(row.stage ?? "need_platform_register") as ConversationStage,
    extractedPhone: String(row.extracted_phone ?? ""),
    extractedTelegram: String(row.extracted_telegram ?? ""),
    extractedWhatsApp: String(row.extracted_whatsapp ?? ""),
    status: String(row.status ?? "active") as "active" | "human_handoff",
    handoffStatus: String(row.handoff_status ?? "pending") as "pending" | "processing" | "done",
    handoffNotified: Number(row.handoff_notified ?? 0),
    unreadCount: Number(row.unread_count ?? 0)
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
    platformRegisterUrl: String(row.platform_register_url ?? ""),
    tgRegisterGuideUrl: String(row.tg_register_guide_url ?? "")
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

function normalizeKnowledgeType(value: unknown): KnowledgeItemRecord["type"] {
  return value === "script" || value === "rule" || value === "forbidden" || value === "faq" ? value : "faq";
}

function normalizeTelegramBindingStatus(value: unknown): MerchantConfigRecord["telegramHandoffChatStatus"] {
  return value === "waiting" || value === "bound" || value === "invalid" || value === "unbound" ? value : "unbound";
}

function normalizeInviteCodeStatus(value: unknown, fallback: A2CInviteCodeRecord["status"]): A2CInviteCodeRecord["status"] {
  return value === "available" || value === "reserved" || value === "used" || value === "disabled" ? value : fallback;
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
