import type { Db } from "./db.js";
import { mapConversation } from "./repositoryMappers.js";
import type { Conversation, FollowUpCandidate } from "./repositoryTypes.js";

export class HandoffRepository {
  constructor(private readonly db: Db) {}

  insertEvent(conversationId: string, telegramMessage: string, sent: boolean, error = ""): void {
    this.db.sqlite
      .prepare("INSERT INTO handoff_events (merchant_id, conversation_id, telegram_message, sent, error) VALUES ((SELECT merchant_id FROM conversations WHERE id = ?), ?, ?, ?, ?)")
      .run(conversationId, conversationId, telegramMessage, sent ? 1 : 0, error);
  }

  updateStatus(conversationId: string, merchantId: string, handoffStatus: "pending" | "processing" | "done"): Conversation | undefined {
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
