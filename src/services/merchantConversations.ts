import type { AppConfig } from "../config.js";
import type {
  Conversation,
  ConversationMessageRecord,
  ConversationReviewItemRecord,
  ConversationReviewRecord,
  CustomerMemoryRecord,
  Repositories,
  UnreadSummaryRecord
} from "../repositories.js";
import { normalizeSqlTimeRange } from "./beijingTime.js";
import { generateConversationReview } from "./conversationReview.js";
import { appConfigForMerchant } from "./runtimeConfig.js";

type MerchantConversationResult<T> =
  | { ok: true; value: T }
  | { ok: false; statusCode: 400 | 404; error: string };

export type MerchantConversationListQuery = {
  countryId?: string;
  status?: string;
  handoffStatus?: string;
  language?: string;
  a2cAccountPhone?: string;
  customerPhone?: string;
  startAt?: string;
  endAt?: string;
  timeZone?: string;
  limit?: string;
};

export function listMerchantConversations(
  repos: Repositories,
  merchantId: string,
  query: MerchantConversationListQuery
): { rows: Conversation[] } {
  const range = normalizeSqlTimeRange({ startAt: query.startAt, endAt: query.endAt, timeZone: query.timeZone });
  return {
    rows: repos.listConversations({
      merchantId,
      countryId: query.countryId,
      status: query.status,
      handoffStatus: query.handoffStatus,
      language: query.language,
      a2cAccountPhone: query.a2cAccountPhone,
      customerPhone: query.customerPhone,
      startAt: range.startAt,
      endAt: range.endAt,
      limit: query.limit ? Number(query.limit) : undefined
    })
  };
}

export function getMerchantConversationMessages(
  repos: Repositories,
  merchantId: string,
  conversationId: string,
  limit?: string
): MerchantConversationResult<{ conversation: Conversation; rows: ConversationMessageRecord[] }> {
  const conversation = getScopedConversation(repos, merchantId, conversationId);
  if (!conversation) return conversationNotFound();
  return {
    ok: true,
    value: {
      conversation,
      rows: repos.listConversationMessages(conversationId, limit ? Number(limit) : 50)
    }
  };
}

export function deleteMerchantConversation(
  repos: Repositories,
  merchantId: string,
  conversationId: string
): MerchantConversationResult<{ ok: true }> {
  const ok = repos.deleteConversation(conversationId, merchantId);
  if (!ok) return conversationNotFound();
  return { ok: true, value: { ok: true } };
}

export function getMerchantUnreadSummary(repos: Repositories, merchantId: string): { rows: UnreadSummaryRecord[] } {
  return { rows: repos.unreadSummary(merchantId) };
}

export function markMerchantConversationRead(
  repos: Repositories,
  merchantId: string,
  conversationId: string
): MerchantConversationResult<Conversation> {
  const row = repos.markConversationRead(conversationId, merchantId);
  if (!row || row.merchantId !== merchantId) return conversationNotFound();
  return { ok: true, value: row };
}

export function markAllMerchantConversationsRead(
  repos: Repositories,
  merchantId: string,
  input: { a2cAccountPhone?: string } = {}
) {
  return repos.markConversationsRead(merchantId, {
    a2cAccountPhone: String(input.a2cAccountPhone || "").trim() || undefined
  });
}

export function pinMerchantConversation(
  repos: Repositories,
  merchantId: string,
  conversationId: string,
  pinned: boolean
): MerchantConversationResult<Conversation> {
  const row = repos.pinConversation(conversationId, merchantId, pinned);
  if (!row || row.merchantId !== merchantId) return conversationNotFound();
  return { ok: true, value: row };
}

