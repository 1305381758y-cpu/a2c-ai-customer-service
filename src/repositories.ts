import { randomUUID } from "node:crypto";
import { insertTrainingSamples } from "./db.js";
import type { Db } from "./db.js";
import type { ConversationStage, IntentLabel } from "./domain/intents.js";
import type { TrainingSampleForSearch } from "./domain/sampleRetrieval.js";
import type { ImportedTrainingSample } from "./import/trainingSamples.js";

export interface Conversation {
  id: string;
  customerPhone: string;
  a2cAccountPhone: string;
  nickname: string;
  language: string;
  stage: ConversationStage;
  extractedPhone: string;
  extractedTelegram: string;
  status: "active" | "human_handoff";
  handoffNotified: number;
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

  insertTrainingSamples(samples: ImportedTrainingSample[]): number {
    return insertTrainingSamples(this.db, samples);
  }

  getOrCreateConversation(customerPhone: string, a2cAccountPhone: string, nickname = ""): Conversation {
    const existing = this.db.sqlite
      .prepare("SELECT * FROM conversations WHERE customer_phone = ? AND a2c_account_phone = ?")
      .get(customerPhone, a2cAccountPhone) as Record<string, unknown> | undefined;
    if (existing) return mapConversation(existing);

    const id = randomUUID();
    this.db.sqlite
      .prepare(`
        INSERT INTO conversations (id, customer_phone, a2c_account_phone, nickname)
        VALUES (?, ?, ?, ?)
      `)
      .run(id, customerPhone, a2cAccountPhone, nickname);
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
            status = ?, handoff_notified = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(
        conversation.language,
        conversation.stage,
        conversation.extractedPhone,
        conversation.extractedTelegram,
        conversation.status,
        conversation.handoffNotified,
        conversation.id
      );
  }

  insertMessage(input: MessageInput): { inserted: boolean } {
    try {
      this.db.sqlite
        .prepare(`
          INSERT INTO messages
            (conversation_id, direction, external_id, content, msg_type, language, intent, phone_detected, telegram_detected, raw_payload)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
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

  listConversations(filters: { status?: string; language?: string; limit?: number } = {}): Conversation[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
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
        FROM conversations
        ${where}
        ORDER BY updated_at DESC
        LIMIT ?
      `)
      .all(...params)
      .map((row) => mapConversation(row as Record<string, unknown>));
  }

  listTrainingSamples(filters: { language?: string; intent?: string; stage?: string; enabled?: boolean } = {}): TrainingSampleForSearch[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
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

  patchTrainingSample(id: number, patch: Record<string, unknown>): Record<string, unknown> | undefined {
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
      this.db.sqlite.prepare(`UPDATE training_samples SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values, id);
    }
    return this.db.sqlite.prepare("SELECT * FROM training_samples WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  }

  insertHandoffEvent(conversationId: string, telegramMessage: string, sent: boolean, error = ""): void {
    this.db.sqlite
      .prepare("INSERT INTO handoff_events (conversation_id, telegram_message, sent, error) VALUES (?, ?, ?, ?)")
      .run(conversationId, telegramMessage, sent ? 1 : 0, error);
  }
}

function mapConversation(row: Record<string, unknown>): Conversation {
  return {
    id: String(row.id),
    customerPhone: String(row.customer_phone),
    a2cAccountPhone: String(row.a2c_account_phone),
    nickname: String(row.nickname ?? ""),
    language: String(row.language ?? "unknown"),
    stage: String(row.stage ?? "need_platform_register") as ConversationStage,
    extractedPhone: String(row.extracted_phone ?? ""),
    extractedTelegram: String(row.extracted_telegram ?? ""),
    status: String(row.status ?? "active") as "active" | "human_handoff",
    handoffNotified: Number(row.handoff_notified ?? 0)
  };
}
