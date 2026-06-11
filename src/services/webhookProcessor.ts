import { analyzeMessage } from "../domain/analyzer.js";
import { rankSamples } from "../domain/sampleRetrieval.js";
import { A2CClient } from "../clients/a2c.js";
import { OpenAIReplyClient } from "../clients/openaiReply.js";
import { TelegramClient } from "../clients/telegram.js";
import type { AppConfig } from "../config.js";
import type { MerchantConfigRecord } from "../repositories.js";
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
    private readonly telegram: TelegramClient,
    private readonly config: AppConfig
  ) {}

  async process(payload: A2CWebhookPayload): Promise<{ status: string; conversationId?: string }> {
    if (payload.type !== "CUSTOMER_MESSAGE") return { status: "ignored" };

    const data = payload.data;
    const content = data.content || data.caption || data.url || "";
    const merchant = this.repos.findMerchantByA2CAccount(data.to);
    const merchantConfig = this.repos.getMerchantConfig(merchant.id);
    const runtimeConfig = appConfigForMerchant(this.config, merchantConfig);
    const ai = new OpenAIReplyClient(runtimeConfig);
    const a2c = new A2CClient(runtimeConfig);
    const telegram = new TelegramClient(runtimeConfig);
    const conversation = this.repos.getOrCreateConversation(data.from, data.to, data.nickname ?? "", merchant.id);
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
    this.repos.upsertCustomerFromConversation(conversation);
    const inboundMemory = this.repos.updateCustomerMemoryFromMessage(conversation, { intent: analysis.intent, content, direction: "inbound" });

    if (conversation.extractedPhone && conversation.extractedTelegram) {
      conversation.stage = "ready_for_handoff";
      conversation.status = "human_handoff";
      await this.notifyHandoffOnce(conversation, data.messageId, new Date((data.timestamp || Date.now()) * 1000).toISOString());
      this.repos.updateConversation(conversation);
      this.repos.upsertCustomerFromConversation(conversation);
      return { status: "handoff", conversationId: conversation.id };
    }

    if (conversation.status === "human_handoff") {
      this.repos.updateConversation(conversation);
      this.repos.upsertCustomerFromConversation(conversation);
      return { status: "already_handoff", conversationId: conversation.id };
    }

    const enabledSamples = this.repos.listTrainingSamples({ merchantId: merchant.id, enabled: true });
    const knowledge = this.repos.listKnowledgeItems({ merchantId: merchant.id, enabled: true });
    const trainingMaterials = this.repos.listTrainingMaterialSnippets(merchant.id, 20);
    const samples = rankSamples(enabledSamples, {
      text: content,
      language: analysis.language,
      intent: analysis.intent,
      stage: analysis.stage
    });
    const history = this.repos.listConversationMessages(conversation.id, 20);
    const aiReply = await ai.generateReply({ customerText: content, conversation, history, samples, knowledge, trainingMaterials, memory: inboundMemory });

    if (aiReply.extractedPhone && !conversation.extractedPhone) conversation.extractedPhone = aiReply.extractedPhone;
    if (aiReply.extractedTelegram && !conversation.extractedTelegram) conversation.extractedTelegram = aiReply.extractedTelegram;
    if (aiReply.language) conversation.language = aiReply.language;
    if (aiReply.stage === "ready_for_handoff" || (conversation.extractedPhone && conversation.extractedTelegram)) {
      conversation.stage = "ready_for_handoff";
      conversation.status = "human_handoff";
      await this.notifyHandoffOnce(conversation, data.messageId, new Date((data.timestamp || Date.now()) * 1000).toISOString(), telegram);
      this.repos.updateConversation(conversation);
      this.repos.upsertCustomerFromConversation(conversation);
      return { status: "handoff", conversationId: conversation.id };
    }

    let externalId = "";
    try {
      externalId = await a2c.sendMessage({
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
      rawPayload: { samples: samples.map((sample) => sample.id), trainingMaterials: trainingMaterials.map((item) => item.id) }
    });
    this.repos.updateConversation(conversation);
    this.repos.upsertCustomerFromConversation(conversation);
    this.repos.updateCustomerMemoryFromMessage(conversation, { intent: "unknown", content: aiReply.reply, direction: "outbound" });

    return { status: "replied", conversationId: conversation.id };
  }

  private async notifyHandoffOnce(conversation: Parameters<Repositories["updateConversation"]>[0], lastMessageId: string, lastMessageTime: string, telegram = this.telegram): Promise<void> {
    if (conversation.handoffNotified) return;
    const history = this.repos.listConversationMessages(conversation.id, 8);
    const summary = history.map((item) => `${item.direction}: ${item.content}`).join("\n");
    const message = buildHandoffMessage({ conversation, lastMessageId, lastMessageTime, summary });
    try {
      await telegram.sendHandoffMessage(message);
      conversation.handoffNotified = 1;
      this.repos.insertHandoffEvent(conversation.id, message, true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "unknown";
      this.repos.markTelegramBindingInvalid(conversation.merchantId, errorMessage);
      this.repos.insertHandoffEvent(conversation.id, message, false, errorMessage);
    }
  }
}

function appConfigForMerchant(config: AppConfig, merchantConfig: MerchantConfigRecord): AppConfig {
  return {
    ...config,
    A2C_BASE_URL: merchantConfig.a2cBaseUrl || config.A2C_BASE_URL,
    A2C_APP_ID: merchantConfig.a2cAppId || config.A2C_APP_ID,
    A2C_APP_SECRET: merchantConfig.a2cAppSecret || config.A2C_APP_SECRET,
    OPENAI_API_KEY: merchantConfig.openaiApiKey || config.OPENAI_API_KEY,
    OPENAI_MODEL: merchantConfig.openaiModel || config.OPENAI_MODEL,
    TELEGRAM_BOT_TOKEN: merchantConfig.telegramBotToken || config.TELEGRAM_BOT_TOKEN,
    TELEGRAM_HANDOFF_CHAT_ID: merchantConfig.telegramHandoffChatId || config.TELEGRAM_HANDOFF_CHAT_ID,
    PLATFORM_REGISTER_URL: merchantConfig.platformRegisterUrl || config.PLATFORM_REGISTER_URL,
    TG_REGISTER_GUIDE_URL: merchantConfig.tgRegisterGuideUrl || config.TG_REGISTER_GUIDE_URL
  };
}
