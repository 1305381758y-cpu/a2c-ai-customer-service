import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";
import { sendProactiveManualOutboundMessage } from "../src/services/manualOutboundMessaging.js";

describe("sendProactiveManualOutboundMessage", () => {
  it("rejects disabled or unknown A2C accounts before creating a conversation", async () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("主动发送服务商户");

    const result = await sendProactiveManualOutboundMessage({
      config: loadConfig({ DATABASE_URL: ":memory:" }),
      repos
    }, {
      merchantId: merchant.id,
      apiPhone: "missing-a2c",
      customerPhone: "customer-1",
      body: { type: "text", content: "hello" }
    });

    expect(result).toEqual({ ok: false, statusCode: 404, error: "a2c account not found or disabled" });
    expect(repos.listConversations({ merchantId: merchant.id })).toHaveLength(0);
  });

  it("creates the customer conversation and records outbound memory for proactive sends", async () => {
    const originalFetch = globalThis.fetch;
    const sentBodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/open/auth/token")) {
        return Response.json({ code: 200, data: { accessToken: "manual-token", expireIn: 3600 } });
      }
      if (url.endsWith("/v1/messages")) {
        sentBodies.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
        return Response.json({ code: 200, data: "manual-proactive-1" });
      }
      return Response.json({ ok: true });
    }) as typeof fetch;

    try {
      const db = openDb(":memory:");
      const repos = new Repositories(db);
      const merchant = repos.createMerchant("主动发送服务商户");
      repos.patchMerchantConfig(merchant.id, {
        a2cBaseUrl: "https://a2c.test/api/openapi",
        a2cAppId: "app-id",
        a2cAppSecret: "app-secret"
      });
      repos.syncMerchantA2CAccounts(merchant.id, [{
        apiPhone: "enabled-a2c",
        wabaId: "waba",
        status: 1,
        numberStatus: 1,
        qualityRating: 3,
        messagingLimit: 1000,
        verifiedName: "主动客服"
      }]);

      const result = await sendProactiveManualOutboundMessage({
        config: loadConfig({ DATABASE_URL: ":memory:" }),
        repos
      }, {
        merchantId: merchant.id,
        apiPhone: "enabled-a2c",
        customerPhone: "customer-2",
        nickname: "新客户",
        body: { type: "text", content: "Hello, please register first." }
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.externalId).toBe("manual-proactive-1");
      expect(result.value.conversation).toMatchObject({
        merchantId: merchant.id,
        customerPhone: "customer-2",
        a2cAccountPhone: "enabled-a2c",
        nickname: "新客户"
      });
      expect(sentBodies[0]).toMatchObject({
        to: "customer-2",
        senderPhoneNumber: "enabled-a2c",
        type: 1,
        content: "Hello, please register first."
      });
      const messages = repos.listConversationMessages(result.value.conversation.id, 10);
      expect(messages.find((message) => message.direction === "outbound")?.rawPayload).toMatchObject({
        replyMode: "manual",
        proactive: true,
        a2cSendStatus: "sent"
      });
      const memory = repos.getCustomerMemoryByConversation(result.value.conversation.id);
      expect(memory?.facts.recentSignals).toEqual(expect.arrayContaining([
        expect.objectContaining({ direction: "outbound", content: "Hello, please register first." })
      ]));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
