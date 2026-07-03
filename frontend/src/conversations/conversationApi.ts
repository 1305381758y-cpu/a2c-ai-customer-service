import { api } from "../app/api.js";
import type { ChatMessage, ConversationReviewResponse, CustomerMemory, UnreadSummary } from "../types.js";

export type ConversationSendDraft = {
  type: string;
  content: string;
  url: string;
  caption: string;
  fileName: string;
};

function conversationScope(platform: boolean): "/api/admin" | "/api/merchant" {
  return platform ? "/api/admin" : "/api/merchant";
}

export async function loadUnreadSummary(): Promise<UnreadSummary[]> {
  return (await api<{ rows: UnreadSummary[] }>("/api/merchant/conversations/unread-summary")).rows;
}

export async function markAllConversationsRead(a2cAccountPhone: string): Promise<{ updated: number }> {
  return await api<{ updated: number }>("/api/merchant/conversations/read-all", {
    method: "POST",
    body: JSON.stringify({ a2cAccountPhone })
  });
}

export async function markConversationRead(conversationId: string): Promise<void> {
  await api(`/api/merchant/conversations/${conversationId}/read`, { method: "POST" });
}

export async function setConversationPinned(conversationId: string, pinned: boolean): Promise<void> {
  await api(`/api/merchant/conversations/${conversationId}/pin`, {
    method: "POST",
    body: JSON.stringify({ pinned })
  });
}

export async function syncMerchantA2CAccounts(): Promise<void> {
  await api("/api/merchant/a2c/accounts/sync", { method: "POST" });
}

export async function loadConversationMessages(platform: boolean, conversationId: string, limit = 100): Promise<ChatMessage[]> {
  return (await api<{ rows: ChatMessage[] }>(`${conversationScope(platform)}/conversations/${conversationId}/messages?limit=${limit}`)).rows;
}

export async function loadCustomerMemory(platform: boolean, conversationId: string): Promise<CustomerMemory> {
  return await api<CustomerMemory>(`${conversationScope(platform)}/conversations/${conversationId}/memory`);
}

export async function saveCustomerMemoryNotes(platform: boolean, conversationId: string, operatorNotes: string): Promise<CustomerMemory> {
  return await api<CustomerMemory>(`${conversationScope(platform)}/conversations/${conversationId}/memory`, {
    method: "PATCH",
    body: JSON.stringify({ operatorNotes })
  });
}

export async function loadConversationReview(platform: boolean, conversationId: string): Promise<ConversationReviewResponse> {
  return await api<ConversationReviewResponse>(`${conversationScope(platform)}/conversations/${conversationId}/review`);
}

export async function generateConversationReview(platform: boolean, conversationId: string): Promise<void> {
  await api(`${conversationScope(platform)}/conversations/${conversationId}/review`, { method: "POST" });
}

export async function applyConversationReviewItem(conversationId: string, itemId: number): Promise<void> {
  await api(`/api/merchant/conversations/${conversationId}/review/apply`, {
    method: "POST",
    body: JSON.stringify({ itemId })
  });
}

export async function updateConversationHandoffStatus(conversationId: string, handoffStatus: string): Promise<void> {
  await api(`/api/merchant/handoffs/${conversationId}`, {
    method: "PATCH",
    body: JSON.stringify({ handoffStatus })
  });
}

export async function deleteConversation(platform: boolean, conversationId: string): Promise<void> {
  await api(`${conversationScope(platform)}/conversations/${conversationId}`, { method: "DELETE" });
}

export async function sendConversationMessage(conversationId: string, draft: ConversationSendDraft): Promise<void> {
  await api(`/api/merchant/conversations/${conversationId}/send`, {
    method: "POST",
    body: JSON.stringify(draft)
  });
}
