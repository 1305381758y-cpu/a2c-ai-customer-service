import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

function testConfig() {
  return loadConfig({
    DATABASE_URL: ":memory:",
    INTERNAL_API_KEY: "test-key",
    SESSION_SECRET: "test-secret",
    DEFAULT_ADMIN_EMAIL: "admin@test.local",
    DEFAULT_ADMIN_PASSWORD: "Admin123456",
    OPENAI_API_KEY: "",
    A2C_APP_ID: "",
    A2C_APP_SECRET: ""
  });
}

async function login(app: ReturnType<typeof buildApp>, email: string, password: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email, password }
  });
  expect(response.statusCode).toBe(200);
  return String(response.headers["set-cookie"]);
}

function csvUploadPayload(csv: string) {
  const boundary = "----codex-test-boundary";
  const body = Buffer.from(
    [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="samples.csv"',
      "Content-Type: text/csv; charset=utf-8",
      "",
      csv,
      `--${boundary}--`,
      ""
    ].join("\r\n")
  );
  return {
    payload: body,
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "content-length": String(body.length)
    }
  };
}

describe("portal api", () => {
  it("lets merchants manage knowledge items without crossing tenant boundaries", async () => {
    const app = buildApp(testConfig());
    const adminCookie = await login(app, "admin@test.local", "Admin123456");

    const merchant = await app.inject({
      method: "POST",
      url: "/api/admin/merchants",
      headers: { cookie: adminCookie },
      payload: { name: "商户知识库测试" }
    });
    const merchantId = merchant.json().id as string;

    await app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers: { cookie: adminCookie },
      payload: {
        merchantId,
        email: "merchant@test.local",
        name: "商户管理员",
        password: "Merchant123456",
        role: "merchant_admin"
      }
    });
    const merchantCookie = await login(app, "merchant@test.local", "Merchant123456");

    const defaultKnowledge = await app.inject({
      method: "POST",
      url: "/api/admin/knowledge",
      headers: { cookie: adminCookie },
      payload: { merchantId: "default", type: "rule", title: "默认规则", content: "默认商户规则" }
    });
    expect(defaultKnowledge.statusCode).toBe(200);

    const created = await app.inject({
      method: "POST",
      url: "/api/merchant/knowledge",
      headers: { cookie: merchantCookie },
      payload: { type: "faq", title: "开户链接", content: "开户地址：https://merchant.example/register", language: "zh", priority: 20 }
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().merchantId).toBe(merchantId);

    const isolatedPatch = await app.inject({
      method: "PATCH",
      url: `/api/merchant/knowledge/${defaultKnowledge.json().id}`,
      headers: { cookie: merchantCookie },
      payload: { enabled: false }
    });
    expect(isolatedPatch.statusCode).toBe(404);

    const disabled = await app.inject({
      method: "PATCH",
      url: `/api/merchant/knowledge/${created.json().id}`,
      headers: { cookie: merchantCookie },
      payload: { enabled: false, priority: 1 }
    });
    expect(disabled.statusCode).toBe(200);
    expect(disabled.json().enabled).toBe(false);

    const merchantRows = await app.inject({
      method: "GET",
      url: "/api/merchant/knowledge?enabled=false",
      headers: { cookie: merchantCookie }
    });
    expect(merchantRows.statusCode).toBe(200);
    expect(merchantRows.json().rows).toHaveLength(1);
    expect(merchantRows.json().rows[0].title).toBe("开户链接");

    const adminRows = await app.inject({
      method: "GET",
      url: `/api/admin/knowledge?merchantId=${merchantId}`,
      headers: { cookie: adminCookie }
    });
    expect(adminRows.json().rows).toHaveLength(1);

    await app.close();
  });

  it("makes uploaded merchant samples immediately available to webhook replies", async () => {
    const app = buildApp(testConfig());
    const adminCookie = await login(app, "admin@test.local", "Admin123456");

    const merchant = await app.inject({
      method: "POST",
      url: "/api/admin/merchants",
      headers: { cookie: adminCookie },
      payload: { name: "商户样本测试" }
    });
    const merchantId = merchant.json().id as string;

    await app.inject({
      method: "PATCH",
      url: `/api/admin/merchants/${merchantId}/config`,
      headers: { cookie: adminCookie },
      payload: { a2cAccountPhone: "merchant-a2c-account" }
    });
    await app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers: { cookie: adminCookie },
      payload: {
        merchantId,
        email: "sample-merchant@test.local",
        name: "样本管理员",
        password: "Merchant123456",
        role: "merchant_admin"
      }
    });
    const merchantCookie = await login(app, "sample-merchant@test.local", "Merchant123456");

    const csv = [
      "客户消息,标准回复,适用阶段,客户意图,语言,关键词,优先级,是否启用",
      "发我链接,请点击专属链接注册：https://merchant.example/register,need_platform_register,ask_link,zh,链接 注册,50,是"
    ].join("\n");
    const upload = csvUploadPayload(csv);
    const imported = await app.inject({
      method: "POST",
      url: "/api/merchant/training-samples/import",
      headers: { cookie: merchantCookie, ...upload.headers },
      payload: upload.payload
    });
    expect(imported.statusCode).toBe(200);
    expect(imported.json()).toEqual({ imported: 1, enabled: 1 });

    const samples = await app.inject({
      method: "GET",
      url: "/api/merchant/training-samples?intent=ask_link&enabled=true",
      headers: { cookie: merchantCookie }
    });
    expect(samples.json().rows).toHaveLength(1);

    const webhook = await app.inject({
      method: "POST",
      url: "/webhooks/a2c",
      payload: {
        id: "event-1",
        timestamp: Math.floor(Date.now() / 1000),
        type: "CUSTOMER_MESSAGE",
        data: {
          messageId: "customer-message-1",
          content: "发我链接",
          from: "customer-phone-1",
          to: "merchant-a2c-account",
          msgType: "text",
          timestamp: Math.floor(Date.now() / 1000),
          nickname: "客户一"
        }
      }
    });
    expect(webhook.statusCode).toBe(200);
    expect(webhook.json().status).toBe("replied");

    const conversations = await app.inject({
      method: "GET",
      url: "/api/merchant/conversations",
      headers: { cookie: merchantCookie }
    });
    expect(conversations.json().rows).toHaveLength(1);

    const messages = await app.inject({
      method: "GET",
      url: `/api/merchant/conversations/${conversations.json().rows[0].id}/messages`,
      headers: { cookie: merchantCookie }
    });
    const outbound = messages.json().rows.find((row: { direction: string }) => row.direction === "outbound");
    expect(outbound.content).toBe("请点击专属链接注册：https://merchant.example/register");

    const memory = await app.inject({
      method: "GET",
      url: `/api/merchant/conversations/${conversations.json().rows[0].id}/memory`,
      headers: { cookie: merchantCookie }
    });
    expect(memory.statusCode).toBe(200);
    expect(memory.json().summary).toContain("最近意图: ask_link");
    expect(memory.json().facts.recentSignals.length).toBeGreaterThanOrEqual(2);

    const patchedMemory = await app.inject({
      method: "PATCH",
      url: `/api/merchant/conversations/${conversations.json().rows[0].id}/memory`,
      headers: { cookie: merchantCookie },
      payload: { operatorNotes: "客户偏好葡语，优先发送简短说明。" }
    });
    expect(patchedMemory.statusCode).toBe(200);
    expect(patchedMemory.json().operatorNotes).toContain("葡语");

    const adminConversations = await app.inject({
      method: "GET",
      url: `/api/admin/conversations?merchantId=${merchantId}`,
      headers: { cookie: adminCookie }
    });
    expect(adminConversations.json().rows).toHaveLength(1);

    await app.close();
  });

  it("keeps customer memory isolated between merchants", async () => {
    const app = buildApp(testConfig());
    const adminCookie = await login(app, "admin@test.local", "Admin123456");

    const merchantA = await app.inject({ method: "POST", url: "/api/admin/merchants", headers: { cookie: adminCookie }, payload: { name: "记忆商户A" } });
    const merchantB = await app.inject({ method: "POST", url: "/api/admin/merchants", headers: { cookie: adminCookie }, payload: { name: "记忆商户B" } });
    await app.inject({ method: "PATCH", url: `/api/admin/merchants/${merchantA.json().id}/config`, headers: { cookie: adminCookie }, payload: { a2cAccountPhone: "memory-a2c-a" } });

    await app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers: { cookie: adminCookie },
      payload: { merchantId: merchantA.json().id, email: "memory-a@test.local", name: "A", password: "Merchant123456", role: "merchant_admin" }
    });
    await app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers: { cookie: adminCookie },
      payload: { merchantId: merchantB.json().id, email: "memory-b@test.local", name: "B", password: "Merchant123456", role: "merchant_admin" }
    });
    const cookieA = await login(app, "memory-a@test.local", "Merchant123456");
    const cookieB = await login(app, "memory-b@test.local", "Merchant123456");

    await app.inject({
      method: "POST",
      url: "/webhooks/a2c",
      payload: {
        id: "memory-event-a",
        timestamp: Math.floor(Date.now() / 1000),
        type: "CUSTOMER_MESSAGE",
        data: {
          messageId: "memory-message-a",
          content: "olá, quero fazer cadastro",
          from: "memory-customer",
          to: "memory-a2c-a",
          msgType: "text",
          timestamp: Math.floor(Date.now() / 1000)
        }
      }
    });

    const conversationsA = await app.inject({ method: "GET", url: "/api/merchant/conversations", headers: { cookie: cookieA } });
    const conversationId = conversationsA.json().rows[0].id as string;

    const forbidden = await app.inject({
      method: "GET",
      url: `/api/merchant/conversations/${conversationId}/memory`,
      headers: { cookie: cookieB }
    });
    expect(forbidden.statusCode).toBe(404);

    await app.close();
  });

  it("sends manual merchant messages through A2C with the conversation account", async () => {
    const originalFetch = globalThis.fetch;
    const sentBodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/open/auth/token")) {
        return Response.json({ code: 200, data: { accessToken: "token-for-test", expireIn: 3600 } });
      }
      if (url.endsWith("/v1/messages")) {
        sentBodies.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
        return Response.json({ code: 200, data: `manual-${sentBodies.length}` });
      }
      return Response.json({ ok: true });
    }) as typeof fetch;

    const app = buildApp(testConfig());
    try {
      const adminCookie = await login(app, "admin@test.local", "Admin123456");
      const merchant = await app.inject({
        method: "POST",
        url: "/api/admin/merchants",
        headers: { cookie: adminCookie },
        payload: { name: "手动发送测试" }
      });
      const merchantId = merchant.json().id as string;

      await app.inject({
        method: "PATCH",
        url: `/api/admin/merchants/${merchantId}/config`,
        headers: { cookie: adminCookie },
        payload: {
          a2cBaseUrl: "https://a2c.test/api/openapi",
          a2cAppId: "app-id",
          a2cAppSecret: "app-secret",
          a2cAccountPhone: "manual-a2c-account"
        }
      });
      await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { cookie: adminCookie },
        payload: {
          merchantId,
          email: "manual-merchant@test.local",
          name: "手动发送员",
          password: "Merchant123456",
          role: "merchant_operator"
        }
      });
      const merchantCookie = await login(app, "manual-merchant@test.local", "Merchant123456");

      const webhook = await app.inject({
        method: "POST",
        url: "/webhooks/a2c",
        payload: {
          id: "manual-event-1",
          timestamp: Math.floor(Date.now() / 1000),
          type: "CUSTOMER_MESSAGE",
          data: {
            messageId: "manual-customer-message-1",
            content: "phone +60123456789 tg @customer_123",
            from: "manual-customer-phone",
            to: "manual-a2c-account",
            msgType: "text",
            timestamp: Math.floor(Date.now() / 1000),
            nickname: "手动客户"
          }
        }
      });
      expect(webhook.json().status).toBe("handoff");

      const conversations = await app.inject({
        method: "GET",
        url: "/api/merchant/conversations?status=human_handoff",
        headers: { cookie: merchantCookie }
      });
      const conversationId = conversations.json().rows[0].id as string;

      const sent = await app.inject({
        method: "POST",
        url: `/api/merchant/conversations/${conversationId}/send`,
        headers: { cookie: merchantCookie },
        payload: { type: "image", url: "https://cdn.example/image.png", caption: "图片说明", fileName: "image.png" }
      });

      expect(sent.statusCode).toBe(200);
      expect(sent.json().externalId).toBe("manual-1");
      expect(sentBodies[0]).toMatchObject({
        to: "manual-customer-phone",
        senderPhoneNumber: "manual-a2c-account",
        type: 2,
        url: "https://cdn.example/image.png",
        caption: "图片说明",
        fileName: "image.png"
      });

      const messages = await app.inject({
        method: "GET",
        url: `/api/merchant/conversations/${conversationId}/messages`,
        headers: { cookie: merchantCookie }
      });
      const outbound = messages.json().rows.find((row: { direction: string; content: string }) => row.direction === "outbound" && row.content === "图片说明");
      expect(outbound).toBeTruthy();
    } finally {
      await app.close();
      globalThis.fetch = originalFetch;
    }
  });
});
