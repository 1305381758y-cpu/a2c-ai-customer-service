import type { Db } from "./db.js";
import type { IntentLabel } from "./domain/intents.js";
import type { ImportedTrainingSample } from "./import/trainingSamples.js";
import {
  clipText,
  mapConversationReview,
  mapConversationReviewItem,
  normalizeReviewSampleStage,
  parseJsonObject
} from "./repositoryMappers.js";
import type {
  ConversationReviewInput,
  ConversationReviewItemRecord,
  ConversationReviewRecord,
  KnowledgeItemRecord
} from "./repositoryTypes.js";

export interface ConversationReviewRepositoryDeps {
  createTrainingSample(merchantId: string, sample: ImportedTrainingSample, countryId?: string): { id: number };
  createKnowledgeItem(merchantId: string, input: Record<string, unknown>): KnowledgeItemRecord;
  defaultCountryId(merchantId: string): string;
}

export class ConversationReviewRepository {
  constructor(
    private readonly db: Db,
    private readonly deps: ConversationReviewRepositoryDeps
  ) {}

  get(conversationId: string, merchantId?: string): { review: ConversationReviewRecord; items: ConversationReviewItemRecord[] } | undefined {
    const where = merchantId ? "WHERE conversation_id = ? AND merchant_id = ?" : "WHERE conversation_id = ?";
    const row = this.db.sqlite.prepare(`SELECT * FROM conversation_reviews ${where}`).get(conversationId, ...(merchantId ? [merchantId] : [])) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    const review = mapConversationReview(row);
    return { review, items: this.listItems(review.id, merchantId) };
  }

  upsert(conversationId: string, merchantId: string, input: ConversationReviewInput): { review: ConversationReviewRecord; items: ConversationReviewItemRecord[] } {
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
      this.insertSuggestionItems(reviewId, merchantId, conversationId, input);
      this.db.sqlite.exec("COMMIT");
      const current = this.get(conversationId, merchantId);
      if (!current) throw new Error("review not found after save");
      return current;
    } catch (error) {
      this.db.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  listItems(reviewId: number, merchantId?: string): ConversationReviewItemRecord[] {
    const where = merchantId ? "WHERE review_id = ? AND merchant_id = ?" : "WHERE review_id = ?";
    return this.db.sqlite
      .prepare(`SELECT * FROM conversation_review_items ${where} ORDER BY id ASC`)
      .all(reviewId, ...(merchantId ? [merchantId] : []))
      .map((row) => mapConversationReviewItem(row as Record<string, unknown>));
  }

  applyItem(itemId: number, merchantId: string): ConversationReviewItemRecord | undefined {
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
      const created = this.deps.createTrainingSample(merchantId, {
        customerMessage: String(payload.customerMessage || item.title || "客户问题"),
        standardReply: String(payload.standardReply || payload.reply || item.content || ""),
        stage: normalizeReviewSampleStage(payload.stage),
        intent: String(payload.intent || "unknown") as IntentLabel,
        language: String(payload.language || "zh"),
        keywords: String(payload.keywords || "复盘候选,人工确认"),
        priority: Number(payload.priority || 0),
        enabled: true
      }, this.deps.defaultCountryId(merchantId));
      targetType = "training_sample";
      targetId = String(created.id);
    } else {
      const created = this.deps.createKnowledgeItem(merchantId, {
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

  private insertSuggestionItems(reviewId: number, merchantId: string, conversationId: string, input: ConversationReviewInput): void {
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
}
