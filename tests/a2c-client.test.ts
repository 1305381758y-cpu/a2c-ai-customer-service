import { describe, expect, it } from "vitest";
import { A2CClient, type A2CTokenStore } from "../src/clients/a2c.js";
import { loadConfig } from "../src/config.js";

function config() {
  return loadConfig({
    A2C_BASE_URL: "https://a2c.test/api/openapi",
    A2C_APP_ID: "app-id-retry",
    A2C_APP_SECRET: "app-secret-retry"
  });
}

function configWithCredentials(appId: string, appSecret: string) {
  return loadConfig({
    A2C_BASE_URL: "https://a2c.test/api/openapi",
    A2C_APP_ID: appId,
    A2C_APP_SECRET: appSecret
  });
}

describe("A2C client token cache", () => {
  it("reuses cached token and retries the original request after token errors", async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    const store = new Map<string, { accessToken: string; expiresAt: number }>();
    const tokenStore: A2CTokenStore = {
      get: (key) => store.get(key),
      set: (key, accessToken, expiresAt) => store.set(key, { accessToken, expiresAt }),
      clear: (key) => store.delete(key)
    };

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const auth = String((init?.headers as Record<string, string> | undefined)?.Authorization || "");
      calls.push(`${url}:${auth}`);
      if (url.endsWith("/v1/messages") && auth === "Bearer stale-token") {
        return Response.json({ code: 401, msg: "token expired" }, { status: 401 });
      }
      if (url.endsWith("/open/auth/token")) {
        return Response.json({ code: 200, data: { accessToken: "fresh-token", expireIn: 1 } });
      }
      if (url.endsWith("/v1/messages") && auth === "Bearer fresh-token") {
        return Response.json({ code: 200, data: "message-id" });
      }
      return Response.json({ code: 500, msg: "unexpected request" }, { status: 500 });
    }) as typeof fetch;

    try {
      const client = new A2CClient(config(), tokenStore);
      const cacheKey = "https://a2c.test/api/openapi\u0000app-id-retry\u0000app-secret-retry";
      tokenStore.set(cacheKey, "stale-token", Date.now() + 7_200_000);

      await expect(client.sendMessage({
        to: "customer",
        senderPhoneNumber: "sender",
        type: "text",
        content: "hello"
      })).resolves.toBe("message-id");

      expect(calls.filter((item) => item.includes("/open/auth/token"))).toHaveLength(1);
      expect(calls.filter((item) => item.includes("/v1/messages"))).toHaveLength(2);
      expect(tokenStore.get(cacheKey)?.accessToken).toBe("fresh-token");
      expect((tokenStore.get(cacheKey)?.expiresAt || 0) - Date.now()).toBeGreaterThan(7_100_000);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not request a new token when A2C reports rate limiting", async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    const store = new Map<string, { accessToken: string; expiresAt: number }>();
    const tokenStore: A2CTokenStore = {
      get: (key) => store.get(key),
      set: (key, accessToken, expiresAt) => store.set(key, { accessToken, expiresAt }),
      clear: (key) => store.delete(key)
    };

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const auth = String((init?.headers as Record<string, string> | undefined)?.Authorization || "");
      calls.push(`${url}:${auth}`);
      if (url.endsWith("/v1/messages")) {
        return Response.json({ code: 429, msg: "Visit too frequently, please try again later" }, { status: 429 });
      }
      if (url.endsWith("/open/auth/token")) {
        return Response.json({ code: 200, data: { accessToken: "new-token", expireIn: 7200 } });
      }
      return Response.json({ code: 500, msg: "unexpected request" }, { status: 500 });
    }) as typeof fetch;

    try {
      const client = new A2CClient(config(), tokenStore);
      const cacheKey = "https://a2c.test/api/openapi\u0000app-id-retry\u0000app-secret-retry";
      tokenStore.set(cacheKey, "cached-token", Date.now() + 7_200_000);

      await expect(client.sendMessage({
        to: "customer",
        senderPhoneNumber: "sender",
        type: "text",
        content: "hello"
      })).rejects.toThrow("Visit too frequently");

      expect(calls.filter((item) => item.includes("/open/auth/token"))).toHaveLength(0);
      expect(calls.filter((item) => item.includes("/v1/messages"))).toHaveLength(1);
      expect(tokenStore.get(cacheKey)?.accessToken).toBe("cached-token");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not clear cached token or re-auth when A2C returns 401 rate limiting", async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    const store = new Map<string, { accessToken: string; expiresAt: number }>();
    const tokenStore: A2CTokenStore = {
      get: (key) => store.get(key),
      set: (key, accessToken, expiresAt) => store.set(key, { accessToken, expiresAt }),
      clear: (key) => store.delete(key)
    };

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const auth = String((init?.headers as Record<string, string> | undefined)?.Authorization || "");
      calls.push(`${url}:${auth}`);
      if (url.endsWith("/v1/messages")) {
        return Response.json({ code: 401, msg: "访问过于频繁，请稍后再试" }, { status: 401 });
      }
      if (url.endsWith("/open/auth/token")) {
        return Response.json({ code: 200, data: { accessToken: "new-token", expireIn: 7200 } });
      }
      return Response.json({ code: 500, msg: "unexpected request" }, { status: 500 });
    }) as typeof fetch;

    try {
      const client = new A2CClient(config(), tokenStore);
      const cacheKey = "https://a2c.test/api/openapi\u0000app-id-retry\u0000app-secret-retry";
      tokenStore.set(cacheKey, "cached-token", Date.now() + 7_200_000);

      await expect(client.sendMessage({
        to: "customer",
        senderPhoneNumber: "sender",
        type: "text",
        content: "hello"
      })).rejects.toThrow("访问过于频繁");

      expect(calls.filter((item) => item.includes("/open/auth/token"))).toHaveLength(0);
      expect(calls.filter((item) => item.includes("/v1/messages"))).toHaveLength(1);
      expect(tokenStore.get(cacheKey)?.accessToken).toBe("cached-token");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("persists auth rate-limit cooldown so another client does not hit auth again", async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    const store = new Map<string, { accessToken: string; expiresAt: number }>();
    const blocked = new Map<string, number>();
    const tokenStore: A2CTokenStore = {
      get: (key) => store.get(key),
      set: (key, accessToken, expiresAt) => store.set(key, { accessToken, expiresAt }),
      getAuthBlockedUntil: (key) => blocked.get(key),
      setAuthBlockedUntil: (key, blockedUntil) => blocked.set(key, blockedUntil),
      clear: (key) => store.delete(key)
    };

    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/open/auth/token")) {
        return Response.json({ code: 429, msg: "Visit too frequently, please try again later" }, { status: 429 });
      }
      return Response.json({ code: 500, msg: "unexpected request" }, { status: 500 });
    }) as typeof fetch;

    try {
      const runtimeConfig = configWithCredentials("rate-limit-app", "rate-limit-secret");
      const cacheKey = "https://a2c.test/api/openapi\u0000rate-limit-app\u0000rate-limit-secret";

      await expect(new A2CClient(runtimeConfig, tokenStore).listAccounts()).rejects.toThrow("Visit too frequently");
      expect(blocked.get(cacheKey) || 0).toBeGreaterThan(Date.now());

      await expect(new A2CClient(runtimeConfig, tokenStore).listAccounts()).rejects.toThrow("Visit too frequently");
      expect(calls.filter((item) => item.includes("/open/auth/token"))).toHaveLength(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
