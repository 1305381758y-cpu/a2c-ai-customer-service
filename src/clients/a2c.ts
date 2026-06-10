import type { AppConfig } from "../config.js";

export class A2CClient {
  private accessToken = "";
  private expiresAt = 0;

  constructor(private readonly config: AppConfig) {}

  get enabled(): boolean {
    return Boolean(this.config.A2C_APP_ID && this.config.A2C_APP_SECRET);
  }

  async sendMessage(input: {
    to: string;
    senderPhoneNumber: string;
    type: "text" | "image" | "video" | "audio" | "document";
    content?: string;
    url?: string;
    caption?: string;
    fileName?: string;
  }): Promise<string> {
    const token = await this.getToken();
    const response = await fetch(`${this.config.A2C_BASE_URL}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        to: input.to,
        senderPhoneNumber: input.senderPhoneNumber,
        type: mapA2CMessageType(input.type),
        content: input.content,
        url: input.url,
        caption: input.caption,
        fileName: input.fileName
      })
    });
    const json = (await response.json()) as { code?: number; msg?: string; data?: string };
    if (!response.ok || json.code !== 200) {
      throw new Error(`A2C send failed: ${json.msg || response.statusText}`);
    }
    return json.data ?? "";
  }

  private async getToken(): Promise<string> {
    if (!this.enabled) throw new Error("A2C credentials are not configured");
    if (this.accessToken && Date.now() < this.expiresAt - 60_000) return this.accessToken;

    const response = await fetch(`${this.config.A2C_BASE_URL}/open/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: this.config.A2C_APP_ID, appSecret: this.config.A2C_APP_SECRET })
    });
    const json = (await response.json()) as { code?: number; msg?: string; data?: { accessToken: string; expireIn: number } };
    if (!response.ok || json.code !== 200 || !json.data?.accessToken) {
      throw new Error(`A2C auth failed: ${json.msg || response.statusText}`);
    }
    this.accessToken = json.data.accessToken;
    this.expiresAt = Date.now() + json.data.expireIn * 1000;
    return this.accessToken;
  }
}

function mapA2CMessageType(type: "text" | "image" | "video" | "audio" | "document"): number {
  return { text: 1, image: 2, video: 3, audio: 4, document: 5 }[type];
}
