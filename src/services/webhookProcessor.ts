import { analyzeMessage } from "../domain/analyzer.js";
import { rankSamples } from "../domain/sampleRetrieval.js";
import type { A2CClient } from "../clients/a2c.js";
import type { OpenAIReplyClient } from "../clients/openaiReply.js";
import type { TelegramClient } from "../clients/telegram.js";
import type { Repositories } from "../repositories.js";
import { buildHandoffMessage } from "./handoff.js";

export interface A2CWebhookPayload {
  id: string;
  timestamp: number;
  type: string;
  data: {
    messageId: string;
    content?: string;
    from: string;
    to: string;
    msgType: string;
    timestamp: number;
    nickname?: string;
    headImg?: string;
    fileName?: string;
    url?: string;
    caption?: string;
  };
}

export class WebhookProcessor {
  constructor(
    private readonly repos: Repositories,
    private readonly ai: OpenAIReplyClient,
    private readonly a2c: A2CClient,
    private readonly telegram: TelegramClient
  ) {}

  async process(payload: A2CWebhookPayload): Promise<{ status: string; conversationId?: string }> {
    if (payload.type !== "CUSTOMER_MESSAGE") return { status: "ignored" };

    const data = payload.data;
    const content = data.content || data.caption || data.url || "";
    const conversation = this.repos.getOrCreateConversation(data.from, data.to, data.nickname ?? "");
    const analysis = analyzeMessage(content, conversation.language);

    const inserted = this.repos.insertMessage({
      conversationId: conversation.id,
      direction: "inbound",
      externalId: data.messageId || payload.id,
      content,
      msgType: data.msgType || "text",
      language: analysis.language,
      intent: analysis.intent,
      phoneDetected: analysis.phone,
      telegramDetected: analysis.telegram,
      rawPayload: payload
    });
    if (!inserted.inserted) return { status: "duplicate", conversationId: conversation.id };

    conversation.language = analysis.language;
    conversation.stage = analysis.stage;
    conversation.extractedPhone = conversation.extractedPhone || analysis.phone;
    conversation.extractedTelegram = conversation.extractedTelegram || analysis.telegram;

    if (conversation.extractedPhone && conversation.extractedTelegram) {
      conversation.stage = "ready_for_handoff";
      conversation.status = "human_handoff";
      await this.notifyHandoffOnce(conversation, data.messageId, new Date((data.timestamp || Date.now()) * 1000).toISOString());
      this.repos.updateConversation(conversation);
      return { status: "handoff", conversationId: conversation.id };
    }

    if (conversation.status === "human_handoff") {
      this.repos.updateConversation(conversation);
      return { status: "already_handoff", conversationId: conversation.id };
    }

    const enabledSamples = this.repos.listTrainingSamples({ enabled: true });
    const samples = rankSamples(enabledSamples, {
      text: content,
      language: analysis.language,
      intent: analysis.intent,
      stage: analysis.stage
    });
    const history = this.repos.listConversationMessages(conversation.id, 20);
    const aiReply = await this.ai.generateReply({ customerText: content, conversation, history, samples });

    if (aiReply.extractedPhone && !conversation.extractedPhone) conversation.extractedPhone = aiReply.extractedPhone;
    if (aiReply.extractedTelegram && !conversation.extractedTelegram) conversation.extractedTelegram = aiReply.extractedTelegram;
    if (aiReply.language) conversation.language = aiReply.language;
    if (aiReply.stage === "ready_for_handoff" || (conversation.extractedPhone && conversation.extractedTelegram)) {
      conversation.stage = "ready_for_handoff";
      conversation.status = "human_handoff";
      await this.notifyHandoffOnce(conversation, data.messageId, new Date((data.timestamp || Date.now()) * 1000).toISOString());
      this.repos.updateConversation(conversation);
      return { status: "handoff", conversationId: conversation.id };
    }

    let externalId = "";
    try {
      externalId = await this.a2c.sendMessage({
        to: data.from,
        senderPhoneNumber: data.to,
        type: "text",
        content: aiReply.reply
      });
    } catch (error) {
      externalId = `send_failed:${error instanceof Error ? error.message : "unknown"}`;
    }

    this.repos.insertMessage({
      conversationId: conversation.id,
      direction: "outbound",
      externalId,
      content: aiReply.reply,
      msgType: "text",
      language: aiReply.language || conversation.language,
      intent: "unknown",
      rawPayload: { samples: samples.map((sample) => sample.id) }
    });
    this.repos.updateConversation(conversation);

    return { status: "replied", conversationId: conversation.id };
  }

  private async notifyHandoffOnce(conversation: Parameters<Repositories["updateConversation"]>[0], lastMessageId: string, lastMessageTime: string): Promise<void> {
    if (conversation.handoffNotified) return;
    const history = this.repos.listConversationMessages(conversation.id, 8);
    const summary = history.map((item) => `${item.direction}: ${item.content}`).join("\n");
    const message = buildHandoffMessage({ conversation, lastMessageId, lastMessageTime, summary });
    try {
      await this.telegram.sendHandoffMessage(message);
      conversation.handoffNotified = 1;
      this.repos.insertHandoffEvent(conversation.id, message, true);
    } catch (error) {
      this.repos.insertHandoffEvent(conversation.id, message, false, error instanceof Error ? error.message : "unknown");
    }
  }
}
