import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

function testConfig() {
  return loadConfig({
    DATABASE_URL: ":memory:",
    INTERNAL_API_KEY: "test-key",
    SESSION_SECRET: "test-secret",
    DEFAULT_ADMIN_EMAIL: "admin@test.local",
    DEFAULT_ADMIN_PASSWORD: "Admin123456",
    GOOGLE_AI_API_KEY: "",
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

function multipartUploadPayload(filename: string, contentType: string, content: string | Buffer) {
  const boundary = "----codex-test-boundary";
  const contentBuffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const head = Buffer.from(
    [
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="${filename}"`,
      `Content-Type: ${contentType}`,
      "",
      ""
    ].join("\r\n")
  );
  const tail = Buffer.from(["", `--${boundary}--`, ""].join("\r\n"));
  const body = Buffer.concat([head, contentBuffer, tail]);
  return {
    payload: body,
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "content-length": String(body.length)
    }
  };
}

function csvUploadPayload(csv: string) {
  return multipartUploadPayload("samples.csv", "text/csv; charset=utf-8", csv);
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
    expect(webhook.json().status).toBe("reply_send_failed");

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
    const inbound = messages.json().rows.find((row: { direction: string }) => row.direction === "inbound");
    expect(inbound.rawPayload).toMatchObject({
      originalContent: "发我链接",
      translatedContent: "发我链接",
      targetLanguage: "zh-CN"
    });
    const outbound = messages.json().rows.find((row: { direction: string }) => row.direction === "outbound");
    expect(outbound.content).toBe("请点击专属链接注册：https://merchant.example/register");
    expect(outbound.rawPayload).toMatchObject({
      a2cSendStatus: "failed"
    });

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

  it("hard deletes a merchant conversation and its orphaned customer data", async () => {
    const app = buildApp(testConfig());
    const adminCookie = await login(app, "admin@test.local", "Admin123456");

    const merchant = await app.inject({
      method: "POST",
      url: "/api/admin/merchants",
      headers: { cookie: adminCookie },
      payload: { name: "会话删除测试" }
    });
    const merchantId = merchant.json().id as string;

    await app.inject({
      method: "PATCH",
      url: `/api/admin/merchants/${merchantId}/config`,
      headers: { cookie: adminCookie },
      payload: { a2cAccountPhone: "delete-test-a2c" }
    });
    await app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers: { cookie: adminCookie },
      payload: {
        merchantId,
        email: "delete-merchant@test.local",
        name: "删除管理员",
        password: "Merchant123456",
        role: "merchant_admin"
      }
    });
    const merchantCookie = await login(app, "delete-merchant@test.local", "Merchant123456");

    const webhook = await app.inject({
      method: "POST",
      url: "/webhooks/a2c",
      payload: {
        id: "delete-event-1",
        timestamp: Math.floor(Date.now() / 1000),
        type: "CUSTOMER_MESSAGE",
        data: {
          messageId: "delete-message-1",
          content: "hello",
          from: "delete-customer-1",
          to: "delete-test-a2c",
          msgType: "text",
          timestamp: Math.floor(Date.now() / 1000),
          nickname: "删除客户"
        }
      }
    });
    expect(webhook.statusCode).toBe(200);

    const conversations = await app.inject({
      method: "GET",
      url: "/api/merchant/conversations",
      headers: { cookie: merchantCookie }
    });
    expect(conversations.json().rows).toHaveLength(1);
    const conversationId = conversations.json().rows[0].id as string;

    const memory = await app.inject({
      method: "GET",
      url: `/api/merchant/conversations/${conversationId}/memory`,
      headers: { cookie: merchantCookie }
    });
    expect(memory.statusCode).toBe(200);

    const customersBeforeDelete = await app.inject({
      method: "GET",
      url: "/api/merchant/customers",
      headers: { cookie: merchantCookie }
    });
    expect(customersBeforeDelete.json().rows).toHaveLength(1);

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/merchant/conversations/${conversationId}`,
      headers: { cookie: merchantCookie }
    });
    expect(deleted.statusCode).toBe(200);

    const conversationsAfterDelete = await app.inject({
      method: "GET",
      url: "/api/merchant/conversations",
      headers: { cookie: merchantCookie }
    });
    expect(conversationsAfterDelete.json().rows).toHaveLength(0);

    const messagesAfterDelete = await app.inject({
      method: "GET",
      url: `/api/merchant/conversations/${conversationId}/messages`,
      headers: { cookie: merchantCookie }
    });
    expect(messagesAfterDelete.statusCode).toBe(404);

    const memoryAfterDelete = await app.inject({
      method: "GET",
      url: `/api/merchant/conversations/${conversationId}/memory`,
      headers: { cookie: merchantCookie }
    });
    expect(memoryAfterDelete.statusCode).toBe(404);

    const customersAfterDelete = await app.inject({
      method: "GET",
      url: "/api/merchant/customers",
      headers: { cookie: merchantCookie }
    });
    expect(customersAfterDelete.json().rows).toHaveLength(0);

    await app.close();
  });

  it("imports merchant training materials into samples and knowledge with tenant isolation", async () => {
    const app = buildApp(testConfig());
    const adminCookie = await login(app, "admin@test.local", "Admin123456");

    const merchantA = await app.inject({
      method: "POST",
      url: "/api/admin/merchants",
      headers: { cookie: adminCookie },
      payload: { name: "素材商户A" }
    });
    const merchantB = await app.inject({
      method: "POST",
      url: "/api/admin/merchants",
      headers: { cookie: adminCookie },
      payload: { name: "素材商户B" }
    });
    const merchantAId = merchantA.json().id as string;
    const merchantBId = merchantB.json().id as string;
    await app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers: { cookie: adminCookie },
      payload: { merchantId: merchantAId, email: "materials-a@test.local", name: "素材A", password: "Merchant123456", role: "merchant_admin" }
    });
    await app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers: { cookie: adminCookie },
      payload: { merchantId: merchantBId, email: "materials-b@test.local", name: "素材B", password: "Merchant123456", role: "merchant_admin" }
    });
    const cookieA = await login(app, "materials-a@test.local", "Merchant123456");
    const cookieB = await login(app, "materials-b@test.local", "Merchant123456");

    const csv = [
      "客户消息,标准回复,适用阶段,客户意图,语言,关键词,优先级,是否启用",
      "注册链接在哪里,请使用固定注册链接：https://merchant-a.example/register,need_platform_register,ask_link,zh,链接,80,是"
    ].join("\n");
    const csvUpload = multipartUploadPayload("chat-samples.csv", "text/csv; charset=utf-8", csv);
    const csvImport = await app.inject({
      method: "POST",
      url: "/api/merchant/training-materials/import",
      headers: { cookie: cookieA, ...csvUpload.headers },
      payload: csvUpload.payload
    });
    expect(csvImport.statusCode).toBe(200);
    expect(csvImport.json()).toMatchObject({ imported: 1, samples: 1, knowledge: 0 });

    const txtUpload = multipartUploadPayload("faq.txt", "text/plain; charset=utf-8", "开户链接必须保持为 https://merchant-a.example/register\n\nTelegram 引导要提醒客户发送 @username。");
    const txtImport = await app.inject({
      method: "POST",
      url: "/api/merchant/training-materials/import",
      headers: { cookie: cookieA, ...txtUpload.headers },
      payload: txtUpload.payload
    });
    expect(txtImport.statusCode).toBe(200);
    expect(txtImport.json()).toMatchObject({ imported: 2, samples: 0, knowledge: 2 });

    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><text>客户完成注册后，收集手机号和 Telegram。</text></svg>`;
    const imageUpload = multipartUploadPayload("script.svg", "image/svg+xml", svg);
    const imageImport = await app.inject({
      method: "POST",
      url: "/api/merchant/training-materials/import",
      headers: { cookie: cookieA, ...imageUpload.headers },
      payload: imageUpload.payload
    });
    expect(imageImport.statusCode).toBe(200);
    expect(imageImport.json()).toMatchObject({ imported: 1, samples: 0, knowledge: 1 });

    const samples = await app.inject({
      method: "GET",
      url: "/api/merchant/training-samples?intent=ask_link&enabled=true",
      headers: { cookie: cookieA }
    });
    expect(samples.json().rows[0].standardReply).toContain("https://merchant-a.example/register");

    const knowledge = await app.inject({
      method: "GET",
      url: "/api/merchant/knowledge?type=script&enabled=true",
      headers: { cookie: cookieA }
    });
    expect(knowledge.json().rows.map((row: { content: string }) => row.content).join("\n")).toContain("Telegram");

    const materials = await app.inject({
      method: "GET",
      url: "/api/merchant/training-materials",
      headers: { cookie: cookieA }
    });
    expect(materials.json().rows).toHaveLength(3);
    const materialId = materials.json().rows[0].id as number;

    const detail = await app.inject({
      method: "GET",
      url: `/api/merchant/training-materials/${materialId}`,
      headers: { cookie: cookieA }
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().items.length).toBeGreaterThan(0);

    const forbidden = await app.inject({
      method: "GET",
      url: `/api/merchant/training-materials/${materialId}`,
      headers: { cookie: cookieB }
    });
    expect(forbidden.statusCode).toBe(404);

    const adminList = await app.inject({
      method: "GET",
      url: `/api/admin/training-materials?merchantId=${merchantAId}`,
      headers: { cookie: adminCookie }
    });
    expect(adminList.json().rows).toHaveLength(3);

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

  it("auto-creates customer profiles from webhooks and merges them per merchant customer", async () => {
    const app = buildApp(testConfig());
    const adminCookie = await login(app, "admin@test.local", "Admin123456");

    const merchantA = await app.inject({ method: "POST", url: "/api/admin/merchants", headers: { cookie: adminCookie }, payload: { name: "自动客户商户A" } });
    const merchantB = await app.inject({ method: "POST", url: "/api/admin/merchants", headers: { cookie: adminCookie }, payload: { name: "自动客户商户B" } });
    const merchantAId = merchantA.json().id as string;
    const merchantBId = merchantB.json().id as string;

    await app.inject({ method: "PATCH", url: `/api/admin/merchants/${merchantAId}/config`, headers: { cookie: adminCookie }, payload: { a2cAccountPhone: "auto-a2c-a-1,auto-a2c-a-2" } });
    await app.inject({ method: "PATCH", url: `/api/admin/merchants/${merchantBId}/config`, headers: { cookie: adminCookie }, payload: { a2cAccountPhone: "auto-a2c-b-1" } });
    await app.inject({ method: "POST", url: "/api/admin/users", headers: { cookie: adminCookie }, payload: { merchantId: merchantAId, email: "auto-customer-a@test.local", name: "A", password: "Merchant123456", role: "merchant_admin" } });
    await app.inject({ method: "POST", url: "/api/admin/users", headers: { cookie: adminCookie }, payload: { merchantId: merchantBId, email: "auto-customer-b@test.local", name: "B", password: "Merchant123456", role: "merchant_admin" } });
    const cookieA = await login(app, "auto-customer-a@test.local", "Merchant123456");
    const cookieB = await login(app, "auto-customer-b@test.local", "Merchant123456");

    await app.inject({
      method: "POST",
      url: "/webhooks/a2c",
      payload: {
        id: "auto-customer-event-1",
        timestamp: Math.floor(Date.now() / 1000),
        type: "CUSTOMER_MESSAGE",
        data: {
          messageId: "auto-customer-message-1",
          content: "你好，我要注册链接",
          from: "auto-customer-phone",
          to: "auto-a2c-a-1",
          msgType: "text",
          timestamp: Math.floor(Date.now() / 1000),
          nickname: "自动客户"
        }
      }
    });

    const customersA = await app.inject({ method: "GET", url: "/api/merchant/customers", headers: { cookie: cookieA } });
    expect(customersA.statusCode).toBe(200);
    expect(customersA.json().rows).toHaveLength(1);
    expect(customersA.json().rows[0]).toMatchObject({
      customerKey: "auto-customer-phone",
      nickname: "自动客户",
      lastA2CAccountPhone: "auto-a2c-a-1",
      conversationCount: 1
    });

    const customersB = await app.inject({ method: "GET", url: "/api/merchant/customers", headers: { cookie: cookieB } });
    expect(customersB.json().rows).toHaveLength(0);

    await app.inject({
      method: "POST",
      url: "/webhooks/a2c",
      payload: {
        id: "auto-customer-event-2",
        timestamp: Math.floor(Date.now() / 1000),
        type: "CUSTOMER_MESSAGE",
        data: {
          messageId: "auto-customer-message-2",
          content: "phone +60123456789 tg @auto_customer",
          from: "auto-customer-phone",
          to: "auto-a2c-a-2",
          msgType: "text",
          timestamp: Math.floor(Date.now() / 1000)
        }
      }
    });

    const merged = await app.inject({ method: "GET", url: "/api/merchant/customers", headers: { cookie: cookieA } });
    expect(merged.json().rows).toHaveLength(1);
    expect(merged.json().rows[0]).toMatchObject({
      customerKey: "auto-customer-phone",
      lastA2CAccountPhone: "auto-a2c-a-2",
      extractedPhone: "+60123456789",
      extractedTelegram: "@auto_customer",
      status: "human_handoff",
      conversationCount: 2
    });

    const adminCustomers = await app.inject({ method: "GET", url: `/api/admin/customers?merchantId=${merchantAId}`, headers: { cookie: adminCookie } });
    expect(adminCustomers.json().rows).toHaveLength(1);

    await app.close();
  });

  it("syncs A2C sender accounts from merchant credentials and uses them for webhook routing", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/open/auth/token")) {
        return Response.json({ code: 200, data: { accessToken: "a2c-sync-token", expireIn: 3600 } });
      }
      if (url.endsWith("/v1/accounts")) {
        return Response.json({
          code: 200,
          data: [
            { apiPhone: "synced-a2c-1", wabaId: "waba-1", status: 1, numberStatus: 1, qualityRating: 3, messagingLimit: 1000, verifiedName: "客服一" },
            { apiPhone: "synced-a2c-2", wabaId: "waba-2", status: 1, numberStatus: 1, qualityRating: 3, messagingLimit: 1000, verifiedName: "客服二" }
          ]
        });
      }
      if (url.endsWith("/v1/messages")) {
        return Response.json({ code: 200, data: "synced-message-id" });
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
        payload: { name: "A2C同步商户" }
      });
      const merchantId = merchant.json().id as string;

      await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { cookie: adminCookie },
        payload: { merchantId, email: "a2c-sync@test.local", name: "A2C同步", password: "Merchant123456", role: "merchant_admin" }
      });
      const merchantCookie = await login(app, "a2c-sync@test.local", "Merchant123456");

      await app.inject({
        method: "PATCH",
        url: "/api/merchant/config",
        headers: { cookie: merchantCookie },
        payload: { a2cBaseUrl: "https://a2c.test/api/openapi", a2cAppId: "app-id", a2cAppSecret: "app-secret" }
      });

      const sync = await app.inject({
        method: "POST",
        url: "/api/merchant/a2c/accounts/sync",
        headers: { cookie: merchantCookie }
      });
      expect(sync.statusCode).toBe(200);
      expect(sync.json().imported).toBe(2);
      expect(sync.json().rows.map((row: { apiPhone: string }) => row.apiPhone)).toEqual(["synced-a2c-1", "synced-a2c-2"]);
      expect(sync.json().config.a2cAccountPhone).toBe("synced-a2c-1,synced-a2c-2");

      const webhook = await app.inject({
        method: "POST",
        url: "/webhooks/a2c",
        payload: {
          id: "a2c-sync-event-1",
          timestamp: Math.floor(Date.now() / 1000),
          type: "CUSTOMER_MESSAGE",
          data: {
            messageId: "a2c-sync-message-1",
            content: "发注册链接",
            from: "a2c-sync-customer",
            to: "synced-a2c-2",
            msgType: "text",
            timestamp: Math.floor(Date.now() / 1000)
          }
        }
      });
      expect(webhook.statusCode).toBe(200);
      expect(webhook.json().status).toBe("replied");

      const conversations = await app.inject({ method: "GET", url: "/api/merchant/conversations", headers: { cookie: merchantCookie } });
      expect(conversations.json().rows[0]).toMatchObject({ merchantId, a2cAccountPhone: "synced-a2c-2" });

      const accounts = await app.inject({ method: "GET", url: "/api/merchant/a2c/accounts", headers: { cookie: merchantCookie } });
      const disabled = await app.inject({
        method: "PATCH",
        url: `/api/merchant/a2c/accounts/${accounts.json().rows[1].id}`,
        headers: { cookie: merchantCookie },
        payload: { enabled: false }
      });
      expect(disabled.statusCode).toBe(200);
      expect(disabled.json().config.a2cAccountPhone).toBe("synced-a2c-1");
    } finally {
      await app.close();
      globalThis.fetch = originalFetch;
    }
  });

  it("routes merchant-specific A2C webhook urls directly to the merchant", async () => {
    const app = buildApp(testConfig());
    const adminCookie = await login(app, "admin@test.local", "Admin123456");

    const merchant = await app.inject({
      method: "POST",
      url: "/api/admin/merchants",
      headers: { cookie: adminCookie },
      payload: { name: "专属Webhook商户" }
    });
    const merchantId = merchant.json().id as string;
    await app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers: { cookie: adminCookie },
      payload: { merchantId, email: "merchant-webhook@test.local", name: "Webhook商户", password: "Merchant123456", role: "merchant_admin" }
    });
    const merchantCookie = await login(app, "merchant-webhook@test.local", "Merchant123456");

    const webhook = await app.inject({
      method: "POST",
      url: `/webhooks/a2c/${merchantId}`,
      payload: {
        id: "merchant-webhook-event-1",
        timestamp: Math.floor(Date.now() / 1000),
        type: "CUSTOMER_MESSAGE",
        data: {
          messageId: "merchant-webhook-message-1",
          content: "你好",
          from: "merchant-webhook-customer",
          to: "unconfigured-a2c-account",
          msgType: "text",
          timestamp: Math.floor(Date.now() / 1000)
        }
      }
    });
    expect(webhook.statusCode).toBe(200);
    expect(webhook.json().status).toBe("reply_send_failed");

    const conversations = await app.inject({ method: "GET", url: "/api/merchant/conversations", headers: { cookie: merchantCookie } });
    expect(conversations.json().rows).toHaveLength(1);
    expect(conversations.json().rows[0]).toMatchObject({ merchantId, a2cAccountPhone: "unconfigured-a2c-account" });

    const invalid = await app.inject({
      method: "POST",
      url: "/webhooks/a2c/not-a-merchant",
      payload: {
        id: "merchant-webhook-event-2",
        timestamp: Math.floor(Date.now() / 1000),
        type: "CUSTOMER_MESSAGE",
        data: {
          messageId: "merchant-webhook-message-2",
          content: "你好",
          from: "merchant-webhook-customer",
          to: "unconfigured-a2c-account",
          msgType: "text",
          timestamp: Math.floor(Date.now() / 1000)
        }
      }
    });
    expect(invalid.statusCode).toBe(404);

    await app.close();
  });

  it("auto-binds telegram handoff chat from bot group updates", async () => {
    const originalFetch = globalThis.fetch;
    const telegramCalls: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      telegramCalls.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
      return Response.json({ ok: true, result: true });
    }) as typeof fetch;

    const app = buildApp(testConfig());
    try {
      const adminCookie = await login(app, "admin@test.local", "Admin123456");
      const merchant = await app.inject({
        method: "POST",
        url: "/api/admin/merchants",
        headers: { cookie: adminCookie },
        payload: { name: "TG自动绑定商户" }
      });
      const merchantId = merchant.json().id as string;
      await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { cookie: adminCookie },
        payload: { merchantId, email: "telegram-bind@test.local", name: "TG绑定", password: "Merchant123456", role: "merchant_admin" }
      });
      const merchantCookie = await login(app, "telegram-bind@test.local", "Merchant123456");

      await app.inject({
        method: "PATCH",
        url: "/api/merchant/config",
        headers: { cookie: merchantCookie },
        payload: { telegramBotToken: "123456:test-token" }
      });
      const setup = await app.inject({
        method: "POST",
        url: "/api/merchant/telegram/setup-webhook",
        headers: { cookie: merchantCookie, host: "service.test", "x-forwarded-proto": "https" }
      });
      expect(setup.statusCode).toBe(200);
      expect(setup.json().config.telegramHandoffChatStatus).toBe("waiting");
      expect(telegramCalls[0]).toMatchObject({
        url: `https://service.test/webhooks/telegram/${merchantId}`,
        allowed_updates: ["message", "my_chat_member"]
      });

      const secret = createHmac("sha256", "test-secret").update(`telegram:${merchantId}`).digest("hex");
      const bound = await app.inject({
        method: "POST",
        url: `/webhooks/telegram/${merchantId}`,
        headers: { "x-telegram-bot-api-secret-token": secret },
        payload: {
          update_id: 1,
          message: { text: "/bind", chat: { id: -1001234567890, type: "supergroup", title: "阿斯顿接管群" } }
        }
      });
      expect(bound.statusCode).toBe(200);
      expect(bound.json()).toMatchObject({ ok: true, status: "bound", chatId: "-1001234567890" });

      const config = await app.inject({ method: "GET", url: "/api/merchant/config", headers: { cookie: merchantCookie } });
      expect(config.json()).toMatchObject({
        telegramHandoffChatId: "-1001234567890",
        telegramHandoffChatTitle: "阿斯顿接管群",
        telegramHandoffChatStatus: "bound"
      });

      const removed = await app.inject({
        method: "POST",
        url: `/webhooks/telegram/${merchantId}`,
        headers: { "x-telegram-bot-api-secret-token": secret },
        payload: {
          update_id: 2,
          my_chat_member: {
            chat: { id: -1001234567890, type: "supergroup", title: "阿斯顿接管群" },
            new_chat_member: { status: "kicked" }
          }
        }
      });
      expect(removed.statusCode).toBe(200);

      const invalidConfig = await app.inject({ method: "GET", url: "/api/merchant/config", headers: { cookie: merchantCookie } });
      expect(invalidConfig.json().telegramHandoffChatStatus).toBe("invalid");
      expect(invalidConfig.json().telegramHandoffChatError).toContain("removed");
    } finally {
      await app.close();
      globalThis.fetch = originalFetch;
    }
  });

  it("checks merchant integration config status", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/open/auth/token")) {
        return Response.json({ code: 200, data: { accessToken: "token-for-check", expireIn: 3600 } });
      }
      if (url.endsWith("/v1/accounts")) {
        return Response.json({ code: 200, data: [{ apiPhone: "check-a2c-account", verifiedName: "检测账号" }] });
      }
      if (url.includes("generativelanguage.googleapis.com")) {
        return Response.json({ candidates: [{ content: { parts: [{ text: "OK" }] } }] });
      }
      if (url.includes("api.telegram.org") && url.endsWith("/getMe")) {
        return Response.json({ ok: true, result: { username: "check_bot" } });
      }
      if (url.includes("api.telegram.org") && url.endsWith("/getChat")) {
        return Response.json({ ok: true, result: { title: "检测接管群" } });
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
        payload: { name: "配置检测商户" }
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
          googleAiApiKey: "gemini-test",
          googleAiModel: "gemini-2.5-flash",
          telegramBotToken: "tg-token",
          telegramHandoffChatId: "-100123",
          platformRegisterUrl: "https://merchant.example/register"
        }
      });
      await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { cookie: adminCookie },
        payload: {
          merchantId,
          email: "check-merchant@test.local",
          name: "配置检测员",
          password: "Merchant123456",
          role: "merchant_admin"
        }
      });
      const merchantCookie = await login(app, "check-merchant@test.local", "Merchant123456");
      const checked = await app.inject({
        method: "GET",
        url: "/api/merchant/config/check",
        headers: { cookie: merchantCookie }
      });

      expect(checked.statusCode).toBe(200);
      expect(checked.json().ok).toBe(true);
      expect(checked.json().rows.map((row: { key: string; ok: boolean }) => [row.key, row.ok])).toEqual([
        ["a2c", true],
        ["gemini", true],
        ["telegram", true],
        ["platformRegisterUrl", true]
      ]);
    } finally {
      await app.close();
      globalThis.fetch = originalFetch;
    }
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

      const textSent = await app.inject({
        method: "POST",
        url: `/api/merchant/conversations/${conversationId}/send`,
        headers: { cookie: merchantCookie },
        payload: { type: "text", content: "请把手机号和 Telegram 发给我" }
      });
      expect(textSent.statusCode).toBe(200);
      expect(sentBodies[1]).toMatchObject({
        to: "manual-customer-phone",
        senderPhoneNumber: "manual-a2c-account",
        type: 1,
        content: "请把手机号和 Telegram 发给我"
      });

      const messages = await app.inject({
        method: "GET",
        url: `/api/merchant/conversations/${conversationId}/messages`,
        headers: { cookie: merchantCookie }
      });
      const outbound = messages.json().rows.find((row: { direction: string; content: string }) => row.direction === "outbound" && row.content === "图片说明");
      expect(outbound).toBeTruthy();
      const translated = messages.json().rows.find((row: { rawPayload?: { originalContent?: string } }) => row.rawPayload?.originalContent === "请把手机号和 Telegram 发给我");
      expect(translated.rawPayload).toMatchObject({
        originalContent: "请把手机号和 Telegram 发给我",
        translatedContent: "请把手机号和 Telegram 发给我"
      });
    } finally {
      await app.close();
      globalThis.fetch = originalFetch;
    }
  });

  it("lets merchants proactively start a customer chat from a selected A2C account", async () => {
    const originalFetch = globalThis.fetch;
    const sentBodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/open/auth/token")) {
        return Response.json({ code: 200, data: { accessToken: "proactive-token", expireIn: 3600 } });
      }
      if (url.endsWith("/v1/accounts")) {
        return Response.json({
          code: 200,
          data: [{ apiPhone: "proactive-a2c", wabaId: "waba-proactive", status: 1, numberStatus: 1, qualityRating: 3, messagingLimit: 1000, verifiedName: "主动客服" }]
        });
      }
      if (url.endsWith("/v1/messages")) {
        sentBodies.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
        return Response.json({ code: 200, data: "proactive-message-id" });
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
        payload: { name: "主动发送商户" }
      });
      const merchantId = merchant.json().id as string;
      await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { cookie: adminCookie },
        payload: { merchantId, email: "proactive@test.local", name: "主动发送", password: "Merchant123456", role: "merchant_admin" }
      });
      const merchantCookie = await login(app, "proactive@test.local", "Merchant123456");

      await app.inject({
        method: "PATCH",
        url: "/api/merchant/config",
        headers: { cookie: merchantCookie },
        payload: { a2cBaseUrl: "https://a2c.test/api/openapi", a2cAppId: "app-id", a2cAppSecret: "app-secret" }
      });
      const sync = await app.inject({
        method: "POST",
        url: "/api/merchant/a2c/accounts/sync",
        headers: { cookie: merchantCookie }
      });
      expect(sync.statusCode).toBe(200);

      const sent = await app.inject({
        method: "POST",
        url: "/api/merchant/a2c/accounts/proactive-a2c/send",
        headers: { cookie: merchantCookie },
        payload: { customerPhone: "proactive-customer", nickname: "新客户", type: "text", content: "Hello, please register first." }
      });

      expect(sent.statusCode).toBe(200);
      expect(sent.json().conversation).toMatchObject({ merchantId, customerPhone: "proactive-customer", a2cAccountPhone: "proactive-a2c" });
      expect(sentBodies[0]).toMatchObject({
        to: "proactive-customer",
        senderPhoneNumber: "proactive-a2c",
        type: 1,
        content: "Hello, please register first."
      });

      const conversations = await app.inject({
        method: "GET",
        url: "/api/merchant/conversations?a2cAccountPhone=proactive-a2c",
        headers: { cookie: merchantCookie }
      });
      expect(conversations.json().rows).toHaveLength(1);
      expect(conversations.json().rows[0]).toMatchObject({ customerPhone: "proactive-customer", a2cAccountPhone: "proactive-a2c" });
    } finally {
      await app.close();
      globalThis.fetch = originalFetch;
    }
  });

  it("isolates conversations, memories, and unread counts by A2C account country", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/open/auth/token")) return Response.json({ code: 200, data: { accessToken: "country-token", expireIn: 3600 } });
      if (url.endsWith("/v1/accounts")) {
        return Response.json({
          code: 200,
          data: [
            { apiPhone: "br-a2c", verifiedName: "Brasil" },
            { apiPhone: "ph-a2c", verifiedName: "Philippines" }
          ]
        });
      }
      if (url.endsWith("/v1/messages")) return Response.json({ code: 200, data: "country-message" });
      return Response.json({ ok: true });
    }) as typeof fetch;

    const app = buildApp(testConfig());
    try {
      const adminCookie = await login(app, "admin@test.local", "Admin123456");
      const merchant = await app.inject({
        method: "POST",
        url: "/api/admin/merchants",
        headers: { cookie: adminCookie },
        payload: { name: "多国家商户" }
      });
      const merchantId = merchant.json().id as string;
      await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { cookie: adminCookie },
        payload: { merchantId, email: "countries@test.local", name: "多国家", password: "Merchant123456", role: "merchant_admin" }
      });
      const merchantCookie = await login(app, "countries@test.local", "Merchant123456");

      const br = await app.inject({
        method: "POST",
        url: "/api/merchant/countries",
        headers: { cookie: merchantCookie },
        payload: { code: "br", name: "Brazil", defaultLanguage: "pt-BR", platformRegisterUrl: "https://br.example/register" }
      });
      const ph = await app.inject({
        method: "POST",
        url: "/api/merchant/countries",
        headers: { cookie: merchantCookie },
        payload: { code: "ph", name: "Philippines", defaultLanguage: "en", requireTelegram: false, requireWhatsApp: true }
      });

      await app.inject({
        method: "PATCH",
        url: "/api/merchant/config",
        headers: { cookie: merchantCookie },
        payload: { a2cBaseUrl: "https://a2c.test/api/openapi", a2cAppId: "app-id", a2cAppSecret: "app-secret" }
      });
      await app.inject({ method: "POST", url: "/api/merchant/a2c/accounts/sync", headers: { cookie: merchantCookie } });
      const accounts = await app.inject({ method: "GET", url: "/api/merchant/a2c/accounts", headers: { cookie: merchantCookie } });
      const brAccount = accounts.json().rows.find((row: { apiPhone: string }) => row.apiPhone === "br-a2c");
      const phAccount = accounts.json().rows.find((row: { apiPhone: string }) => row.apiPhone === "ph-a2c");
      await app.inject({ method: "PATCH", url: `/api/merchant/a2c/accounts/${brAccount.id}`, headers: { cookie: merchantCookie }, payload: { countryId: br.json().id } });
      await app.inject({ method: "PATCH", url: `/api/merchant/a2c/accounts/${phAccount.id}`, headers: { cookie: merchantCookie }, payload: { countryId: ph.json().id } });

      for (const [to, messageId] of [["br-a2c", "country-br-message"], ["ph-a2c", "country-ph-message"]] as const) {
        await app.inject({
          method: "POST",
          url: "/webhooks/a2c",
          payload: {
            id: messageId,
            timestamp: Math.floor(Date.now() / 1000),
            type: "CUSTOMER_MESSAGE",
            data: {
              messageId,
              content: "Hello, I need help",
              from: "same-customer",
              to,
              msgType: "text",
              timestamp: Math.floor(Date.now() / 1000)
            }
          }
        });
      }

      const conversations = await app.inject({ method: "GET", url: "/api/merchant/conversations", headers: { cookie: merchantCookie } });
      expect(conversations.json().rows).toHaveLength(2);
      expect(new Set(conversations.json().rows.map((row: { countryId: string }) => row.countryId))).toEqual(new Set([br.json().id, ph.json().id]));

      for (const row of conversations.json().rows as Array<{ id: string; countryId: string }>) {
        const memory = await app.inject({ method: "GET", url: `/api/merchant/conversations/${row.id}/memory`, headers: { cookie: merchantCookie } });
        expect(memory.json().countryId).toBe(row.countryId);
      }

      const unread = await app.inject({ method: "GET", url: "/api/merchant/conversations/unread-summary", headers: { cookie: merchantCookie } });
      expect(unread.json().rows.map((row: { a2cAccountPhone: string; unreadCount: number }) => [row.a2cAccountPhone, row.unreadCount]).sort()).toEqual([["br-a2c", 1], ["ph-a2c", 1]]);

      const brConversation = conversations.json().rows.find((row: { a2cAccountPhone: string }) => row.a2cAccountPhone === "br-a2c");
      await app.inject({ method: "POST", url: `/api/merchant/conversations/${brConversation.id}/read`, headers: { cookie: merchantCookie } });
      const unreadAfterRead = await app.inject({ method: "GET", url: "/api/merchant/conversations/unread-summary", headers: { cookie: merchantCookie } });
      expect(unreadAfterRead.json().rows.map((row: { a2cAccountPhone: string }) => row.a2cAccountPhone)).toEqual(["ph-a2c"]);
    } finally {
      await app.close();
      globalThis.fetch = originalFetch;
    }
  });
});
