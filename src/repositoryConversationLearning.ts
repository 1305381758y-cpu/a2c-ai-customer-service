import type { Db } from "./db.js";
import { clipText } from "./repositoryJson.js";
import type { Conversation, MessageInput } from "./repositoryTypes.js";

export interface ConversationLearningRepositoryDeps {
  getConversation(id: string): Conversation | undefined;
}

export interface ConversationLearningSample {
  marker: string;
  keywords: string;
  customerMessage: string;
  standardReply: string;
  language: string;
  intent: string;
  stage: string;
}

export function learnFromConversationReply(
  db: Db,
  deps: ConversationLearningRepositoryDeps,
  conversationId: string,
  outboundMessageId: number,
  input: MessageInput
): void {
  const reply = String(input.content || "").trim();
  if (input.direction !== "outbound" || input.msgType !== "text" || !reply || reply.length < 2) return;
  const conversation = deps.getConversation(conversationId);
  if (!conversation) return;
  const inbound = findLatestInboundBefore(db, conversationId, outboundMessageId || Number.MAX_SAFE_INTEGER);
  const sample = inbound ? buildConversationLearningSample(conversation, inbound, input) : undefined;
  if (!sample) return;
  upsertConversationLearningSample(db, conversation, sample);
}

export function buildConversationLearningSample(
  conversation: Conversation,
  inbound: { id: number; content: string; language?: string; intent?: string },
  input: MessageInput
): ConversationLearningSample | undefined {
  const customerMessage = String(inbound.content || "").trim();
  const reply = String(input.content || "").trim();
  if (!customerMessage || customerMessage.length < 2 || !reply || reply.length < 2) return undefined;
  const marker = `conversation_sample:${conversation.id}:${inbound.id}`;
  const language = String(inbound.language || input.language || conversation.language || "unknown");
  const intent = String(inbound.intent || input.intent || "unknown");
  return {
    marker,
    keywords: `${marker},真实对话,自动沉淀,${conversation.a2cAccountPhone},${conversation.customerPhone}`,
    customerMessage: clipText(customerMessage, 1200),
    standardReply: clipText(reply, 1200),
    language,
    intent,
    stage: conversation.stage
  };
}

function findLatestInboundBefore(db: Db, conversationId: string, outboundMessageId: number): { id: number; content: string; language: string; intent: string } | undefined {
  return db.sqlite
    .prepare(`
      SELECT id, content, language, intent
      FROM messages
      WHERE conversation_id = ? AND direction = 'inbound' AND id < ?
      ORDER BY id DESC
      LIMIT 1
    `)
    .get(conversationId, outboundMessageId) as { id: number; content: string; language: string; intent: string } | undefined;
}

function upsertConversationLearningSample(db: Db, conversation: Conversation, sample: ConversationLearningSample): void {
  const existing = db.sqlite
    .prepare("SELECT id FROM training_samples WHERE merchant_id = ? AND keywords LIKE ? LIMIT 1")
    .get(conversation.merchantId, `%${sample.marker}%`) as { id: number } | undefined;
  if (existing) {
    db.sqlite
      .prepare(`
        UPDATE training_samples
        SET standard_reply = ?, language = ?, intent = ?, stage = ?, enabled = 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND merchant_id = ?
      `)
      .run(sample.standardReply, sample.language, sample.intent, sample.stage, existing.id, conversation.merchantId);
    return;
  }
  db.sqlite
    .prepare(`
      INSERT INTO training_samples
        (merchant_id, country_id, customer_message, standard_reply, stage, intent, language, keywords, priority, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
    `)
    .run(
      conversation.merchantId,
      conversation.countryId,
      sample.customerMessage,
      sample.standardReply,
      sample.stage,
      sample.intent,
      sample.language,
      sample.keywords
    );
}
