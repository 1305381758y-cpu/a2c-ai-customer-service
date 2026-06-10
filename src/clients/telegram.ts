import type { AppConfig } from "../config.js";

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
    if (!response.ok) throw new Error(`Telegram send failed: ${response.statusText}`);
  }
}
