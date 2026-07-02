import type { AppConfig } from "../config.js";
import type {
  Conversation,
  ConversationMessageRecord,
  ConversationReviewItemRecord,
  ConversationReviewRecord,
  CustomerMemoryRecord,
  CustomerRecord,
  IntentLearningEventRecord,
  Repositories
} from "../repositories.js";
import { generateConversationReview } from "./conversationReview.js";
import { appConfigForMerchant } from "./runtimeConfig.js";

type AdminConversationResult<T> =
  | { ok: true; value: T }
  | { ok: false; statusCode: 400 | 404; error: string };

export type AdminConversationListQuery = {
  merchantId?: string;
  countryId?: string;
  status?: string;
  handoffStatus?: string;
  language?: string;
  a2cAccountPhone?: string;
  customerPhone?: string;
  limit?: string;
};

export type AdminCustomerListQuery = {
  merchantId?: string;
  countryId?: string;
  status?: string;
  language?: string;
  limit?: string;
};

export type AdminIntentLearningListQuery = {
  merchantId?: string;
  countryId?: string;
  status?: string;
  suggestedIntent?: string;
  limit?: string;
};

export function listAdminConversations(repos: Repositories, query: AdminConversationListQuery): { rows: Conversation[] } {
  return {
    rows: repos.listConversations({
      merchantId: query.merchantId,
      countryId: query.countryId,
      status: query.status,
      handoffStatus: query.handoffStatus,
      language: query.language,
      a2cAccountPhone: query.a2cAccountPhone,
      customerPhone: query.customerPhone,
      limit: query.limit ? Number(query.limit) : undefined
    })
  };
}

export function listAdminCustomers(repos: Repositories, query: AdminCustomerListQuery): { rows: CustomerRecord[] } {
  return {
    rows: repos.listCustomers({
      merchantId: query.merchantId,
      countryId: query.countryId,
      status: query.status,
      language: query.language,
      limit: query.limit ? Number(query.limit) : undefined
    })
  };
}

export function listAdminIntentLearningEvents(
  repos: Repositories,
  query: AdminIntentLearningListQuery
): { rows: IntentLearningEventRecord[] } {
  return {
    rows: repos.listIntentLearningEvents({
      merchantId: query.merchantId,
      countryId: query.countryId,
      status: query.status,
      suggestedIntent: query.suggestedIntent,
      limit: query.limit ? Number(query.limit) : undefined
    })
  };
}

export function patchAdminIntentLearningEvent(
  repos: Repositories,
  idParam: string,
  body: Record<string, unknown>
): AdminConversationResult<IntentLearningEventRecord> {
  const id = Number(idParam);
  if (!Number.isInteger(id)) return { ok: false, statusCode: 400, error: "invalid id" };
  const row = repos.patchIntentLearningEvent(id, body);
  if (!row) return { ok: false, statusCode: 404, error: "intent learning event not found" };
  return { ok: true, value: row };
}

export function deleteAdminCustomer(
  repos: Repositories,
  customerKeyParam: string,
  merchantIdParam?: string
): AdminConversationResult<{ ok: true; deleted: boolean; conversationsDeleted: number; messagesDeleted: number }> {
  const merchantId = merchantIdParam || "default";
  const result = repos.deleteCustomer(merchantId, decodeURIComponent(customerKeyParam));
  if (!result.deleted) return { ok: false, statusCode: 404, error: "customer not found" };
  return { ok: true, value: { ok: true, ...result } };
}

export function getAdminConversationMessages(
  repos: Repositories,
  conversationId: string,
  limit?: string
): AdminConversationResult<{ conversation: Conversation; rows: ConversationMessageRecord[] }> {
  const conversation = repos.getConversation(conversationId);
  if (!conversation) return conversationNotFound();
  return {
    ok: true,
    value: {
      conversation,
      rows: repos.listConversationMessages(conversationId, limit ? Number(limit) : 50)
    }
  };
}

export function deleteAdminConversation(repos: Repositories, conversationId: string): AdminConversationResult<{ ok: true }> {
  const ok = repos.deleteConversation(conversationId);
  if (!ok) return conversationNotFound();
  return { ok: true, value: { ok: true } };
}

export function pinAdminConversation(
  repos: Repositories,
  conversationId: string,
  pinned: boolean
): AdminConversationResult<Conversation> {
  const conversation = repos.getConversation(conversationId);
  if (!conversation) return conversationNotFound();
  const row = repos.pinConversation(conversationId, conversation.merchantId, pinned);
  if (!row) return conversationNotFound();
  return { ok: true, value: row };
}

export function getAdminConversationMemory(
  repos: Repositories,
  conversationId: string
): AdminConversationResult<CustomerMemoryRecord> {
  const memory = repos.getCustomerMemoryByConversation(conversationId);
  if (!memory) return { ok: false, statusCode: 404, error: "memory not found" };
  return { ok: true, value: memory };
}

export function patchAdminConversationMemory(
  repos: Repositories,
  conversationId: string,
  body: Record<string, unknown>
): AdminConversationResult<CustomerMemoryRecord> {
  const memory = repos.patchCustomerMemory(conversationId, undefined, body);
  if (!memory) return { ok: false, statusCode: 404, error: "memory not found" };
  return { ok: true, value: memory };
}

export function getAdminConversationReview(
  repos: Repositories,
  conversationId: string
): AdminConversationResult<{ review: ConversationReviewRecord | null; items: ConversationReviewItemRecord[] }> {
  const conversation = repos.getConversation(conversationId);
  if (!conversation) return conversationNotFound();
  return { ok: true, value: repos.getConversationReview(conversationId) ?? { review: null, items: [] } };
}

export async function generateAdminConversationReview(
  repos: Repositories,
  config: AppConfig,
  conversationId: string
): Promise<AdminConversationResult<{ review: ConversationReviewRecord; items: ConversationReviewItemRecord[] }>> {
  const conversation = repos.getConversation(conversationId);
  if (!conversation) return conversationNotFound();
  const cfg = repos.getMerchantConfig(conversation.merchantId);
  const runtimeConfig = appConfigForMerchant(config, cfg, repos.getMerchantCountry(conversation.countryId));
  return { ok: true, value: await generateConversationReview(repos, runtimeConfig, conversation.id) };
}

function conversationNotFound(): AdminConversationResult<never> {
  return { ok: false, statusCode: 404, error: "conversation not found" };
}
