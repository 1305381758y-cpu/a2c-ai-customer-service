import type { Db } from "./db.js";
import { mapCustomerMemory } from "./repositoryConversationMappers.js";
import { buildCustomerMemorySummary, clipText } from "./repositoryJson.js";
import type { Conversation, CustomerMemoryRecord } from "./repositoryTypes.js";

export interface CustomerMemoryMessageInput {
  intent: string;
  content: string;
  direction: "inbound" | "outbound";
}

export function getCustomerMemory(db: Db, merchantId: string, countryId: string, customerKey: string): CustomerMemoryRecord | undefined {
  const row = db.sqlite
    .prepare(`
      SELECT cm.*, co.code AS country_code, co.name AS country_name
      FROM customer_memories cm
      LEFT JOIN merchant_countries co ON co.id = cm.country_id
      WHERE cm.merchant_id = ? AND cm.country_id = ? AND cm.customer_key = ?
    `)
    .get(merchantId, countryId, customerKey) as Record<string, unknown> | undefined;
  return row ? mapCustomerMemory(row) : undefined;
}

export function updateCustomerMemoryFromMessage(db: Db, conversation: Conversation, input: CustomerMemoryMessageInput): CustomerMemoryRecord {
  const existing = getCustomerMemory(db, conversation.merchantId, conversation.countryId, conversation.customerPhone);
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

  db.sqlite
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
  return getCustomerMemory(db, conversation.merchantId, conversation.countryId, conversation.customerPhone)!;
}

export function patchCustomerMemory(db: Db, conversation: Conversation, patch: Record<string, unknown>): CustomerMemoryRecord | undefined {
  const existing = getCustomerMemory(db, conversation.merchantId, conversation.countryId, conversation.customerPhone)
    ?? updateCustomerMemoryFromMessage(db, conversation, { intent: "unknown", content: "", direction: "inbound" });
  const facts = typeof patch.facts === "object" && patch.facts !== null && !Array.isArray(patch.facts)
    ? patch.facts as Record<string, unknown>
    : existing.facts;
  const operatorNotes = typeof patch.operatorNotes === "string" ? patch.operatorNotes : existing.operatorNotes;
  const summary = buildCustomerMemorySummary(conversation, existing.lastIntent, operatorNotes);
  db.sqlite
    .prepare(`
      UPDATE customer_memories
      SET facts_json = ?, operator_notes = ?, summary = ?, updated_at = CURRENT_TIMESTAMP
      WHERE merchant_id = ? AND country_id = ? AND customer_key = ?
    `)
    .run(JSON.stringify(facts), operatorNotes, summary, conversation.merchantId, conversation.countryId, conversation.customerPhone);
  return getCustomerMemory(db, conversation.merchantId, conversation.countryId, conversation.customerPhone);
}
