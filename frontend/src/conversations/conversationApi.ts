import { api } from "../app/api.js";
import type { UnreadSummary } from "../types.js";

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
