import type { AppConfig } from "../config.js";

const A2C_TIMEOUT_MS = 12_000;
const A2C_TOKEN_TTL_MS = 7_200_000;
const TOKEN_REFRESH_SKEW_MS = 0;
const AUTH_RATE_LIMIT_COOLDOWN_MS = 10 * 60_000;

type TokenCacheEntry = {
  accessToken?: string;
  expiresAt?: number;
  pending?: Promise<string>;
  authBlockedUntil?: number;
};

const tokenCache = new Map<string, TokenCacheEntry>();

export interface A2CTokenStore {
  get(cacheKey: string): { accessToken: string; expiresAt: number } | undefined;
  set(cacheKey: string, accessToken: string, expiresAt: number): void;
  getAuthBlockedUntil?(cacheKey: string): number | undefined;
  setAuthBlockedUntil?(cacheKey: string, blockedUntil: number): void;
  clear?(cacheKey: string): void;
}

export interface A2CAccount {
  apiPhone: string;
  wabaId?: string;
  status?: number;
  numberStatus?: number;
  qualityRating?: number;
  messagingLimit?: number;
  verifiedName?: string;
}

export class A2CClient {
  private accessToken = "";
  private expiresAt = 0;

  constructor(private readonly config: AppConfig, private readonly tokenStore?: A2CTokenStore) {}

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
    const request = (token: string) => fetch(`${this.config.A2C_BASE_URL}/v1/messages`, {
      method: "POST",
      signal: AbortSignal.timeout(A2C_TIMEOUT_MS),
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
    const { response, json } = await this.requestWithTokenRetry<{ code?: number; msg?: string; data?: string }>(request);
    if (!response.ok || json.code !== 200) {
      throw new Error(`A2C send failed: ${json.msg || response.statusText}`);
    }
    return json.data ?? "";
  }

  async listAccounts(): Promise<A2CAccount[]> {
    const request = (token: string) => fetch(`${this.config.A2C_BASE_URL}/v1/accounts`, {
      method: "GET",
      signal: AbortSignal.timeout(A2C_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${token}` }
    });
    const { response, json } = await this.requestWithTokenRetry<{ code?: number; msg?: string; data?: A2CAccount[] }>(request);
    if (!response.ok || json.code !== 200) {
      throw new Error(`A2C accounts sync failed: ${json.msg || response.statusText}`);
    }
    return (json.data ?? []).filter((account) => Boolean(account.apiPhone));
  }

  private async requestWithTokenRetry<T extends { code?: number; msg?: string }>(request: (token: string) => Promise<Response>): Promise<{ response: Response; json: T }> {
    const cacheKey = this.cacheKey();
    let token = await this.getToken();
    let response = await request(token);
    const json = (await response.json()) as T;
    if (response.ok && json.code === 200) return { response, json };
    if (!isLikelyTokenError(response, json.msg)) return { response, json };

    this.clearToken(cacheKey);
    token = await this.getToken();
    response = await request(token);
    const retryJson = (await response.json()) as T;
    return { response, json: retryJson };
  }

  private async getToken(): Promise<string> {
    if (!this.enabled) throw new Error("A2C credentials are not configured");
    if (this.accessToken && Date.now() < this.expiresAt - TOKEN_REFRESH_SKEW_MS) return this.accessToken;

    const cacheKey = this.cacheKey();
    const cached = tokenCache.get(cacheKey);
    if (cached?.accessToken && cached.expiresAt && Date.now() < cached.expiresAt - TOKEN_REFRESH_SKEW_MS) {
      this.accessToken = cached.accessToken;
      this.expiresAt = cached.expiresAt;
      return cached.accessToken;
    }
    const stored = this.tokenStore?.get(cacheKey);
    if (stored?.accessToken && Date.now() < stored.expiresAt - TOKEN_REFRESH_SKEW_MS) {
      this.accessToken = stored.accessToken;
      this.expiresAt = stored.expiresAt;
      tokenCache.set(cacheKey, { accessToken: this.accessToken, expiresAt: this.expiresAt });
      return stored.accessToken;
    }
    if (cached?.pending) {
      const token = await cached.pending;
      const updated = tokenCache.get(cacheKey);
      this.accessToken = token;
      this.expiresAt = updated?.expiresAt ?? 0;
      return token;
    }
    if (cached?.authBlockedUntil && Date.now() < cached.authBlockedUntil) {
      throw new Error("A2C auth failed: Visit too frequently, please try again later");
    }
    const storedAuthBlockedUntil = this.tokenStore?.getAuthBlockedUntil?.(cacheKey);
    if (storedAuthBlockedUntil && Date.now() < storedAuthBlockedUntil) {
      tokenCache.set(cacheKey, { ...cached, authBlockedUntil: storedAuthBlockedUntil });
      throw new Error("A2C auth failed: Visit too frequently, please try again later");
    }

    const pending = this.fetchToken(cacheKey);
    tokenCache.set(cacheKey, { ...cached, pending });
    return pending;
  }

  private async fetchToken(cacheKey: string): Promise<string> {
    try {
      const response = await fetch(`${this.config.A2C_BASE_URL}/open/auth/token`, {
        method: "POST",
        signal: AbortSignal.timeout(A2C_TIMEOUT_MS),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: this.config.A2C_APP_ID, appSecret: this.config.A2C_APP_SECRET })
      });
      const json = (await response.json()) as { code?: number; msg?: string; data?: { accessToken: string; expireIn?: number } };
      if (!response.ok || json.code !== 200 || !json.data?.accessToken) {
        if (isRateLimitedAuth(json.msg || response.statusText)) {
          const cached = tokenCache.get(cacheKey);
          const blockedUntil = Date.now() + AUTH_RATE_LIMIT_COOLDOWN_MS;
          tokenCache.set(cacheKey, { ...cached, pending: undefined, authBlockedUntil: blockedUntil });
          this.tokenStore?.setAuthBlockedUntil?.(cacheKey, blockedUntil);
        }
        throw new Error(`A2C auth failed: ${json.msg || response.statusText}`);
      }
      this.accessToken = json.data.accessToken;
      this.expiresAt = Date.now() + A2C_TOKEN_TTL_MS;
      tokenCache.set(cacheKey, { accessToken: this.accessToken, expiresAt: this.expiresAt });
      this.tokenStore?.set(cacheKey, this.accessToken, this.expiresAt);
      this.tokenStore?.setAuthBlockedUntil?.(cacheKey, 0);
      return this.accessToken;
    } catch (error) {
      const cached = tokenCache.get(cacheKey);
      tokenCache.set(cacheKey, cached?.accessToken ? { accessToken: cached.accessToken, expiresAt: cached.expiresAt, authBlockedUntil: cached.authBlockedUntil } : { authBlockedUntil: cached?.authBlockedUntil });
      throw error;
    }
  }

  private cacheKey(): string {
    return `${this.config.A2C_BASE_URL}\0${this.config.A2C_APP_ID}\0${this.config.A2C_APP_SECRET}`;
  }

  private clearToken(cacheKey = this.cacheKey()): void {
    this.accessToken = "";
    this.expiresAt = 0;
    tokenCache.delete(cacheKey);
    this.tokenStore?.clear?.(cacheKey);
  }
}

function isLikelyTokenError(response: Response, message = ""): boolean {
  if (isRateLimitedAuth(message)) return false;
  return response.status === 401 || response.status === 403 || /(token.*(expired|invalid)|access.?token|unauthorized|forbidden|expired token|invalid token)/i.test(message);
}

function isRateLimitedAuth(message = ""): boolean {
  return /(visit too frequently|too frequent|rate limit|too many requests|请求.*频繁|频繁)/i.test(message);
}

function mapA2CMessageType(type: "text" | "image" | "video" | "audio" | "document"): number {
  return { text: 1, image: 2, video: 3, audio: 4, document: 5 }[type];
}
