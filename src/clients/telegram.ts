import type { AppConfig } from "../config.js";

export class TelegramError extends Error {
  constructor(message: string, readonly status: number, readonly description = "") {
    super(message);
  }
}

export class TelegramClient {
  constructor(private readonly config: AppConfig) {}

  get enabled(): boolean {
    return Boolean(this.config.TELEGRAM_BOT_TOKEN && this.config.TELEGRAM_HANDOFF_CHAT_ID);
  }

  async sendHandoffMessage(text: string): Promise<void> {
    if (!this.enabled) throw new Error("Telegram bot token or handoff chat id is not configured");
    const response = await fetch(`https://api.telegram.org/bot${this.config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: this.config.TELEGRAM_HANDOFF_CHAT_ID,
        text,
        disable_web_page_preview: true
      })
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { description?: string };
      throw new TelegramError(`Telegram send failed: ${body.description || response.statusText}`, response.status, body.description || response.statusText);
    }
  }

  static async setWebhook(input: { botToken: string; url: string; secretToken: string }): Promise<void> {
    const response = await fetch(`https://api.telegram.org/bot${input.botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: input.url,
        secret_token: input.secretToken,
        allowed_updates: ["message", "my_chat_member"]
      })
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { description?: string };
      throw new TelegramError(`Telegram webhook setup failed: ${body.description || response.statusText}`, response.status, body.description || response.statusText);
    }
  }
}
