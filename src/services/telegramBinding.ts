import { createHmac, timingSafeEqual } from "node:crypto";
import { TelegramClient } from "../clients/telegram.js";
import type { AppConfig } from "../config.js";
import type { MerchantConfigRecord, Repositories } from "../repositories.js";

export type TelegramUpdate = {
  update_id?: number;
  message?: { text?: string; chat?: TelegramChat };
  my_chat_member?: {
    chat?: TelegramChat;
    new_chat_member?: { status?: string };
  };
};

type TelegramChat = {
  id: number | string;
  type?: string;
  title?: string;
};

type TelegramWebhookValue = {
  ok: true;
  status: string;
  chatId?: string;
};

export type TelegramSetupResult =
  | {
      ok: true;
      value: {
        ok: true;
        webhookUrl: string;
        config: Record<string, unknown>;
      };
    }
  | {
      ok: false;
      statusCode: 400 | 404 | 502;
      error: string;
    };

export type TelegramWebhookResult =
  | {
      ok: true;
      value: TelegramWebhookValue;
    }
  | {
      ok: false;
      statusCode: 401 | 404;
      error: string;
    };

export async function setupTelegramWebhook(
  repos: Repositories,
  config: AppConfig,
  maskConfig: (config: MerchantConfigRecord) => Record<string, unknown>,
  merchantId: string,
  origin: string
): Promise<TelegramSetupResult> {
  const merchant = repos.getMerchant(merchantId);
  if (!merchant) return { ok: false, statusCode: 404, error: "merchant not found" };

  const cfg = repos.getMerchantConfig(merchantId);
  if (!cfg.telegramBotToken) return { ok: false, statusCode: 400, error: "telegram bot token is required" };

  const webhookUrl = `${origin}/webhooks/telegram/${merchantId}`;
  try {
    await TelegramClient.setWebhook({
      botToken: cfg.telegramBotToken,
      url: webhookUrl,
      secretToken: telegramWebhookSecret(config, merchantId)
    });
    const status = cfg.telegramHandoffChatId ? "bound" : "waiting";
    const updated = repos.updateTelegramBinding(merchantId, { status });
    return { ok: true, value: { ok: true, webhookUrl, config: maskConfig(updated) } };
  } catch (error) {
    repos.updateTelegramBinding(merchantId, {
      status: "invalid",
      error: error instanceof Error ? error.message : "telegram webhook setup failed"
    });
    return {
      ok: false,
      statusCode: 502,
      error: error instanceof Error ? error.message : "telegram webhook setup failed"
    };
  }
}

export function handleTelegramWebhookUpdate(
  repos: Repositories,
  config: AppConfig,
  merchantId: string,
  actualSecret: string,
  update: TelegramUpdate
): TelegramWebhookResult {
  const merchant = repos.getMerchant(merchantId);
  if (!merchant) return { ok: false, statusCode: 404, error: "merchant not found" };

  const expectedSecret = telegramWebhookSecret(config, merchant.id);
  if (!verifySecret(actualSecret, expectedSecret)) {
    return { ok: false, statusCode: 401, error: "unauthorized" };
  }

  return { ok: true, value: bindTelegramUpdate(repos, merchant.id, update) };
}

function bindTelegramUpdate(repos: Repositories, merchantId: string, update: TelegramUpdate): TelegramWebhookValue {
  const membership = update.my_chat_member;
  const membershipChat = membership?.chat;
  const membershipStatus = membership?.new_chat_member?.status || "";
  if (membershipChat && isGroupChat(membershipChat)) {
    if (membershipStatus === "left" || membershipStatus === "kicked") {
      const config = repos.updateTelegramBinding(merchantId, {
        chatId: String(membershipChat.id),
        chatTitle: membershipChat.title || "",
        status: "invalid",
        error: "Telegram bot was removed from the handoff group"
      });
      return { ok: true, status: config.telegramHandoffChatStatus, chatId: config.telegramHandoffChatId };
    }
    if (["member", "administrator", "creator"].includes(membershipStatus)) {
      const config = repos.updateTelegramBinding(merchantId, {
        chatId: String(membershipChat.id),
        chatTitle: membershipChat.title || "",
        status: "bound"
      });
      return { ok: true, status: config.telegramHandoffChatStatus, chatId: config.telegramHandoffChatId };
    }
  }

  const messageChat = update.message?.chat;
  if (messageChat && isGroupChat(messageChat)) {
    const config = repos.updateTelegramBinding(merchantId, {
      chatId: String(messageChat.id),
      chatTitle: messageChat.title || "",
      status: "bound"
    });
    return { ok: true, status: config.telegramHandoffChatStatus, chatId: config.telegramHandoffChatId };
  }
  return { ok: true, status: "ignored" };
}

function isGroupChat(chat: TelegramChat): boolean {
  return chat.type === "group" || chat.type === "supergroup";
}

function telegramWebhookSecret(config: AppConfig, merchantId: string): string {
  return createHmac("sha256", config.SESSION_SECRET).update(`telegram:${merchantId}`).digest("hex");
}

function verifySecret(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