export function getMerchantConversationMemory(
  repos: Repositories,
  merchantId: string,
  conversationId: string
): MerchantConversationResult<CustomerMemoryRecord> {
  const conversation = getScopedConversation(repos, merchantId, conversationId);
  if (!conversation) return conversationNotFound();
  const memory = repos.getCustomerMemoryByConversation(conversationId) ?? repos.updateCustomerMemoryFromMessage(conversation, { intent: "unknown", content: "", direction: "inbound" });
  return { ok: true, value: memory };
}

export function patchMerchantConversationMemory(
  repos: Repositories,
  merchantId: string,
  conversationId: string,
  body: Record<string, unknown>
): MerchantConversationResult<CustomerMemoryRecord> {
  const memory = repos.patchCustomerMemory(conversationId, merchantId, body);
  if (!memory) return { ok: false, statusCode: 404, error: "memory not found" };
  return { ok: true, value: memory };
}

export function getMerchantConversationReview(
  repos: Repositories,
  merchantId: string,
  conversationId: string
): MerchantConversationResult<{ review: ConversationReviewRecord | null; items: ConversationReviewItemRecord[] }> {
  const conversation = getScopedConversation(repos, merchantId, conversationId);
  if (!conversation) return conversationNotFound();
  return { ok: true, value: repos.getConversationReview(conversationId, conversation.merchantId) ?? { review: null, items: [] } };
}

export async function generateMerchantConversationReview(
  repos: Repositories,
  config: AppConfig,
  merchantId: string,
  conversationId: string
): Promise<MerchantConversationResult<{ review: ConversationReviewRecord; items: ConversationReviewItemRecord[] }>> {
  const conversation = getScopedConversation(repos, merchantId, conversationId);
  if (!conversation) return conversationNotFound();
  const runtimeConfig = appConfigForConversation(repos, config, conversation);
  return { ok: true, value: await generateConversationReview(repos, runtimeConfig, conversation.id) };
}

export function applyMerchantConversationReviewItems(
  repos: Repositories,
  merchantId: string,
  conversationId: string,
  body: { itemId?: number; itemIds?: number[] }
): MerchantConversationResult<{ rows: Array<ConversationReviewItemRecord | undefined> }> {
  const conversation = getScopedConversation(repos, merchantId, conversationId);
  if (!conversation) return conversationNotFound();
  const itemIds = Array.isArray(body.itemIds) ? body.itemIds : body.itemId ? [body.itemId] : [];
  if (!itemIds.length) return { ok: false, statusCode: 400, error: "itemId required" };
  const rows = itemIds.map((id) => repos.applyConversationReviewItem(Number(id), merchantId)).filter(Boolean);
  return { ok: true, value: { rows } };
}

export async function updateMerchantHandoffStatus(
  repos: Repositories,
  config: AppConfig,
  merchantId: string,
  conversationId: string,
  status: "pending" | "processing" | "done" | undefined,
  onReviewError?: (error: unknown) => void
): Promise<MerchantConversationResult<Conversation>> {
  if (status !== "pending" && status !== "processing" && status !== "done") {
    return { ok: false, statusCode: 400, error: "invalid handoffStatus" };
  }
  const row = repos.updateHandoffStatus(conversationId, merchantId, status);
  if (!row) return conversationNotFound();
  if (status === "done") {
    await generateConversationReview(repos, appConfigForConversation(repos, config, row), row.id).catch(onReviewError ?? (() => undefined));
  }
  return { ok: true, value: row };
}

function getScopedConversation(repos: Repositories, merchantId: string, conversationId: string): Conversation | undefined {
  const conversation = repos.getConversation(conversationId);
  if (!conversation || conversation.merchantId !== merchantId) return undefined;
  return conversation;
}

function appConfigForConversation(repos: Repositories, config: AppConfig, conversation: Conversation): AppConfig {
  const cfg = repos.getMerchantConfig(conversation.merchantId);
  return appConfigForMerchant(config, cfg, repos.getMerchantCountry(conversation.countryId));
}

function conversationNotFound(): MerchantConversationResult<never> {
  return { ok: false, statusCode: 404, error: "conversation not found" };
}
