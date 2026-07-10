import type { Db } from "./db.js";
import { buildIntentLearningExample, mergeIntentLearningExamples } from "./repositoryIntentLearningExamples.js";
import { mapIntentLearningEvent } from "./repositoryIntentLearningMappers.js";
import { clipText } from "./repositoryJson.js";
import type { IntentLearningEventRecord, IntentLearningInput } from "./repositoryTypes.js";

export class IntentLearningRepository {
  constructor(private readonly db: Db) {}

  record(input: IntentLearningInput): IntentLearningEventRecord {
    const existing = this.db.sqlite
      .prepare("SELECT * FROM intent_learning_events WHERE merchant_id = ? AND country_id = ? AND candidate_key = ?")
      .get(input.merchantId, input.countryId, input.candidateKey) as Record<string, unknown> | undefined;
    const example = buildIntentLearningExample(input);
    if (existing) {
      const examples = mergeIntentLearningExamples(example, existing.examples_json);
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
      return this.get(Number(existing.id))!;
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

  get(id: number, merchantId?: string): IntentLearningEventRecord | undefined {
    const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
    const row = this.db.sqlite.prepare(`SELECT * FROM intent_learning_events ${where}`).get(id, ...(merchantId ? [merchantId] : [])) as Record<string, unknown> | undefined;
    return row ? mapIntentLearningEvent(row) : undefined;
  }

  list(filters: { merchantId?: string; countryId?: string; status?: string; suggestedIntent?: string; q?: string; startAt?: string; endAt?: string; limit?: number; offset?: number } = {}): IntentLearningEventRecord[] {
    const { where, params } = this.buildListWhere(filters);
    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
    const offset = Math.max(filters.offset ?? 0, 0);
    params.push(limit, offset);
    return this.db.sqlite
      .prepare(`
        SELECT *
        FROM intent_learning_events
        ${where}
        ORDER BY occurrence_count DESC, last_seen_at DESC, id DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params)
      .map((row) => mapIntentLearningEvent(row as Record<string, unknown>));
  }

  count(filters: { merchantId?: string; countryId?: string; status?: string; suggestedIntent?: string; q?: string; startAt?: string; endAt?: string } = {}): number {
    const { where, params } = this.buildListWhere(filters);
    const row = this.db.sqlite.prepare(`SELECT COUNT(*) AS count FROM intent_learning_events ${where}`).get(...params) as { count: number } | undefined;
    return Number(row?.count ?? 0);
  }

  listPromoted(filters: { merchantId: string; countryId: string; limit?: number }): IntentLearningEventRecord[] {
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

  patch(id: number, patch: Record<string, unknown>, merchantId?: string): IntentLearningEventRecord | undefined {
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
    if (!assignments.length) return this.get(id, merchantId);
    const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
    this.db.sqlite
      .prepare(`UPDATE intent_learning_events SET ${assignments.join(", ")}, updated_at = CURRENT_TIMESTAMP ${where}`)
      .run(...values, id, ...(merchantId ? [merchantId] : []));
    return this.get(id, merchantId);
  }

  private buildListWhere(filters: { merchantId?: string; countryId?: string; status?: string; suggestedIntent?: string; q?: string; startAt?: string; endAt?: string }): { where: string; params: Array<string | number> } {
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
    if (filters.startAt) {
      clauses.push("last_seen_at >= ?");
      params.push(filters.startAt);
    }
    if (filters.endAt) {
      clauses.push("last_seen_at < ?");
      params.push(filters.endAt);
    }
    const q = filters.q?.trim();
    if (q) {
      const like = `%${q}%`;
      clauses.push(`(
        display_name LIKE ?
        OR suggested_intent LIKE ?
        OR customer_text LIKE ?
        OR detected_intent LIKE ?
        OR inferred_intent LIKE ?
        OR contextual_intent LIKE ?
        OR flow_step LIKE ?
        OR description LIKE ?
      )`);
      params.push(like, like, like, like, like, like, like, like);
    }
    return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
  }
}
