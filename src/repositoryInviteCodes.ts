import type { A2CInviteCodeRecord } from "./repositoryTypes.js";

export function normalizeInviteCodeStatus(value: unknown, fallback: A2CInviteCodeRecord["status"]): A2CInviteCodeRecord["status"] {
  return value === "available" || value === "reserved" || value === "used" || value === "disabled" ? value : fallback;
}

export function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function inviteCodeAccountMatches(inviteAccountPhone: string, conversationAccountPhone: string): boolean {
  const rawInvitePhone = inviteAccountPhone.trim();
  const rawConversationPhone = conversationAccountPhone.trim();
  if (!rawInvitePhone || !rawConversationPhone) return false;
  if (rawInvitePhone === rawConversationPhone) return true;
  const inviteDigits = phoneDigits(inviteAccountPhone);
  const conversationDigits = phoneDigits(conversationAccountPhone);
  if (!inviteDigits || !conversationDigits) return false;
  return inviteDigits === conversationDigits;
}
