import type { ConversationMessageRecord, Repositories } from "../repositories.js";

export interface ConversationHistoryReader {
  recentMessages(conversationId: string, limit: number): ConversationMessageRecord[];
}

export class RepositoryConversationHistoryReader implements ConversationHistoryReader {
  constructor(private readonly repos: Repositories) {}

  recentMessages(conversationId: string, limit: number): ConversationMessageRecord[] {
    return this.repos.listConversationMessages(conversationId, limit);
  }
}
