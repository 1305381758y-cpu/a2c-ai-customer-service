import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";

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
  it("runs merchant training simulator through webhook logic without sending to A2C", async () => {
    const app = buildApp(testConfig());
    const adminCookie = await login(app, "admin@test.local", "Admin123456");
    const created = await app.inject({
      method: "POST",
      url: "/api/admin/merchants",
      headers: { cookie: adminCookie },
      payload: {
        name: "阿斯顿",
        country: {
          code: "br",
          name: "巴西",
          defaultLanguage: "zh",
          platformRegisterUrl: "https://register.example",
          requirePlatformAccount: true,
          requirePhone: true,
          requireTelegram: true,
          requireWhatsApp: false
        },
        adminUser: {
          email: "merchant-sim@test.local",
          name: "模拟商户",
          password: "Merchant123456"
        }
      }
    });
    expect(created.statusCode).toBe(200);
    const merchantCookie = await login(app, "merchant-sim@test.local", "Merchant123456");
    const patchConfig = await app.inject({
      method: "PATCH",
      url: "/api/merchant/config",
      headers: { cookie: merchantCookie },
      payload: {
        smartReplyEnabled: false,
        strictScriptFlowEnabled: true
      }
    });
    expect(patchConfig.statusCode).toBe(200);

    const response = await app.inject({
      method: "POST",
      url: "/api/merchant/training-simulator/messages",
      headers: { cookie: merchantCookie },
      payload: {
        customerPhone: "sim-customer-001",
        a2cAccountPhone: "18507251675",
        nickname: "模拟客户",
        content: "你好"
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { status: string; rows: Array<{ direction: string; content: string; rawPayload?: Record<string, unknown> }> };
    expect(body.status).toBe("strict_flow_simulated");
    const outbound = body.rows.find((row) => row.direction === "outbound");
    expect(outbound?.content).toMatch(/兼职|online|trabalho/i);
    expect(outbound?.rawPayload?.a2cSendStatus).toBe("simulated");
    expect(outbound?.rawPayload?.simulation).toBe(true);
    await app.close();
  });

  it("keeps agent profiles isolated per merchant and applies review candidates after approval", async () => {
    const app = buildApp(testConfig());
    const adminCookie = await login(app, "admin@test.local", "Admin123456");
    const createA = await app.inject({
      method: "POST",
      url: "/api/admin/merchants",
      headers: { cookie: adminCookie },
      payload: {
        name: "Agent商户A",
        country: { code: "br", name: "巴西", defaultLanguage: "zh", platformRegisterUrl: "https://register.example" },
        adminUser: { email: "agent-a@test.local", name: "Agent A", password: "Merchant123456" }
      }
    });
    const createB = await app.inject({
      method: "POST",
      url: "/api/admin/merchants",
      headers: { cookie: adminCookie },
      payload: {
        name: "Agent商户B",
        country: { code: "ph", name: "菲律宾", defaultLanguage: "en", platformRegisterUrl: "https://register-b.example" },
        adminUser: { email: "agent-b@test.local", name: "Agent B", password: "Merchant123456" }
      }
    });
    expect(createA.statusCode).toBe(200);
    expect(createB.statusCode).toBe(200);
    const merchantA = createA.json().merchant as { id: string };
    const merchantB = createB.json().merchant as { id: string };
    const cookieA = await login(app, "agent-a@test.local", "Merchant123456");
    const cookieB = await login(app, "agent-b@test.local", "Merchant123456");

    const patched = await app.inject({
      method: "PATCH",
      url: "/api/merchant/agent-profile",
      headers: { cookie: cookieA },
      payload: { agentName: "十年接待专员A", toneStyle: "更像真人，短句回答", enabled: true }
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().agentName).toBe("十年接待专员A");
    const profileB = await app.inject({ method: "GET", url: "/api/merchant/agent-profile", headers: { cookie: cookieB } });
    expect(profileB.statusCode).toBe(200);
    expect(profileB.json().agentName).not.toBe("十年接待专员A");
    const adminProfile = await app.inject({ method: "GET", url: `/api/admin/merchants/${merchantA.id}/agent-profile`, headers: { cookie: adminCookie } });
    expect(adminProfile.json().agentName).toBe("十年接待专员A");
    const adminProfileB = await app.inject({ method: "GET", url: `/api/admin/merchants/${merchantB.id}/agent-profile`, headers: { cookie: adminCookie } });
    expect(adminProfileB.json().merchantId).toBe(merchantB.id);

    await app.inject({
      method: "PATCH",
      url: "/api/merchant/config",
      headers: { cookie: cookieA },
      payload: { trainingSimulationEnabled: true, strictScriptFlowEnabled: true, smartReplyEnabled: true }
    });
    const first = await app.inject({
      method: "POST",
      url: "/api/merchant/training-simulator/messages",
      headers: { cookie: cookieA },
      payload: { customerPhone: "review-customer-001", a2cAccountPhone: "18507251675", content: "你好" }
    });
    expect(first.statusCode).toBe(200);
    const conversation = first.json().conversation as { id: string };
    await app.inject({
      method: "POST",
      url: "/api/merchant/training-simulator/messages",
      headers: { cookie: cookieA },
      payload: { customerPhone: "review-customer-001", a2cAccountPhone: "18507251675", content: "这个安全吗" }
    });

    const review = await app.inject({ method: "POST", url: `/api/merchant/conversations/${conversation.id}/review`, headers: { cookie: cookieA } });
    expect(review.statusCode).toBe(200);
    expect(review.json().review.score).toBeGreaterThanOrEqual(0);
    expect(review.json().items.length).toBeGreaterThan(0);
    const candidate = review.json().items.find((item: { itemType: string; status: string }) => item.itemType === "sample" && item.status === "candidate") ?? review.json().items[0];
    const applied = await app.inject({
      method: "POST",
      url: `/api/merchant/conversations/${conversation.id}/review/apply`,
      headers: { cookie: cookieA },
      payload: { itemId: candidate.id }
    });
    expect(applied.statusCode).toBe(200);
    expect(applied.json().rows[0].status).toBe("applied");
    const samplesA = await app.inject({ method: "GET", url: "/api/merchant/training-samples", headers: { cookie: cookieA } });
    const samplesB = await app.inject({ method: "GET", url: "/api/merchant/training-samples", headers: { cookie: cookieB } });
    expect(samplesA.json().rows.length).toBeGreaterThan(0);
    expect(samplesB.json().rows.length).toBe(0);
    await app.close();
  });

  it("creates editable script flows, enables one active flow, and protects referenced steps", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("话本商户");
    const flow = repos.createScriptFlow(merchant.id, {
      name: "直营网话本",
      steps: [
        {
          flowCode: "A",
          flowName: "兴趣筛选",
          flowStep: "interest_screening",
          standardReply: "您好，是否有兴趣？",
          nextFlowCode: "B",
          nextFlowStep: "registration_intent",
          sortOrder: 1
        },
        {
          flowCode: "B",
          flowName: "项目介绍",
          flowStep: "registration_intent",
          standardReply: "这里是自定义项目介绍。",
          sortOrder: 2
        }
      ],
      createdBy: "测试员"
    });

    expect(flow.flow.stepCount).toBe(2);
    expect(flow.steps[0].flowStep).toBe("interest_screening");

    const enabled = repos.enableScriptFlow(flow.flow.id, merchant.id, "测试员");
    expect(enabled?.flow.active).toBe(true);
    expect(repos.getActiveScriptFlow(merchant.id)?.flow.id).toBe(flow.flow.id);

    const patched = repos.patchScriptFlowStep(flow.steps[1].id, merchant.id, { standardReply: "更新后的项目介绍。" }, "测试员");
    expect(patched?.standardReply).toBe("更新后的项目介绍。");
    expect(repos.listScriptFlowVersions(flow.flow.id, merchant.id).length).toBeGreaterThanOrEqual(3);

    expect(() => repos.deleteScriptFlowStep(flow.steps[1].id, merchant.id, "测试员")).toThrow(/引用/);
  });

  it("reserves invite codes when A2C account phone formats differ by country code", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("邀请码格式测试");
    const accounts = repos.syncMerchantA2CAccounts(merchant.id, [{ apiPhone: "18507251675", verifiedName: "Numidia" }]);
    const invite = repos.createInviteCodeForA2CAccount(accounts[0].id, {
      code: "BR001",
      registerUrl: "https://register.example/?code={code}"
    }, merchant.id);

    const reserved = repos.reserveInviteCodeForConversation({
      id: "conv-format-test",
      merchantId: merchant.id,
      countryId: accounts[0].countryId,
      customerPhone: "5511913586749",
      a2cAccountPhone: "8507251675"
    });

    expect(reserved).toMatchObject({
      id: invite.id,
      code: "BR001",
      status: "reserved",
      assignedConversationId: "conv-format-test"
    });
  });

  it("falls back to an available country invite code when the receiving A2C account format does not match", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("国家邀请码兜底测试");
    const accounts = repos.syncMerchantA2CAccounts(merchant.id, [
      { apiPhone: "18507251675", verifiedName: "Numidia" },
      { apiPhone: "unmatched-a2c", verifiedName: "Unmatched" }
    ]);
    const invite = repos.createInviteCodeForA2CAccount(accounts[0].id, {
      code: "BR-FALLBACK",
      registerUrl: "https://register.example/?code={code}"
    }, merchant.id);

    const reserved = repos.reserveInviteCodeForConversation({
      id: "conv-country-fallback",
      merchantId: merchant.id,
      countryId: accounts[0].countryId,
      customerPhone: "5511913586749",
      a2cAccountPhone: "unmatched-a2c"
    });

    expect(reserved).toMatchObject({
      id: invite.id,
      code: "BR-FALLBACK",
      status: "reserved",
      assignedConversationId: "conv-country-fallback"
    });
  });

  it("learns missing intent candidates from webhook messages and aggregates repeats", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/open/auth/token")) return Response.json({ code: 200, data: { accessToken: "intent-learning-token", expireIn: 3600 } });
      if (url.endsWith("/v1/messages")) return Response.json({ code: 200, data: `intent-learning-sent-${Date.now()}` });
      return Response.json({ code: 200, data: "ok" });
    }) as typeof fetch;

    const app = buildApp(testConfig());
    try {
      const adminCookie = await login(app, "admin@test.local", "Admin123456");
      const merchant = await app.inject({
        method: "POST",
        url: "/api/admin/merchants",
        headers: { cookie: adminCookie },
        payload: { name: "意图学习商户" }
      });
      const merchantId = (merchant.json().merchant?.id ?? merchant.json().id) as string;
      await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { cookie: adminCookie },
        payload: { merchantId, email: "intent-learning@test.local", name: "意图学习", password: "Merchant123456", role: "merchant_admin" }
      });
      const merchantCookie = await login(app, "intent-learning@test.local", "Merchant123456");
      await app.inject({
        method: "PATCH",
        url: "/api/merchant/config",
        headers: { cookie: merchantCookie },
        payload: {
          a2cBaseUrl: "https://intent-learning-a2c.test/api/openapi",
          a2cAppId: "intent-learning-app",
          a2cAppSecret: "intent-learning-secret",
          strictScriptFlowEnabled: true
        }
      });

      for (const index of [1, 2]) {
        const webhook = await app.inject({
          method: "POST",
          url: `/webhooks/a2c/${merchantId}`,
          payload: {
            id: `intent-learning-event-${index}`,
            timestamp: Math.floor(Date.now() / 1000),
            type: "CUSTOMER_MESSAGE",
            data: {
              messageId: `intent-learning-message-${index}`,
              content: "蓝色香蕉权益是什么东西？",
              from: "intent-learning-customer",
              to: "intent-learning-a2c",
              msgType: "text",
              timestamp: Math.floor(Date.now() / 1000)
            }
          }
        });
        expect(webhook.statusCode).toBe(200);
      }

      const list = await app.inject({
        method: "GET",
        url: "/api/merchant/intent-learning",
        headers: { cookie: merchantCookie }
      });
      expect(list.statusCode).toBe(200);
      const rows = list.json().rows as Array<{ id: number; suggestedIntent: string; occurrenceCount: number; examples: unknown[]; detectedIntent: string }>;
      expect(rows).toHaveLength(1);
      expect(rows[0].suggestedIntent).toBe("custom_unknown_question");
      expect(rows[0].occurrenceCount).toBe(2);
      expect(rows[0].examples.length).toBeGreaterThanOrEqual(1);

      const promoted = await app.inject({
        method: "PATCH",
        url: `/api/merchant/intent-learning/${rows[0].id}`,
        headers: { cookie: merchantCookie },
        payload: { status: "promoted", suggestedIntent: "investment_concern", displayName: "投资疑问" }
      });
      expect(promoted.statusCode).toBe(200);

      const learnedWebhook = await app.inject({
        method: "POST",
        url: `/webhooks/a2c/${merchantId}`,
        payload: {
          id: "intent-learning-event-3",
          timestamp: Math.floor(Date.now() / 1000),
          type: "CUSTOMER_MESSAGE",
          data: {
            messageId: "intent-learning-message-3",
            content: "蓝色香蕉权益是什么东西？",
            from: "intent-learning-customer",
            to: "intent-learning-a2c",
            msgType: "text",
            timestamp: Math.floor(Date.now() / 1000)
          }
        }
      });
      expect(learnedWebhook.statusCode).toBe(200);

      const conversations = await app.inject({
        method: "GET",
        url: "/api/merchant/conversations",
        headers: { cookie: merchantCookie }
      });
      const conversationId = conversations.json().rows[0].id as string;
      const messages = await app.inject({
        method: "GET",
        url: `/api/merchant/conversations/${conversationId}/messages?limit=20`,
        headers: { cookie: merchantCookie }
      });
      const outbound = [...messages.json().rows].reverse().find((item: { direction: string }) => item.direction === "outbound") as { rawPayload: Record<string, any> };
      expect(outbound.rawPayload.learnedIntent?.suggestedIntent).toBe("investment_concern");
      expect(outbound.rawPayload.contextualIntent?.intent).toBe("investment_concern");
    } finally {
      await app.close();
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps webhook replies in the configured country language for short customer messages", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/open/auth/token")) return Response.json({ code: 200, data: { accessToken: "spanish-language-token", expireIn: 3600 } });
      if (url.endsWith("/v1/messages")) return Response.json({ code: 200, data: `spanish-language-sent-${Date.now()}` });
      return Response.json({ code: 200, data: "ok" });
    }) as typeof fetch;

    const app = buildApp(testConfig());
    try {
      const adminCookie = await login(app, "admin@test.local", "Admin123456");
      const merchant = await app.inject({
        method: "POST",
        url: "/api/admin/merchants",
        headers: { cookie: adminCookie },
        payload: {
          name: "西语短句商户",
          country: {
            code: "bo",
            name: "玻利维亚",
            defaultLanguage: "es",
            platformRegisterUrl: "https://register.example",
            requirePlatformAccount: true,
            requirePhone: true,
            requireTelegram: true,
            requireWhatsApp: false
          },
          adminUser: { email: "spanish-language@test.local", name: "西语短句", password: "Merchant123456" }
        }
      });
      expect(merchant.statusCode).toBe(200);
      const merchantId = (merchant.json().merchant?.id ?? merchant.json().id) as string;
      const merchantCookie = await login(app, "spanish-language@test.local", "Merchant123456");
      await app.inject({
        method: "PATCH",
        url: "/api/merchant/config",
        headers: { cookie: merchantCookie },
        payload: {
          a2cBaseUrl: "https://spanish-language-a2c.test/api/openapi",
          a2cAppId: "spanish-language-app",
          a2cAppSecret: "spanish-language-secret",
          strictScriptFlowEnabled: true
        }
      });

      for (const [index, content] of ["Information", "OK", "Yes"].entries()) {
        const webhook = await app.inject({
          method: "POST",
          url: `/webhooks/a2c/${merchantId}`,
          payload: {
            id: `spanish-language-event-${index}`,
            timestamp: Math.floor(Date.now() / 1000),
            type: "CUSTOMER_MESSAGE",
            data: {
              messageId: `spanish-language-message-${index}`,
              content,
              from: "spanish-language-customer",
              to: "spanish-language-a2c",
              msgType: "text",
              timestamp: Math.floor(Date.now() / 1000)
            }
          }
        });
        expect(webhook.statusCode).toBe(200);
      }

      const conversations = await app.inject({
        method: "GET",
        url: "/api/merchant/conversations",
        headers: { cookie: merchantCookie }
      });
      const conversation = conversations.json().rows[0] as { id: string; language: string };
      expect(conversation.language).toBe("es");
      const messages = await app.inject({
        method: "GET",
        url: `/api/merchant/conversations/${conversation.id}/messages?limit=20`,
        headers: { cookie: merchantCookie }
      });
      const rows = messages.json().rows as Array<{ direction: string; content: string; language: string }>;
      const inboundRows = rows.filter((row) => row.direction === "inbound");
      expect(inboundRows.map((row) => row.language)).toEqual(["es", "es", "es"]);
      const outboundRows = rows.filter((row) => row.direction === "outbound");
      expect(outboundRows.length).toBeGreaterThanOrEqual(2);
      expect(outboundRows.at(-1)?.language).toBe("es");
      expect(outboundRows.at(-1)?.content).toMatch(/registro|trabajo|plataforma/i);
      expect(outboundRows.at(-1)?.content).not.toMatch(/Hello|online part-time job|Got it/i);
    } finally {
      await app.close();
      globalThis.fetch = originalFetch;
    }
  });

  it("trusts the configured country language even when the AI language detector returns English", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/open/auth/token")) return Response.json({ code: 200, data: { accessToken: "spanish-ai-language-token", expireIn: 3600 } });
      if (url.endsWith("/v1/messages")) return Response.json({ code: 200, data: `spanish-ai-language-sent-${Date.now()}` });
      if (url.includes("/v1/text/chatcompletion_v2") || url.includes("/v1/chat/completions")) {
        return Response.json({ choices: [{ message: { content: "en" } }] });
      }
      return Response.json({ code: 200, data: "ok" });
    }) as typeof fetch;

    const app = buildApp(testConfig());
    try {
      const adminCookie = await login(app, "admin@test.local", "Admin123456");
      const merchant = await app.inject({
        method: "POST",
        url: "/api/admin/merchants",
        headers: { cookie: adminCookie },
        payload: {
          name: "西语供应商误判商户",
          country: {
            code: "bo",
            name: "玻利维亚",
            defaultLanguage: "es",
            platformRegisterUrl: "https://register.example",
            requirePlatformAccount: true,
            requirePhone: true,
            requireTelegram: true,
            requireWhatsApp: false
          },
          adminUser: { email: "spanish-ai-language@test.local", name: "西语供应商误判", password: "Merchant123456" }
        }
      });
      expect(merchant.statusCode).toBe(200);
      const merchantId = (merchant.json().merchant?.id ?? merchant.json().id) as string;
      const merchantCookie = await login(app, "spanish-ai-language@test.local", "Merchant123456");
      await app.inject({
        method: "PATCH",
        url: "/api/merchant/config",
        headers: { cookie: merchantCookie },
        payload: {
          a2cBaseUrl: "https://spanish-ai-language-a2c.test/api/openapi",
          a2cAppId: "spanish-ai-language-app",
          a2cAppSecret: "spanish-ai-language-secret",
          aiProvider: "minimax",
          minimaxApiKey: "sk-test",
          minimaxModel: "MiniMax-M3",
          strictScriptFlowEnabled: true
        }
      });

      for (const [index, content] of ["Información", "X favor", "Si"].entries()) {
        const webhook = await app.inject({
          method: "POST",
          url: `/webhooks/a2c/${merchantId}`,
          payload: {
            id: `spanish-ai-language-event-${index}`,
            timestamp: Math.floor(Date.now() / 1000),
            type: "CUSTOMER_MESSAGE",
            data: {
              messageId: `spanish-ai-language-message-${index}`,
              content,
              from: "spanish-ai-language-customer",
              to: "spanish-ai-language-a2c",
              msgType: "text",
              timestamp: Math.floor(Date.now() / 1000)
            }
          }
        });
        expect(webhook.statusCode).toBe(200);
      }

      const conversations = await app.inject({
        method: "GET",
        url: "/api/merchant/conversations",
        headers: { cookie: merchantCookie }
      });
      const conversation = conversations.json().rows[0] as { id: string; language: string };
      expect(conversation.language).toBe("es");
      const messages = await app.inject({
        method: "GET",
        url: `/api/merchant/conversations/${conversation.id}/messages?limit=20`,
        headers: { cookie: merchantCookie }
      });
      const rows = messages.json().rows as Array<{ direction: string; content: string; language: string }>;
      const inboundRows = rows.filter((row) => row.direction === "inbound");
      expect(inboundRows.map((row) => row.language)).toEqual(["es", "es", "es"]);
      const outboundRows = rows.filter((row) => row.direction === "outbound");
      expect(outboundRows.at(-1)?.language).toBe("es");
      expect(outboundRows.at(-1)?.content).not.toMatch(/Hello|online part-time job|Got it/i);
    } finally {
      await app.close();
      globalThis.fetch = originalFetch;
    }
  }, 15000);

  it("clears all training samples through the internal maintenance endpoint", async () => {
    const app = buildApp(testConfig());
    try {
      const adminCookie = await login(app, "admin@test.local", "Admin123456");
      const merchant = await app.inject({
        method: "POST",
        url: "/api/admin/merchants",
        headers: { cookie: adminCookie },
        payload: { name: "清空样本商户" }
      });
      const merchantId = merchant.json().id as string;
      await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { cookie: adminCookie },
        payload: { merchantId, email: "clear-samples@test.local", name: "清空样本", password: "Merchant123456", role: "merchant_admin" }
      });
      const merchantCookie = await login(app, "clear-samples@test.local", "Merchant123456");

      const defaultUpload = csvUploadPayload("客户消息,标准回复\n默认客户,默认回复");
      const merchantUpload = csvUploadPayload("客户消息,标准回复\n商户客户,商户回复");
      await app.inject({
        method: "POST",
        url: "/internal/training-samples/import",
        headers: { "x-api-key": "test-key", ...defaultUpload.headers },
        payload: defaultUpload.payload
      });
      await app.inject({
        method: "POST",
        url: "/api/merchant/training-samples/import",
        headers: { cookie: merchantCookie, ...merchantUpload.headers },
        payload: merchantUpload.payload
      });

      const before = await app.inject({ method: "GET", url: "/internal/training-samples", headers: { "x-api-key": "test-key" } });
      expect(before.json().rows).toHaveLength(2);

      const unauthorized = await app.inject({ method: "DELETE", url: "/internal/training-samples", headers: { "x-api-key": "wrong-key" } });
      expect(unauthorized.statusCode).toBe(401);

      const cleared = await app.inject({ method: "DELETE", url: "/internal/training-samples", headers: { "x-api-key": "test-key" } });
      expect(cleared.statusCode).toBe(200);
      expect(cleared.json()).toMatchObject({ ok: true, samplesDeleted: 2 });

      const after = await app.inject({ method: "GET", url: "/internal/training-samples", headers: { "x-api-key": "test-key" } });
      expect(after.json().rows).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it("clears learning, memory, training, and customer records without removing setup data", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/open/auth/token")) return Response.json({ code: 200, data: { accessToken: "token", expiresIn: 7200 } });
      if (url.endsWith("/v1/accounts")) return Response.json({ code: 200, data: [{ apiPhone: "18507251675", verifiedName: "测试客服账号" }] });
      if (url.endsWith("/v1/messages")) return Response.json({ code: 200, data: "sent-message" });
      if (url.includes("generativelanguage.googleapis.com")) return Response.json({ candidates: [{ content: { parts: [{ text: "好的" }] } }] });
      return Response.json({ ok: true });
    }) as typeof fetch;
    const app = buildApp(testConfig());
    try {
      const adminCookie = await login(app, "admin@test.local", "Admin123456");
      const merchant = await app.inject({
        method: "POST",
        url: "/api/admin/merchants",
        headers: { cookie: adminCookie },
        payload: {
          name: "清库商户",
          country: { code: "BR", name: "巴西", defaultLanguage: "pt", platformRegisterUrl: "https://merchant.example/register" },
          adminUser: { email: "clear-all@test.local", name: "清库管理员", password: "Merchant123456" }
        }
      });
      const merchantId = merchant.json().merchant.id as string;
      const merchantCookie = await login(app, "clear-all@test.local", "Merchant123456");

      await app.inject({
        method: "PATCH",
        url: `/api/admin/merchants/${merchantId}/config`,
        headers: { cookie: adminCookie },
        payload: { a2cBaseUrl: "https://a2c-clear.test/api/openapi", a2cAppId: "app", a2cAppSecret: "secret", a2cAccountPhone: "18507251675" }
      });
      const synced = await app.inject({ method: "POST", url: "/api/merchant/a2c/accounts/sync", headers: { cookie: merchantCookie } });
      expect(synced.statusCode).toBe(200);
      const accounts = await app.inject({ method: "GET", url: "/api/merchant/a2c/accounts", headers: { cookie: merchantCookie } });
      const accountId = accounts.json().rows[0].id as number;
      await app.inject({
        method: "POST",
        url: `/api/merchant/a2c/accounts/${accountId}/invite-codes/import`,
        headers: { cookie: merchantCookie },
        payload: { codes: "code-1", registerUrl: "https://merchant.example/register?code={code}" }
      });
      await app.inject({
        method: "POST",
        url: "/api/merchant/knowledge",
        headers: { cookie: merchantCookie },
        payload: { title: "FAQ", content: "开户注册说明", type: "faq" }
      });
      const upload = csvUploadPayload("客户消息,标准回复\n你好,您好");
      await app.inject({
        method: "POST",
        url: "/api/merchant/training-samples/import",
        headers: { cookie: merchantCookie, ...upload.headers },
        payload: upload.payload
      });
      await app.inject({
        method: "POST",
        url: "/webhooks/a2c",
        payload: {
          id: "clear-learning-event",
          timestamp: Math.floor(Date.now() / 1000),
          type: "CUSTOMER_MESSAGE",
          data: {
            messageId: "clear-learning-message",
            content: "你好",
            from: "5511913586749",
            to: "18507251675",
            msgType: "text",
            timestamp: Math.floor(Date.now() / 1000),
            nickname: "测试客户"
          }
        }
      });

      const wrongConfirm = await app.inject({
        method: "POST",
        url: "/internal/admin/clear-learning-data",
        headers: { "x-api-key": "test-key" },
        payload: { confirm: "WRONG" }
      });
      expect(wrongConfirm.statusCode).toBe(400);

      const cleared = await app.inject({
        method: "POST",
        url: "/internal/admin/clear-learning-data",
        headers: { "x-api-key": "test-key" },
        payload: { confirm: "CLEAR_LEARNING_AND_CUSTOMERS" }
      });
      expect(cleared.statusCode).toBe(200);
      expect(cleared.json().ok).toBe(true);
      expect(cleared.json().messagesDeleted).toBeGreaterThan(0);
      expect(cleared.json().conversationsDeleted).toBeGreaterThan(0);
      expect(cleared.json().customersDeleted).toBeGreaterThan(0);
      expect(cleared.json().trainingSamplesDeleted).toBeGreaterThan(0);
      expect(cleared.json().knowledgeItemsDeleted).toBeGreaterThan(0);

      const customers = await app.inject({ method: "GET", url: `/api/admin/customers?merchantId=${merchantId}`, headers: { cookie: adminCookie } });
      expect(customers.json().rows).toHaveLength(0);
      const conversations = await app.inject({ method: "GET", url: `/api/admin/conversations?merchantId=${merchantId}`, headers: { cookie: adminCookie } });
      expect(conversations.json().rows).toHaveLength(0);
      const samples = await app.inject({ method: "GET", url: `/api/admin/training-samples?merchantId=${merchantId}`, headers: { cookie: adminCookie } });
      expect(samples.json().rows).toHaveLength(0);
      const knowledge = await app.inject({ method: "GET", url: `/api/admin/knowledge?merchantId=${merchantId}`, headers: { cookie: adminCookie } });
      expect(knowledge.json().rows).toHaveLength(0);
      const inviteCodes = await app.inject({ method: "GET", url: `/api/merchant/a2c/accounts/${accountId}/invite-codes`, headers: { cookie: merchantCookie } });
      expect(inviteCodes.json().rows).toHaveLength(1);
      expect(inviteCodes.json().rows[0]).toMatchObject({ status: "available", assignedCustomerKey: "", assignedConversationId: "" });
      const merchants = await app.inject({ method: "GET", url: "/api/admin/merchants", headers: { cookie: adminCookie } });
      expect(merchants.json().rows.some((row: { id: string }) => row.id === merchantId)).toBe(true);
    } finally {
      await app.close();
      globalThis.fetch = originalFetch;
    }
  });

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
      originalContent: "请点击专属链接注册：https://merchant.example/register",
      operatorTranslatedContent: "请点击专属链接注册：https://merchant.example/register",
      operatorTranslationTargetLanguage: "zh-CN",
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

  it("hard deletes a customer with all conversations and learned reply samples", async () => {
    const app = buildApp(testConfig());
    const adminCookie = await login(app, "admin@test.local", "Admin123456");

    const merchant = await app.inject({
      method: "POST",
      url: "/api/admin/merchants",
      headers: { cookie: adminCookie },
      payload: { name: "客户删除测试" }
    });
    const merchantId = merchant.json().id as string;
    await app.inject({
      method: "PATCH",
      url: `/api/admin/merchants/${merchantId}/config`,
      headers: { cookie: adminCookie },
      payload: { a2cAccountPhone: "delete-customer-a2c-1,delete-customer-a2c-2" }
    });
    await app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers: { cookie: adminCookie },
      payload: {
        merchantId,
        email: "delete-customer@test.local",
        name: "客户删除管理员",
        password: "Merchant123456",
        role: "merchant_admin"
      }
    });
    const merchantCookie = await login(app, "delete-customer@test.local", "Merchant123456");

    for (const [index, account] of ["delete-customer-a2c-1", "delete-customer-a2c-2"].entries()) {
      const webhook = await app.inject({
        method: "POST",
        url: "/webhooks/a2c",
        payload: {
          id: `delete-customer-event-${index}`,
          timestamp: Math.floor(Date.now() / 1000),
          type: "CUSTOMER_MESSAGE",
          data: {
            messageId: `delete-customer-message-${index}`,
            content: index === 0 ? "hello" : "I need a job",
            from: "delete-all-customer",
            to: account,
            msgType: "text",
            timestamp: Math.floor(Date.now() / 1000),
            nickname: "整客删除"
          }
        }
      });
      expect(webhook.statusCode).toBe(200);
    }

    const conversations = await app.inject({ method: "GET", url: "/api/merchant/conversations", headers: { cookie: merchantCookie } });
    expect(conversations.json().rows).toHaveLength(2);
    const customers = await app.inject({ method: "GET", url: "/api/merchant/customers", headers: { cookie: merchantCookie } });
    expect(customers.json().rows).toHaveLength(1);

    const deleted = await app.inject({
      method: "DELETE",
      url: "/api/merchant/customers/delete-all-customer",
      headers: { cookie: merchantCookie }
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toMatchObject({ conversationsDeleted: 2 });

    const conversationsAfterDelete = await app.inject({ method: "GET", url: "/api/merchant/conversations", headers: { cookie: merchantCookie } });
    expect(conversationsAfterDelete.json().rows).toHaveLength(0);
    const customersAfterDelete = await app.inject({ method: "GET", url: "/api/merchant/customers", headers: { cookie: merchantCookie } });
    expect(customersAfterDelete.json().rows).toHaveLength(0);
    const samplesAfterDelete = await app.inject({ method: "GET", url: "/api/merchant/training-samples", headers: { cookie: merchantCookie } });
    expect(samplesAfterDelete.json().rows).toHaveLength(0);

    await app.close();
  });

  it("lists all conversations for one customer across service accounts", async () => {
    const app = buildApp(testConfig());
    const adminCookie = await login(app, "admin@test.local", "Admin123456");

    const merchant = await app.inject({
      method: "POST",
      url: "/api/admin/merchants",
      headers: { cookie: adminCookie },
      payload: { name: "客户会话查看测试" }
    });
    const merchantId = merchant.json().id as string;
    await app.inject({
      method: "PATCH",
      url: `/api/admin/merchants/${merchantId}/config`,
      headers: { cookie: adminCookie },
      payload: { a2cAccountPhone: "customer-history-a2c-1,customer-history-a2c-2,customer-history-a2c-3" }
    });
    await app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers: { cookie: adminCookie },
      payload: {
        merchantId,
        email: "customer-history@test.local",
        name: "客户会话查看管理员",
        password: "Merchant123456",
        role: "merchant_admin"
      }
    });
    const merchantCookie = await login(app, "customer-history@test.local", "Merchant123456");

    for (const [index, data] of [
      { from: "customer-history-001", to: "customer-history-a2c-1" },
      { from: "customer-history-001", to: "customer-history-a2c-2" },
      { from: "customer-history-002", to: "customer-history-a2c-3" }
    ].entries()) {
      const webhook = await app.inject({
        method: "POST",
        url: "/webhooks/a2c",
        payload: {
          id: `customer-history-event-${index}`,
          timestamp: Math.floor(Date.now() / 1000),
          type: "CUSTOMER_MESSAGE",
          data: {
            messageId: `customer-history-message-${index}`,
            content: "hello",
            from: data.from,
            to: data.to,
            msgType: "text",
            timestamp: Math.floor(Date.now() / 1000),
            nickname: "历史客户"
          }
        }
      });
      expect(webhook.statusCode).toBe(200);
    }

    const conversations = await app.inject({
      method: "GET",
      url: "/api/merchant/conversations?customerPhone=customer-history-001&limit=50000",
      headers: { cookie: merchantCookie }
    });
    expect(conversations.statusCode).toBe(200);
    expect(conversations.json().rows).toHaveLength(2);
    expect(new Set(conversations.json().rows.map((row: { customerPhone: string }) => row.customerPhone))).toEqual(new Set(["customer-history-001"]));
    expect(new Set(conversations.json().rows.map((row: { a2cAccountPhone: string }) => row.a2cAccountPhone))).toEqual(new Set(["customer-history-a2c-1", "customer-history-a2c-2"]));

    await app.close();
  });

  it("does not cap customer list requests at 500 rows", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("客户分页测试");
    for (let index = 0; index < 501; index += 1) {
      const conversation = repos.getOrCreateConversation(`bulk-customer-${index}`, `bulk-a2c-${index}`, "", merchant.id);
      repos.upsertCustomerFromConversation(conversation);
    }

    expect(repos.listCustomers({ merchantId: merchant.id, limit: 600 })).toHaveLength(501);
  });

  it("hard deletes legacy customer memories that still point to the removed conversation", async () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const conversation = repos.getOrCreateConversation("legacy-customer", "legacy-a2c", "历史客户", "default", "default:default");
    repos.updateCustomerMemoryFromMessage(conversation, { intent: "greeting", content: "hello", direction: "inbound" });
    db.sqlite
      .prepare(`
        INSERT INTO customer_memories
          (merchant_id, country_id, customer_key, conversation_id, language, stage, last_intent, summary)
        VALUES ('default', 'legacy-country', 'legacy-customer-key', ?, 'zh', 'need_platform_register', 'unknown', 'legacy stale memory')
      `)
      .run(conversation.id);

    expect(repos.deleteConversation(conversation.id, "default")).toBe(true);
    expect(repos.getConversation(conversation.id)).toBeUndefined();
    const staleMemories = db.sqlite
      .prepare("SELECT COUNT(*) AS count FROM customer_memories WHERE conversation_id = ?")
      .get(conversation.id) as { count: number };
    expect(staleMemories.count).toBe(0);
    db.sqlite.close();
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

  it("lets merchants manage invite codes under each A2C account", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/open/auth/token")) return Response.json({ code: 200, data: { accessToken: "invite-token", expireIn: 3600 } });
      if (url.endsWith("/v1/accounts")) {
        return Response.json({ code: 200, data: [{ apiPhone: "invite-a2c", wabaId: "waba", status: 1, numberStatus: 1, qualityRating: 3, messagingLimit: 1000, verifiedName: "邀请码客服" }] });
      }
      return Response.json({ code: 200, data: "ok" });
    }) as typeof fetch;

    const app = buildApp(testConfig());
    try {
      const adminCookie = await login(app, "admin@test.local", "Admin123456");
      const merchant = await app.inject({
        method: "POST",
        url: "/api/admin/merchants",
        headers: { cookie: adminCookie },
        payload: { name: "邀请码商户" }
      });
      const merchantId = merchant.json().id as string;
      await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { cookie: adminCookie },
        payload: { merchantId, email: "invite@test.local", name: "邀请码管理员", password: "Merchant123456", role: "merchant_admin" }
      });
      const merchantCookie = await login(app, "invite@test.local", "Merchant123456");

      await app.inject({
        method: "PATCH",
        url: "/api/merchant/config",
        headers: { cookie: merchantCookie },
        payload: { a2cBaseUrl: "https://a2c.test/api/openapi", a2cAppId: "app-id", a2cAppSecret: "app-secret" }
      });
      const sync = await app.inject({ method: "POST", url: "/api/merchant/a2c/accounts/sync", headers: { cookie: merchantCookie } });
      const accountId = sync.json().rows[0].id as number;

      const imported = await app.inject({
        method: "POST",
        url: `/api/merchant/a2c/accounts/${accountId}/invite-codes/import`,
        headers: { cookie: merchantCookie },
        payload: { codes: "INV-1\nINV-2, INV-3", registerUrl: "https://example.com/register?code={code}" }
      });
      expect(imported.statusCode).toBe(200);
      expect(imported.json().rows).toHaveLength(3);
      expect(imported.json().rows[0]).toMatchObject({ merchantId, a2cAccountPhone: "invite-a2c" });

      const list = await app.inject({ method: "GET", url: `/api/merchant/a2c/accounts/${accountId}/invite-codes`, headers: { cookie: merchantCookie } });
      expect(list.json().rows.map((row: { code: string }) => row.code).sort()).toEqual(["INV-1", "INV-2", "INV-3"]);

      const target = list.json().rows.find((row: { code: string }) => row.code === "INV-1") as { id: number };
      const patched = await app.inject({
        method: "PATCH",
        url: `/api/merchant/invite-codes/${target.id}`,
        headers: { cookie: merchantCookie },
        payload: { code: "INV-1-EDITED", registerUrl: "https://example.com/signup?invite={code}", status: "disabled", platformAccount: "user-1001" }
      });
      expect(patched.statusCode).toBe(200);
      expect(patched.json()).toMatchObject({ code: "INV-1-EDITED", registerUrl: "https://example.com/signup?invite={code}", status: "disabled", platformAccount: "user-1001" });

      const deleted = await app.inject({ method: "DELETE", url: `/api/merchant/invite-codes/${target.id}`, headers: { cookie: merchantCookie } });
      expect(deleted.statusCode).toBe(200);
      const afterDelete = await app.inject({ method: "GET", url: `/api/merchant/a2c/accounts/${accountId}/invite-codes`, headers: { cookie: merchantCookie } });
      expect(afterDelete.json().rows.map((row: { code: string }) => row.code)).not.toContain("INV-1-EDITED");
    } finally {
      await app.close();
      globalThis.fetch = originalFetch;
    }
  });

  it("reserves an invite code for auto replies and marks it used after registration", async () => {
    const originalFetch = globalThis.fetch;
    const sentMessages: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/open/auth/token")) return Response.json({ code: 200, data: { accessToken: "invite-flow-token", expireIn: 3600 } });
      if (url.endsWith("/v1/accounts")) {
        return Response.json({ code: 200, data: [{ apiPhone: "invite-flow-a2c", wabaId: "waba", status: 1, numberStatus: 1, qualityRating: 3, messagingLimit: 1000, verifiedName: "引导客服" }] });
      }
      if (url.endsWith("/v1/messages")) {
        sentMessages.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
        return Response.json({ code: 200, data: `sent-${sentMessages.length}` });
      }
      return Response.json({ code: 200, data: "ok" });
    }) as typeof fetch;

    const app = buildApp(testConfig());
    try {
      const adminCookie = await login(app, "admin@test.local", "Admin123456");
      const merchant = await app.inject({
        method: "POST",
        url: "/api/admin/merchants",
        headers: { cookie: adminCookie },
        payload: { name: "邀请码自动分配商户" }
      });
      const merchantId = merchant.json().id as string;
      await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { cookie: adminCookie },
        payload: { merchantId, email: "invite-flow@test.local", name: "邀请码流程", password: "Merchant123456", role: "merchant_admin" }
      });
      const merchantCookie = await login(app, "invite-flow@test.local", "Merchant123456");

      await app.inject({
        method: "PATCH",
        url: "/api/merchant/config",
        headers: { cookie: merchantCookie },
        payload: { a2cBaseUrl: "https://a2c-flow.test/api/openapi", a2cAppId: "invite-flow-app", a2cAppSecret: "invite-flow-secret" }
      });
      const sync = await app.inject({ method: "POST", url: "/api/merchant/a2c/accounts/sync", headers: { cookie: merchantCookie } });
      const accountId = sync.json().rows[0].id as number;
      await app.inject({
        method: "POST",
        url: `/api/merchant/a2c/accounts/${accountId}/invite-codes/import`,
        headers: { cookie: merchantCookie },
        payload: { codes: "FLOW-1\nFLOW-2", registerUrl: "https://example.com/register?code={code}" }
      });

      const firstWebhook = await app.inject({
        method: "POST",
        url: `/webhooks/a2c/${merchantId}`,
        payload: {
          id: "invite-flow-event-1",
          timestamp: Math.floor(Date.now() / 1000),
          type: "CUSTOMER_MESSAGE",
          data: {
            messageId: "invite-flow-message-1",
            content: "link please",
            from: "invite-flow-customer",
            to: "invite-flow-a2c",
            msgType: "text",
            timestamp: Math.floor(Date.now() / 1000)
          }
        }
      });
      expect(firstWebhook.statusCode).toBe(200);
      expect(firstWebhook.json().status).toBe("replied");
      expect(String(sentMessages[0].content)).toContain("FLOW-1");
      expect(String(sentMessages[0].content)).toContain("https://example.com/register?code=FLOW-1");

      const reserved = await app.inject({ method: "GET", url: `/api/merchant/a2c/accounts/${accountId}/invite-codes`, headers: { cookie: merchantCookie } });
      expect(reserved.json().rows.find((row: { code: string }) => row.code === "FLOW-1")).toMatchObject({
        status: "reserved",
        assignedCustomerKey: "invite-flow-customer"
      });

      const doneWebhook = await app.inject({
        method: "POST",
        url: `/webhooks/a2c/${merchantId}`,
        payload: {
          id: "invite-flow-event-2",
          timestamp: Math.floor(Date.now() / 1000),
          type: "CUSTOMER_MESSAGE",
          data: {
            messageId: "invite-flow-message-2",
            content: "registered",
            from: "invite-flow-customer",
            to: "invite-flow-a2c",
            msgType: "text",
            timestamp: Math.floor(Date.now() / 1000)
          }
        }
      });
      expect(doneWebhook.statusCode).toBe(200);

      const completeWebhook = await app.inject({
        method: "POST",
        url: `/webhooks/a2c/${merchantId}`,
        payload: {
          id: "invite-flow-event-3",
          timestamp: Math.floor(Date.now() / 1000),
          type: "CUSTOMER_MESSAGE",
          data: {
            messageId: "invite-flow-message-3",
            content: "My phone is 123456789 and Telegram is @flowuser",
            from: "invite-flow-customer",
            to: "invite-flow-a2c",
            msgType: "text",
            timestamp: Math.floor(Date.now() / 1000)
          }
        }
      });
      expect(completeWebhook.statusCode).toBe(200);
      expect(completeWebhook.json().status).toBe("handoff");
      expect(String(sentMessages.at(-1)?.content)).toBe("We are verifying your information. Please wait a moment.");

      const used = await app.inject({ method: "GET", url: `/api/merchant/a2c/accounts/${accountId}/invite-codes`, headers: { cookie: merchantCookie } });
      expect(used.json().rows.find((row: { code: string }) => row.code === "FLOW-1")).toMatchObject({ status: "used" });
      expect(used.json().rows.find((row: { code: string }) => row.code === "FLOW-2")).toMatchObject({ status: "available" });
    } finally {
      await app.close();
      globalThis.fetch = originalFetch;
    }
  });

  it("sends both register url and invite code when url has no placeholder", async () => {
    const originalFetch = globalThis.fetch;
    const sentMessages: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/open/auth/token")) return Response.json({ code: 200, data: { accessToken: "plain-invite-token", expireIn: 3600 } });
      if (url.endsWith("/v1/accounts")) {
        return Response.json({ code: 200, data: [{ apiPhone: "18507251675", wabaId: "waba", status: 1, numberStatus: 1, qualityRating: 3, messagingLimit: 1000, verifiedName: "普通链接客服" }] });
      }
      if (url.endsWith("/v1/messages")) {
        sentMessages.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
        return Response.json({ code: 200, data: `sent-${sentMessages.length}` });
      }
      return Response.json({ code: 200, data: "ok" });
    }) as typeof fetch;

    const app = buildApp(testConfig());
    try {
      const adminCookie = await login(app, "admin@test.local", "Admin123456");
      const merchant = await app.inject({ method: "POST", url: "/api/admin/merchants", headers: { cookie: adminCookie }, payload: { name: "普通邀请码链接商户" } });
      const merchantId = merchant.json().id as string;
      await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { cookie: adminCookie },
        payload: { merchantId, email: "plain-invite@test.local", name: "普通邀请码", password: "Merchant123456", role: "merchant_admin" }
      });
      const merchantCookie = await login(app, "plain-invite@test.local", "Merchant123456");
      await app.inject({
        method: "PATCH",
        url: "/api/merchant/config",
        headers: { cookie: merchantCookie },
        payload: { a2cBaseUrl: "https://plain-a2c.test/api/openapi", a2cAppId: "plain-app", a2cAppSecret: "plain-secret" }
      });
      const sync = await app.inject({ method: "POST", url: "/api/merchant/a2c/accounts/sync", headers: { cookie: merchantCookie } });
      const accountId = sync.json().rows[0].id as number;
      await app.inject({
        method: "POST",
        url: `/api/merchant/a2c/accounts/${accountId}/invite-codes/import`,
        headers: { cookie: merchantCookie },
        payload: { codes: "PLAIN-1", registerUrl: "https://example.com/register" }
      });
      const country = await app.inject({
        method: "POST",
        url: "/api/merchant/countries",
        headers: { cookie: merchantCookie },
        payload: { code: "br", name: "巴西", defaultLanguage: "zh" }
      });
      await app.inject({
        method: "PATCH",
        url: `/api/merchant/a2c/accounts/${accountId}`,
        headers: { cookie: merchantCookie },
        payload: { countryId: country.json().id }
      });

      const webhook = await app.inject({
        method: "POST",
        url: `/webhooks/a2c/${merchantId}`,
        payload: {
          id: "plain-invite-event-1",
          timestamp: Math.floor(Date.now() / 1000),
          type: "CUSTOMER_MESSAGE",
          data: {
            messageId: "plain-invite-message-1",
            content: "link please",
            from: "plain-invite-customer",
            to: "+1 (850) 725-1675",
            msgType: "text",
            timestamp: Math.floor(Date.now() / 1000)
          }
        }
      });
      expect(webhook.statusCode).toBe(200);
      expect(String(sentMessages[0].content)).toContain("https://example.com/register");
      expect(String(sentMessages[0].content)).toContain("PLAIN-1");
    } finally {
      await app.close();
      globalThis.fetch = originalFetch;
    }
  });

  it("falls back to the country register link when an invite code has no link template", async () => {
    const originalFetch = globalThis.fetch;
    const sentMessages: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/open/auth/token")) return Response.json({ code: 200, data: { accessToken: "country-link-token", expireIn: 3600 } });
      if (url.endsWith("/v1/accounts")) {
        return Response.json({ code: 200, data: [{ apiPhone: "country-link-a2c", wabaId: "waba", status: 1, numberStatus: 1, qualityRating: 3, messagingLimit: 1000, verifiedName: "国家链接客服" }] });
      }
      if (url.endsWith("/v1/messages")) {
        sentMessages.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
        return Response.json({ code: 200, data: `sent-${sentMessages.length}` });
      }
      return Response.json({ code: 200, data: "ok" });
    }) as typeof fetch;

    const app = buildApp(testConfig());
    try {
      const adminCookie = await login(app, "admin@test.local", "Admin123456");
      const merchant = await app.inject({ method: "POST", url: "/api/admin/merchants", headers: { cookie: adminCookie }, payload: { name: "国家开户链接兜底商户" } });
      const merchantId = merchant.json().id as string;
      await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { cookie: adminCookie },
        payload: { merchantId, email: "country-link@test.local", name: "国家链接", password: "Merchant123456", role: "merchant_admin" }
      });
      const merchantCookie = await login(app, "country-link@test.local", "Merchant123456");
      await app.inject({
        method: "PATCH",
        url: "/api/merchant/config",
        headers: { cookie: merchantCookie },
        payload: { a2cBaseUrl: "https://country-link-a2c.test/api/openapi", a2cAppId: "country-link-app", a2cAppSecret: "country-link-secret" }
      });
      await app.inject({
        method: "POST",
        url: "/api/merchant/countries",
        headers: { cookie: merchantCookie },
        payload: { code: "br", name: "巴西", defaultLanguage: "zh", platformRegisterUrl: "https://country.example/register?invite={code}" }
      });
      const sync = await app.inject({ method: "POST", url: "/api/merchant/a2c/accounts/sync", headers: { cookie: merchantCookie } });
      const accountId = sync.json().rows[0].id as number;
      await app.inject({
        method: "POST",
        url: `/api/merchant/a2c/accounts/${accountId}/invite-codes/import`,
        headers: { cookie: merchantCookie },
        payload: { codes: "BR-ONLY-LINK" }
      });

      const webhook = await app.inject({
        method: "POST",
        url: `/webhooks/a2c/${merchantId}`,
        payload: {
          id: "country-link-event-1",
          timestamp: Math.floor(Date.now() / 1000),
          type: "CUSTOMER_MESSAGE",
          data: {
            messageId: "country-link-message-1",
            content: "注册链接",
            from: "country-link-customer",
            to: "country-link-a2c",
            msgType: "text",
            timestamp: Math.floor(Date.now() / 1000)
          }
        }
      });
      expect(webhook.statusCode).toBe(200);
      expect(String(sentMessages[0].content)).toContain("BR-ONLY-LINK");
      expect(String(sentMessages[0].content)).toContain("https://country.example/register?invite=BR-ONLY-LINK");
    } finally {
      await app.close();
      globalThis.fetch = originalFetch;
    }
  });

  it("guides customers to register Telegram instead of asking WhatsApp when WhatsApp is not required", async () => {
    const originalFetch = globalThis.fetch;
    const sentMessages: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/open/auth/token")) return Response.json({ code: 200, data: { accessToken: "tg-guide-token", expireIn: 3600 } });
      if (url.endsWith("/v1/accounts")) {
        return Response.json({ code: 200, data: [{ apiPhone: "tg-guide-a2c", wabaId: "waba", status: 1, numberStatus: 1, qualityRating: 3, messagingLimit: 1000, verifiedName: "TG引导客服" }] });
      }
      if (url.includes("generativelanguage.googleapis.com")) {
        return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
          reply: "没关系，如果您没有Telegram，请提供您的WhatsApp联系方式。",
          language: "zh",
          stage: "need_phone_or_tg",
          extractedPhone: "",
          extractedTelegram: "",
          extractedWhatsApp: "",
          shouldHandoff: false
        }) }] } }] });
      }
      if (url.endsWith("/v1/messages")) {
        sentMessages.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
        return Response.json({ code: 200, data: `sent-${sentMessages.length}` });
      }
      return Response.json({ code: 200, data: "ok" });
    }) as typeof fetch;

    const app = buildApp(testConfig());
    try {
      const adminCookie = await login(app, "admin@test.local", "Admin123456");
      const merchant = await app.inject({ method: "POST", url: "/api/admin/merchants", headers: { cookie: adminCookie }, payload: { name: "TG目标商户" } });
      const merchantId = merchant.json().id as string;
      await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { cookie: adminCookie },
        payload: { merchantId, email: "tg-guide@test.local", name: "TG引导", password: "Merchant123456", role: "merchant_admin" }
      });
      const merchantCookie = await login(app, "tg-guide@test.local", "Merchant123456");
      await app.inject({
        method: "PATCH",
        url: "/api/merchant/config",
        headers: { cookie: merchantCookie },
        payload: { a2cBaseUrl: "https://tg-guide-a2c.test/api/openapi", a2cAppId: "tg-guide-app", a2cAppSecret: "tg-guide-secret", googleAiApiKey: "gemini-test" }
      });
      await app.inject({
        method: "POST",
        url: "/api/merchant/countries",
        headers: { cookie: merchantCookie },
        payload: { code: "br", name: "巴西", defaultLanguage: "zh", requirePlatformAccount: false, requirePhone: true, requireTelegram: true, requireWhatsApp: false, tgRegisterGuideUrl: "https://telegram.org/" }
      });
      await app.inject({ method: "POST", url: "/api/merchant/a2c/accounts/sync", headers: { cookie: merchantCookie } });

      const webhook = await app.inject({
        method: "POST",
        url: `/webhooks/a2c/${merchantId}`,
        payload: {
          id: "tg-guide-event-1",
          timestamp: Math.floor(Date.now() / 1000),
          type: "CUSTOMER_MESSAGE",
          data: {
            messageId: "tg-guide-message-1",
            content: "我没有",
            from: "tg-guide-customer",
            to: "tg-guide-a2c",
            msgType: "text",
            timestamp: Math.floor(Date.now() / 1000)
          }
        }
      });
      expect(webhook.statusCode).toBe(200);
      expect(String(sentMessages[0].content)).toContain("Telegram");
      expect(String(sentMessages[0].content)).toContain("@");
      expect(String(sentMessages[0].content)).toContain("https://telegram.org/");
      expect(String(sentMessages[0].content)).not.toContain("WhatsApp");
    } finally {
      await app.close();
      globalThis.fetch = originalFetch;
    }
  });

  it("does not disclose AI or bot identity in customer-visible auto replies", async () => {
    const originalFetch = globalThis.fetch;
    const sentMessages: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/open/auth/token")) return Response.json({ code: 200, data: { accessToken: "identity-policy-token", expireIn: 3600 } });
      if (url.endsWith("/v1/accounts")) {
        return Response.json({ code: 200, data: [{ apiPhone: "identity-policy-a2c", wabaId: "waba", status: 1, numberStatus: 1, qualityRating: 3, messagingLimit: 1000, verifiedName: "身份规则客服" }] });
      }
      if (url.includes("generativelanguage.googleapis.com")) {
        return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
          reply: "我是AI机器人，会自动协助您完成注册流程。",
          language: "zh",
          stage: "need_platform_register",
          extractedPhone: "",
          extractedTelegram: "",
          extractedWhatsApp: "",
          shouldHandoff: false
        }) }] } }] });
      }
      if (url.endsWith("/v1/messages")) {
        sentMessages.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
        return Response.json({ code: 200, data: `sent-${sentMessages.length}` });
      }
      return Response.json({ code: 200, data: "ok" });
    }) as typeof fetch;

    const app = buildApp(testConfig());
    try {
      const adminCookie = await login(app, "admin@test.local", "Admin123456");
      const merchant = await app.inject({ method: "POST", url: "/api/admin/merchants", headers: { cookie: adminCookie }, payload: { name: "身份规则商户" } });
      const merchantId = merchant.json().id as string;
      await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { cookie: adminCookie },
        payload: { merchantId, email: "identity-policy@test.local", name: "身份规则", password: "Merchant123456", role: "merchant_admin" }
      });
      const merchantCookie = await login(app, "identity-policy@test.local", "Merchant123456");
      await app.inject({
        method: "PATCH",
        url: "/api/merchant/config",
        headers: { cookie: merchantCookie },
        payload: { a2cBaseUrl: "https://identity-policy-a2c.test/api/openapi", a2cAppId: "identity-app", a2cAppSecret: "identity-secret", googleAiApiKey: "gemini-test" }
      });
      await app.inject({
        method: "POST",
        url: "/api/merchant/countries",
        headers: { cookie: merchantCookie },
        payload: { code: "br", name: "巴西", defaultLanguage: "zh", requirePlatformAccount: false, requirePhone: true, requireTelegram: true, requireWhatsApp: false }
      });
      await app.inject({ method: "POST", url: "/api/merchant/a2c/accounts/sync", headers: { cookie: merchantCookie } });

      const webhook = await app.inject({
        method: "POST",
        url: `/webhooks/a2c/${merchantId}`,
        payload: {
          id: "identity-policy-event-1",
          timestamp: Math.floor(Date.now() / 1000),
          type: "CUSTOMER_MESSAGE",
          data: {
            messageId: "identity-policy-message-1",
            content: "你是机器人吗",
            from: "identity-policy-customer",
            to: "identity-policy-a2c",
            msgType: "text",
            timestamp: Math.floor(Date.now() / 1000)
          }
        }
      });
      expect(webhook.statusCode).toBe(200);
      expect(String(sentMessages[0].content).length).toBeGreaterThan(10);
      expect(String(sentMessages[0].content)).not.toMatch(/AI|机器人|自动客服|自动回复/i);
    } finally {
      await app.close();
      globalThis.fetch = originalFetch;
    }
  });

  it("filters stale mechanical templates from Gemini replies", async () => {
    const originalFetch = globalThis.fetch;
    const sentMessages: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/open/auth/token")) return Response.json({ code: 200, data: { accessToken: "mechanical-template-token", expireIn: 3600 } });
      if (url.endsWith("/v1/accounts")) {
        return Response.json({ code: 200, data: [{ apiPhone: "mechanical-template-a2c", wabaId: "waba", status: 1, numberStatus: 1, qualityRating: 3, messagingLimit: 1000, verifiedName: "模板过滤客服" }] });
      }
      if (url.includes("generativelanguage.googleapis.com")) {
        return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
          reply: "您好，我是平台客服，会继续协助您完成注册流程。请问您是想了解如何开户注册吗？",
          language: "zh",
          stage: "need_platform_register",
          extractedPhone: "",
          extractedTelegram: "",
          extractedWhatsApp: "",
          shouldHandoff: false
        }) }] } }] });
      }
      if (url.endsWith("/v1/messages")) {
        sentMessages.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
        return Response.json({ code: 200, data: `sent-${sentMessages.length}` });
      }
      return Response.json({ code: 200, data: "ok" });
    }) as typeof fetch;

    const app = buildApp(testConfig());
    try {
      const adminCookie = await login(app, "admin@test.local", "Admin123456");
      const merchant = await app.inject({ method: "POST", url: "/api/admin/merchants", headers: { cookie: adminCookie }, payload: { name: "模板过滤商户" } });
      const merchantId = merchant.json().id as string;
      await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { cookie: adminCookie },
        payload: { merchantId, email: "mechanical-template@test.local", name: "模板过滤", password: "Merchant123456", role: "merchant_admin" }
      });
      const merchantCookie = await login(app, "mechanical-template@test.local", "Merchant123456");
      await app.inject({
        method: "PATCH",
        url: "/api/merchant/config",
        headers: { cookie: merchantCookie },
        payload: { a2cBaseUrl: "https://mechanical-template-a2c.test/api/openapi", a2cAppId: "mechanical-app", a2cAppSecret: "mechanical-secret", googleAiApiKey: "gemini-test" }
      });
      await app.inject({
        method: "POST",
        url: "/api/merchant/countries",
        headers: { cookie: merchantCookie },
        payload: { code: "br", name: "巴西", defaultLanguage: "zh", requirePlatformAccount: false, requirePhone: true, requireTelegram: true, requireWhatsApp: false }
      });
      await app.inject({ method: "POST", url: "/api/merchant/a2c/accounts/sync", headers: { cookie: merchantCookie } });

      const webhook = await app.inject({
        method: "POST",
        url: `/webhooks/a2c/${merchantId}`,
        payload: {
          id: "mechanical-template-event-1",
          timestamp: Math.floor(Date.now() / 1000),
          type: "CUSTOMER_MESSAGE",
          data: {
            messageId: "mechanical-template-message-1",
            content: "你好，我想要找一份工作",
            from: "mechanical-template-customer",
            to: "mechanical-template-a2c",
            msgType: "text",
            timestamp: Math.floor(Date.now() / 1000)
          }
        }
      });

      expect(webhook.statusCode).toBe(200);
      expect(String(sentMessages[0].content)).toMatch(/线上工作|online|trabalho/i);
      expect(String(sentMessages[0].content)).not.toContain("我是平台客服");
      expect(String(sentMessages[0].content)).not.toContain("开户注册");
    } finally {
      await app.close();
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps Aston default-market webhooks on the strict greeting instead of generic free replies", async () => {
    const originalFetch = globalThis.fetch;
    const sentMessages: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/open/auth/token")) return Response.json({ code: 200, data: { accessToken: "aston-default-token", expireIn: 3600 } });
      if (url.endsWith("/v1/accounts")) {
        return Response.json({ code: 200, data: [{ apiPhone: "18507251675", wabaId: "waba", status: 1, numberStatus: 1, qualityRating: 3, messagingLimit: 1000, verifiedName: "Numidia" }] });
      }
      if (url.includes("generativelanguage.googleapis.com")) {
        return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
          reply: "您好，我可以协助您完成注册、排查问题、确认手机号和 Telegram，或帮您转人工。",
          language: "zh",
          stage: "need_platform_register",
          extractedPhone: "",
          extractedTelegram: "",
          extractedWhatsApp: "",
          shouldHandoff: false
        }) }] } }] });
      }
      if (url.endsWith("/v1/messages")) {
        sentMessages.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
        return Response.json({ code: 200, data: `aston-default-sent-${sentMessages.length}` });
      }
      return Response.json({ code: 200, data: "ok" });
    }) as typeof fetch;

    const app = buildApp(testConfig());
    try {
      const adminCookie = await login(app, "admin@test.local", "Admin123456");
      const merchant = await app.inject({ method: "POST", url: "/api/admin/merchants", headers: { cookie: adminCookie }, payload: { name: "阿斯顿" } });
      const merchantId = merchant.json().id as string;
      await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { cookie: adminCookie },
        payload: { merchantId, email: "aston-default@test.local", name: "阿斯顿默认国家", password: "Merchant123456", role: "merchant_admin" }
      });
      const merchantCookie = await login(app, "aston-default@test.local", "Merchant123456");
      await app.inject({
        method: "PATCH",
        url: "/api/merchant/config",
        headers: { cookie: merchantCookie },
        payload: { a2cBaseUrl: "https://aston-default-a2c.test/api/openapi", a2cAppId: "aston-default-app", a2cAppSecret: "aston-default-secret", googleAiApiKey: "gemini-test" }
      });
      await app.inject({ method: "POST", url: "/api/merchant/a2c/accounts/sync", headers: { cookie: merchantCookie } });

      const webhook = await app.inject({
        method: "POST",
        url: `/webhooks/a2c/${merchantId}`,
        payload: {
          id: "aston-default-event-1",
          timestamp: Math.floor(Date.now() / 1000),
          type: "CUSTOMER_MESSAGE",
          data: {
            messageId: "aston-default-message-1",
            content: "你好",
            from: "5511913586749",
            to: "18507251675",
            msgType: "text",
            timestamp: Math.floor(Date.now() / 1000)
          }
        }
      });

      expect(webhook.statusCode).toBe(200);
      expect(webhook.json().status).toBe("strict_flow_replied");
      expect(String(sentMessages[0].content)).toContain("兼职在线工作");
      expect(String(sentMessages[0].content)).not.toContain("协助您完成注册、排查问题");
      expect(String(sentMessages[0].content)).not.toContain("google");
      expect(String(sentMessages[0].content)).not.toContain("邀请码");
    } finally {
      await app.close();
      globalThis.fetch = originalFetch;
    }
  });

  it("continues Aston strict flow across short confirmations in real webhooks", async () => {
    const originalFetch = globalThis.fetch;
    const sentMessages: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/open/auth/token")) return Response.json({ code: 200, data: { accessToken: "aston-short-token", expireIn: 3600 } });
      if (url.endsWith("/v1/accounts")) {
        return Response.json({ code: 200, data: [{ apiPhone: "aston-short-a2c", wabaId: "waba", status: 1, numberStatus: 1, qualityRating: 3, messagingLimit: 1000, verifiedName: "短确认客服" }] });
      }
      if (url.endsWith("/v1/messages")) {
        sentMessages.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
        return Response.json({ code: 200, data: `aston-short-sent-${sentMessages.length}` });
      }
      return Response.json({ code: 200, data: "ok" });
    }) as typeof fetch;

    const app = buildApp(testConfig());
    try {
      const adminCookie = await login(app, "admin@test.local", "Admin123456");
      const merchant = await app.inject({ method: "POST", url: "/api/admin/merchants", headers: { cookie: adminCookie }, payload: { name: "阿斯顿短确认" } });
      const merchantId = merchant.json().id as string;
      await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { cookie: adminCookie },
        payload: { merchantId, email: "aston-short@test.local", name: "阿斯顿短确认", password: "Merchant123456", role: "merchant_admin" }
      });
      const merchantCookie = await login(app, "aston-short@test.local", "Merchant123456");
      await app.inject({
        method: "PATCH",
        url: "/api/merchant/config",
        headers: { cookie: merchantCookie },
        payload: { a2cBaseUrl: "https://aston-short-a2c.test/api/openapi", a2cAppId: "aston-short-app", a2cAppSecret: "aston-short-secret", googleAiApiKey: "gemini-test" }
      });
      const sync = await app.inject({ method: "POST", url: "/api/merchant/a2c/accounts/sync", headers: { cookie: merchantCookie } });
      const accountId = sync.json().rows[0].id as number;
      await app.inject({
        method: "POST",
        url: `/api/merchant/a2c/accounts/${accountId}/invite-codes/import`,
        headers: { cookie: merchantCookie },
        payload: { codes: "ASTON-SHORT-1", registerUrl: "https://register.example/?code={code}" }
      });

      for (const [index, content] of ["你好", "是的", "好的"].entries()) {
        const webhook = await app.inject({
          method: "POST",
          url: `/webhooks/a2c/${merchantId}`,
          payload: {
            id: `aston-short-event-${index + 1}`,
            timestamp: Math.floor(Date.now() / 1000) + index,
            type: "CUSTOMER_MESSAGE",
            data: {
              messageId: `aston-short-message-${index + 1}`,
              content,
              from: "aston-short-customer",
              to: "aston-short-a2c",
              msgType: "text",
              timestamp: Math.floor(Date.now() / 1000) + index
            }
          }
        });
        expect(webhook.statusCode).toBe(200);
        expect(webhook.json().status).toBe("strict_flow_replied");
      }

      expect(sentMessages).toHaveLength(3);
      expect(String(sentMessages[0].content)).toContain("兼职在线工作");
      expect(String(sentMessages[0].content)).not.toContain("register.example");
      expect(String(sentMessages[1].content)).toContain("简单介绍");
      expect(String(sentMessages[1].content)).toContain("页面规则");
      expect(String(sentMessages[1].content)).toContain("空闲时间");
      expect(String(sentMessages[1].content)).not.toContain("register.example");
      expect(String(sentMessages[2].content)).toContain("https://register.example/?code=ASTON-SHORT-1");
      expect(String(sentMessages[2].content)).toContain("ASTON-SHORT-1");
      for (const message of sentMessages) {
        expect(String(message.content)).not.toBe("好的，我继续协助您。");
        expect(String(message.content)).not.toMatch(/AI|机器人|自动客服/i);
      }

      const conversations = await app.inject({ method: "GET", url: "/api/merchant/conversations", headers: { cookie: merchantCookie } });
      expect(conversations.json().rows[0]).toMatchObject({ flowStep: "wait_registration", stage: "need_platform_register" });
    } finally {
      await app.close();
      globalThis.fetch = originalFetch;
    }
  });

  it("sends full registration package after ok with a country invite pool fallback", async () => {
    const originalFetch = globalThis.fetch;
    const sentMessages: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/open/auth/token")) return Response.json({ code: 200, data: { accessToken: "country-pool-token", expireIn: 3600 } });
      if (url.endsWith("/v1/accounts")) {
        return Response.json({
          code: 200,
          data: [
            { apiPhone: "18507251675", wabaId: "waba-country-pool", status: 1, numberStatus: 1, qualityRating: 3, messagingLimit: 1000, verifiedName: "邀请码池客服" },
            { apiPhone: "runtime-a2c", wabaId: "waba-runtime", status: 1, numberStatus: 1, qualityRating: 3, messagingLimit: 1000, verifiedName: "实际接收客服" }
          ]
        });
      }
      if (url.endsWith("/v1/messages")) {
        sentMessages.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
        return Response.json({ code: 200, data: `sent-country-pool-${sentMessages.length}` });
      }
      return Response.json({ code: 200, data: "ok" });
    }) as typeof fetch;

    const app = buildApp(testConfig());
    try {
      const adminCookie = await login(app, "admin@test.local", "Admin123456");
      const merchant = await app.inject({
        method: "POST",
        url: "/api/admin/merchants",
        headers: { cookie: adminCookie },
        payload: { name: "国家池邀请码流程商户" }
      });
      const merchantId = merchant.json().id as string;
      await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { cookie: adminCookie },
        payload: { merchantId, email: "country-pool@test.local", name: "国家池流程", password: "Merchant123456", role: "merchant_admin" }
      });
      const merchantCookie = await login(app, "country-pool@test.local", "Merchant123456");
      await app.inject({
        method: "PATCH",
        url: "/api/merchant/config",
        headers: { cookie: merchantCookie },
        payload: {
          a2cBaseUrl: "https://country-pool-a2c.test/api/openapi",
          a2cAppId: "country-pool-app",
          a2cAppSecret: "country-pool-secret",
          strictScriptFlowEnabled: true
        }
      });
      const sync = await app.inject({ method: "POST", url: "/api/merchant/a2c/accounts/sync", headers: { cookie: merchantCookie } });
      const poolAccount = sync.json().rows.find((row: { apiPhone: string }) => row.apiPhone === "18507251675") as { id: number };
      await app.inject({
        method: "POST",
        url: `/api/merchant/a2c/accounts/${poolAccount.id}/invite-codes/import`,
        headers: { cookie: merchantCookie },
        payload: { codes: "6", registerUrl: "https://www.google.com" }
      });

      for (const [index, content] of ["你好", "是的", "ok"].entries()) {
        const webhook = await app.inject({
          method: "POST",
          url: `/webhooks/a2c/${merchantId}`,
          payload: {
            id: `country-pool-event-${index + 1}`,
            timestamp: Math.floor(Date.now() / 1000) + index,
            type: "CUSTOMER_MESSAGE",
            data: {
              messageId: `country-pool-message-${index + 1}`,
              content,
              from: "country-pool-customer",
              to: "runtime-a2c",
              msgType: "text",
              timestamp: Math.floor(Date.now() / 1000) + index
            }
          }
        });
        expect(webhook.statusCode).toBe(200);
        expect(webhook.json().status).toBe("strict_flow_replied");
      }

      expect(sentMessages).toHaveLength(3);
      const registrationPackage = String(sentMessages[2].content);
      expect(registrationPackage).toContain("开户链接：https://www.google.com");
      expect(registrationPackage).toContain("邀请码：6");
      expect(registrationPackage).toContain("注册步骤");
      expect(registrationPackage).toContain("填写手机号码");
      expect(registrationPackage).not.toContain("正在确认");

      const conversations = await app.inject({ method: "GET", url: "/api/merchant/conversations", headers: { cookie: merchantCookie } });
      expect(conversations.json().rows[0]).toMatchObject({ flowStep: "wait_registration", stage: "need_platform_register" });
    } finally {
      await app.close();
      globalThis.fetch = originalFetch;
    }
  });

  it("sends configured registration tutorial image when customer asks for registration help", async () => {
    const originalFetch = globalThis.fetch;
    const sentMessages: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/open/auth/token")) return Response.json({ code: 200, data: { accessToken: "tutorial-token", expireIn: 3600 } });
      if (url.endsWith("/v1/accounts")) {
        return Response.json({ code: 200, data: [{ apiPhone: "tutorial-a2c", verifiedName: "教程客服" }] });
      }
      if (url.endsWith("/v1/messages")) {
        sentMessages.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
        return Response.json({ code: 200, data: `tutorial-sent-${sentMessages.length}` });
      }
      return Response.json({ code: 200, data: "ok" });
    }) as typeof fetch;

    const app = buildApp(testConfig());
    try {
      const adminCookie = await login(app, "admin@test.local", "Admin123456");
      const merchant = await app.inject({ method: "POST", url: "/api/admin/merchants", headers: { cookie: adminCookie }, payload: { name: "教程图商户" } });
      const merchantId = merchant.json().id as string;
      await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { cookie: adminCookie },
        payload: { merchantId, email: "tutorial@test.local", name: "教程图", password: "Merchant123456", role: "merchant_admin" }
      });
      const merchantCookie = await login(app, "tutorial@test.local", "Merchant123456");
      await app.inject({
        method: "PATCH",
        url: "/api/merchant/config",
        headers: { cookie: merchantCookie },
        payload: {
          a2cBaseUrl: "https://tutorial-a2c.test/api/openapi",
          a2cAppId: "tutorial-app",
          a2cAppSecret: "tutorial-secret",
          strictScriptFlowEnabled: true,
          registrationTutorialImageUrl: "https://cdn.example/register-tutorial.jpg"
        }
      });
      const sync = await app.inject({ method: "POST", url: "/api/merchant/a2c/accounts/sync", headers: { cookie: merchantCookie } });
      const accountId = sync.json().rows[0].id as number;
      await app.inject({
        method: "POST",
        url: `/api/merchant/a2c/accounts/${accountId}/invite-codes/import`,
        headers: { cookie: merchantCookie },
        payload: { codes: "TUTORIAL-1", registerUrl: "https://register.example/?code={code}" }
      });

      for (const [index, content] of ["你好", "是", "是", "我不会，有教程吗"].entries()) {
        const webhook = await app.inject({
          method: "POST",
          url: `/webhooks/a2c/${merchantId}`,
          payload: {
            id: `tutorial-event-${index}`,
            timestamp: Math.floor(Date.now() / 1000) + index,
            type: "CUSTOMER_MESSAGE",
            data: {
              messageId: `tutorial-message-${index}`,
              content,
              from: "tutorial-customer",
              to: "tutorial-a2c",
              msgType: "text",
              timestamp: Math.floor(Date.now() / 1000) + index
            }
          }
        });
        expect(webhook.statusCode).toBe(200);
      }

      expect(sentMessages).toHaveLength(5);
      expect(String(sentMessages[3].content)).toContain("注册步骤");
      expect(String(sentMessages[3].content)).toContain("TUTORIAL-1");
      expect(sentMessages[4]).toMatchObject({
        type: 2,
        url: "https://cdn.example/register-tutorial.jpg"
      });
      expect(String(sentMessages[4].caption)).toContain("注册教程图片");
      const conversations = await app.inject({ method: "GET", url: "/api/merchant/conversations", headers: { cookie: merchantCookie } });
      const conversationId = conversations.json().rows[0].id as string;
      const messages = await app.inject({ method: "GET", url: `/api/merchant/conversations/${conversationId}/messages`, headers: { cookie: merchantCookie } });
      const tutorialOutbound = messages.json().rows.find((row: { msgType: string; rawPayload: Record<string, unknown> }) => row.msgType === "image" && row.rawPayload.registrationTutorialImage);
      expect(tutorialOutbound.rawPayload.mediaUrl).toBe("https://cdn.example/register-tutorial.jpg");
    } finally {
      await app.close();
      globalThis.fetch = originalFetch;
    }
  });

  it("stores registration tutorial images from merchant image upload only", async () => {
    const app = buildApp(testConfig());
    try {
      const adminCookie = await login(app, "admin@test.local", "Admin123456");
      const merchant = await app.inject({ method: "POST", url: "/api/admin/merchants", headers: { cookie: adminCookie }, payload: { name: "教程上传商户" } });
      const merchantId = merchant.json().id as string;
      await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { cookie: adminCookie },
        payload: { merchantId, email: "tutorial-upload@test.local", name: "教程上传", password: "Merchant123456", role: "merchant_admin" }
      });
      const merchantCookie = await login(app, "tutorial-upload@test.local", "Merchant123456");

      const textUpload = multipartUploadPayload("tutorial.txt", "text/plain", "not an image");
      const rejected = await app.inject({
        method: "POST",
        url: "/api/merchant/config/registration-tutorial-image",
        headers: { cookie: merchantCookie, ...textUpload.headers },
        payload: textUpload.payload
      });
      expect(rejected.statusCode).toBe(400);
      expect(rejected.json().error).toBe("只支持图片文件");

      const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
      const imageUpload = multipartUploadPayload("register-guide.png", "image/png", png);
      const uploaded = await app.inject({
        method: "POST",
        url: "/api/merchant/config/registration-tutorial-image",
        headers: { cookie: merchantCookie, host: "example.test", "x-forwarded-proto": "https", ...imageUpload.headers },
        payload: imageUpload.payload
      });
      expect(uploaded.statusCode).toBe(200);
      expect(uploaded.json().imageUrl).toMatch(/^https:\/\/example\.test\/uploads\/.+\.png$/);
      expect(uploaded.json().config.registrationTutorialImageUrl).toBe(uploaded.json().imageUrl);

      const config = await app.inject({ method: "GET", url: "/api/merchant/config", headers: { cookie: merchantCookie } });
      expect(config.json().registrationTutorialImageUrl).toBe(uploaded.json().imageUrl);
    } finally {
      await app.close();
    }
  });

  it("never tells customers invite codes are unnecessary when invite codes are required", async () => {
    const originalFetch = globalThis.fetch;
    const sentMessages: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/open/auth/token")) return Response.json({ code: 200, data: { accessToken: "missing-invite-token", expireIn: 3600 } });
      if (url.endsWith("/v1/accounts")) {
        return Response.json({ code: 200, data: [{ apiPhone: "missing-invite-a2c", wabaId: "waba", status: 1, numberStatus: 1, qualityRating: 3, messagingLimit: 1000, verifiedName: "缺邀请码客服" }] });
      }
      if (url.endsWith("/v1/messages")) {
        sentMessages.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
        return Response.json({ code: 200, data: `sent-${sentMessages.length}` });
      }
      return Response.json({ code: 200, data: "ok" });
    }) as typeof fetch;

    const app = buildApp(testConfig());
    try {
      const adminCookie = await login(app, "admin@test.local", "Admin123456");
      const merchant = await app.inject({ method: "POST", url: "/api/admin/merchants", headers: { cookie: adminCookie }, payload: { name: "缺邀请码商户" } });
      const merchantId = merchant.json().id as string;
      await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { cookie: adminCookie },
        payload: { merchantId, email: "missing-invite@test.local", name: "缺邀请码", password: "Merchant123456", role: "merchant_admin" }
      });
      const merchantCookie = await login(app, "missing-invite@test.local", "Merchant123456");
      await app.inject({
        method: "PATCH",
        url: "/api/merchant/config",
        headers: { cookie: merchantCookie },
        payload: { a2cBaseUrl: "https://missing-a2c.test/api/openapi", a2cAppId: "missing-app", a2cAppSecret: "missing-secret", platformRegisterUrl: "https://example.com/register" }
      });
      await app.inject({ method: "POST", url: "/api/merchant/a2c/accounts/sync", headers: { cookie: merchantCookie } });
      await app.inject({
        method: "POST",
        url: "/api/merchant/training-samples/import",
        headers: { cookie: merchantCookie, ...csvUploadPayload("客户消息,标准回复,客户意图\n邀请码呢,\"注册平台不需要邀请码，直接点击链接注册即可：https://example.com/register\",ask_link").headers },
        payload: csvUploadPayload("客户消息,标准回复,客户意图\n邀请码呢,\"注册平台不需要邀请码，直接点击链接注册即可：https://example.com/register\",ask_link").payload
      });

      const webhook = await app.inject({
        method: "POST",
        url: `/webhooks/a2c/${merchantId}`,
        payload: {
          id: "missing-invite-event-1",
          timestamp: Math.floor(Date.now() / 1000),
          type: "CUSTOMER_MESSAGE",
          data: {
            messageId: "missing-invite-message-1",
            content: "邀请码呢",
            from: "missing-invite-customer",
            to: "missing-invite-a2c",
            msgType: "text",
            timestamp: Math.floor(Date.now() / 1000)
          }
        }
      });
      expect(webhook.statusCode).toBe(200);
      expect(String(sentMessages[0].content)).toContain("注册需要邀请码");
      expect(String(sentMessages[0].content)).not.toContain("不需要邀请码");
    } finally {
      await app.close();
      globalThis.fetch = originalFetch;
    }
  });

  it("stores inbound images as media without extracting phone numbers from image urls", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/open/auth/token")) return Response.json({ code: 200, data: { accessToken: "image-token", expireIn: 3600 } });
      if (url.endsWith("/v1/accounts")) {
        return Response.json({ code: 200, data: [{ apiPhone: "image-a2c", verifiedName: "图片客服" }] });
      }
      if (url.endsWith("/v1/messages")) return Response.json({ code: 200, data: "image-reply" });
      return Response.json({ code: 200, data: "ok" });
    }) as typeof fetch;

    const app = buildApp(testConfig());
    try {
      const adminCookie = await login(app, "admin@test.local", "Admin123456");
      const merchant = await app.inject({ method: "POST", url: "/api/admin/merchants", headers: { cookie: adminCookie }, payload: { name: "图片消息商户" } });
      const merchantId = merchant.json().id as string;
      await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { cookie: adminCookie },
        payload: { merchantId, email: "image@test.local", name: "图片消息", password: "Merchant123456", role: "merchant_admin" }
      });
      const merchantCookie = await login(app, "image@test.local", "Merchant123456");
      await app.inject({
        method: "PATCH",
        url: "/api/merchant/config",
        headers: { cookie: merchantCookie },
        payload: { a2cBaseUrl: "https://image-a2c.test/api/openapi", a2cAppId: "image-app", a2cAppSecret: "image-secret" }
      });
      await app.inject({ method: "POST", url: "/api/merchant/a2c/accounts/sync", headers: { cookie: merchantCookie } });

      const imageUrl = "https://bucket-chatapp-file-internal.oss-ap-southeast-1.aliyuncs.com/1226109357673717760.jpg?Expires=1782043661";
      const webhook = await app.inject({
        method: "POST",
        url: `/webhooks/a2c/${merchantId}`,
        payload: {
          id: "image-event-1",
          timestamp: Math.floor(Date.now() / 1000),
          type: "CUSTOMER_MESSAGE",
          data: {
            messageId: "image-message-1",
            content: imageUrl,
            url: imageUrl,
            from: "image-customer",
            to: "image-a2c",
            msgType: "image",
            timestamp: Math.floor(Date.now() / 1000)
          }
        }
      });
      expect(webhook.statusCode).toBe(200);

      const conversations = await app.inject({ method: "GET", url: "/api/merchant/conversations", headers: { cookie: merchantCookie } });
      const conversation = conversations.json().rows[0] as { id: string; extractedPhone: string };
      expect(conversation.extractedPhone).toBe("");
      const messages = await app.inject({ method: "GET", url: `/api/merchant/conversations/${conversation.id}/messages`, headers: { cookie: merchantCookie } });
      const inbound = messages.json().rows.find((row: { direction: string }) => row.direction === "inbound");
      expect(inbound).toMatchObject({ msgType: "image", content: "[图片]", intent: "need_help" });
      expect(inbound.rawPayload.mediaUrl).toBe(imageUrl);
      expect(inbound.rawPayload.imageAnalysis.status).toBe("skipped");
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

  it("stores inbound messages without auto reply when smart reply is disabled", async () => {
    const originalFetch = globalThis.fetch;
    const sentMessages: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/open/auth/token")) return Response.json({ code: 200, data: { accessToken: "disabled-reply-token", expireIn: 3600 } });
      if (url.endsWith("/v1/accounts")) {
        return Response.json({ code: 200, data: [{ apiPhone: "disabled-reply-a2c", wabaId: "waba", status: 1, numberStatus: 1, qualityRating: 3, messagingLimit: 1000, verifiedName: "关闭自动回复客服" }] });
      }
      if (url.endsWith("/v1/messages")) {
        sentMessages.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
        return Response.json({ code: 200, data: `sent-${sentMessages.length}` });
      }
      return Response.json({ code: 200, data: "ok" });
    }) as typeof fetch;

    const app = buildApp(testConfig());
    try {
      const adminCookie = await login(app, "admin@test.local", "Admin123456");
      const merchant = await app.inject({ method: "POST", url: "/api/admin/merchants", headers: { cookie: adminCookie }, payload: { name: "关闭智能回复商户" } });
      const merchantId = merchant.json().id as string;
      await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { cookie: adminCookie },
        payload: { merchantId, email: "disabled-reply@test.local", name: "关闭智能回复", password: "Merchant123456", role: "merchant_admin" }
      });
      const merchantCookie = await login(app, "disabled-reply@test.local", "Merchant123456");
      await app.inject({
        method: "PATCH",
        url: "/api/merchant/config",
        headers: { cookie: merchantCookie },
        payload: { a2cBaseUrl: "https://disabled-reply-a2c.test/api/openapi", a2cAppId: "disabled-app", a2cAppSecret: "disabled-secret", smartReplyEnabled: false }
      });
      await app.inject({ method: "POST", url: "/api/merchant/a2c/accounts/sync", headers: { cookie: merchantCookie } });

      const webhook = await app.inject({
        method: "POST",
        url: `/webhooks/a2c/${merchantId}`,
        payload: {
          id: "disabled-reply-event-1",
          timestamp: Math.floor(Date.now() / 1000),
          type: "CUSTOMER_MESSAGE",
          data: {
            messageId: "disabled-reply-message-1",
            content: "Hello",
            from: "disabled-reply-customer",
            to: "disabled-reply-a2c",
            msgType: "text",
            timestamp: Math.floor(Date.now() / 1000)
          }
        }
      });
      expect(webhook.statusCode).toBe(200);
      expect(webhook.json().status).toBe("auto_reply_disabled");
      expect(sentMessages).toHaveLength(0);

      const conversations = await app.inject({ method: "GET", url: "/api/merchant/conversations", headers: { cookie: merchantCookie } });
      const conversationId = conversations.json().rows[0].id as string;
      const messages = await app.inject({ method: "GET", url: `/api/merchant/conversations/${conversationId}/messages`, headers: { cookie: merchantCookie } });
      expect(messages.json().rows).toHaveLength(1);
      expect(messages.json().rows[0]).toMatchObject({ direction: "inbound", content: "Hello" });
    } finally {
      await app.close();
      globalThis.fetch = originalFetch;
    }
  });

  it("forces strict script flow by merchant config and advances short confirmations", async () => {
    const originalFetch = globalThis.fetch;
    const sentMessages: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/open/auth/token")) return Response.json({ code: 200, data: { accessToken: "strict-flow-token", expireIn: 3600 } });
      if (url.endsWith("/v1/accounts")) return Response.json({ code: 200, data: [{ apiPhone: "strict-flow-a2c", verifiedName: "严格话本客服" }] });
      if (url.endsWith("/v1/messages")) {
        sentMessages.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
        return Response.json({ code: 200, data: `strict-sent-${sentMessages.length}` });
      }
      return Response.json({ code: 200, data: "ok" });
    }) as typeof fetch;

    const app = buildApp(testConfig());
    try {
      const adminCookie = await login(app, "admin@test.local", "Admin123456");
      const merchant = await app.inject({
        method: "POST",
        url: "/api/admin/merchants",
        headers: { cookie: adminCookie },
        payload: { name: "普通名称商户" }
      });
      const merchantId = merchant.json().id as string;
      await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { cookie: adminCookie },
        payload: { merchantId, email: "strict-config@test.local", name: "严格流程配置", password: "Merchant123456", role: "merchant_admin" }
      });
      const merchantCookie = await login(app, "strict-config@test.local", "Merchant123456");
      await app.inject({
        method: "PATCH",
        url: "/api/merchant/config",
        headers: { cookie: merchantCookie },
        payload: {
          a2cBaseUrl: "https://strict-flow-a2c.test/api/openapi",
          a2cAppId: "strict-app",
          a2cAppSecret: "strict-secret",
          strictScriptFlowEnabled: true
        }
      });

      for (const [index, content] of ["你好", "是的"].entries()) {
        const webhook = await app.inject({
          method: "POST",
          url: `/webhooks/a2c/${merchantId}`,
          payload: {
            id: `strict-flow-event-${index}`,
            timestamp: Math.floor(Date.now() / 1000),
            type: "CUSTOMER_MESSAGE",
            data: {
              messageId: `strict-flow-message-${index}`,
              content,
              from: "strict-flow-customer",
              to: "strict-flow-a2c",
              msgType: "text",
              timestamp: Math.floor(Date.now() / 1000)
            }
          }
        });
        expect(webhook.statusCode).toBe(200);
        expect(webhook.json().status).toBe("strict_flow_replied");
      }

      expect(sentMessages).toHaveLength(2);
      const conversations = await app.inject({ method: "GET", url: "/api/merchant/conversations", headers: { cookie: merchantCookie } });
      const conversationId = conversations.json().rows[0].id as string;
      expect(conversations.json().rows[0].flowStep).toBe("registration_intent");
      const messages = await app.inject({ method: "GET", url: `/api/merchant/conversations/${conversationId}/messages`, headers: { cookie: merchantCookie } });
      const outbounds = messages.json().rows.filter((row: { direction: string }) => row.direction === "outbound");
      expect(outbounds).toHaveLength(2);
      expect(outbounds[1].content).toContain("页面规则");
      expect(outbounds[1].content).toContain("空闲时间");
      expect(outbounds[1].content).not.toContain("好的，我继续协助您");
      expect(outbounds[1].rawPayload).toMatchObject({
        replyMode: "strict_flow",
        strictFlow: true,
        strictFlowEnabled: true,
        strictFlowStep: "registration_intent"
      });
    } finally {
      await app.close();
      globalThis.fetch = originalFetch;
    }
  });

  it("guards strict flow replies so customer-visible language matches the customer language", async () => {
    const originalFetch = globalThis.fetch;
    const sentMessages: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/open/auth/token")) return Response.json({ code: 200, data: { accessToken: "language-guard-token", expireIn: 3600 } });
      if (url.endsWith("/v1/accounts")) return Response.json({ code: 200, data: [{ apiPhone: "language-guard-a2c", verifiedName: "语言防线客服" }] });
      if (url.includes("generativelanguage.googleapis.com")) {
        return Response.json({ candidates: [{ content: { parts: [{ text: "好的，我简单介绍一下：这份兼职主要是帮商家提升产品销量和排名，佣金按任务和平台规则核算。您现在方便继续开户注册吗？" }] } }] });
      }
      if (url.endsWith("/v1/messages")) {
        sentMessages.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
        return Response.json({ code: 200, data: `language-guard-sent-${sentMessages.length}` });
      }
      return Response.json({ code: 200, data: "ok" });
    }) as typeof fetch;

    const app = buildApp(testConfig());
    try {
      const adminCookie = await login(app, "admin@test.local", "Admin123456");
      const merchant = await app.inject({
        method: "POST",
        url: "/api/admin/merchants",
        headers: { cookie: adminCookie },
        payload: { name: "语言防线商户" }
      });
      const merchantId = merchant.json().id as string;
      await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { cookie: adminCookie },
        payload: { merchantId, email: "language-guard@test.local", name: "语言防线", password: "Merchant123456", role: "merchant_admin" }
      });
      const merchantCookie = await login(app, "language-guard@test.local", "Merchant123456");
      await app.inject({
        method: "PATCH",
        url: "/api/merchant/config",
        headers: { cookie: merchantCookie },
        payload: {
          a2cBaseUrl: "https://language-guard-a2c.test/api/openapi",
          a2cAppId: "language-guard-app",
          a2cAppSecret: "language-guard-secret",
          googleAiApiKey: "gemini-test",
          strictScriptFlowEnabled: true
        }
      });
      await app.inject({ method: "POST", url: "/api/merchant/a2c/accounts/sync", headers: { cookie: merchantCookie } });

      for (const [index, content] of ["Hello", "yes"].entries()) {
        const webhook = await app.inject({
          method: "POST",
          url: `/webhooks/a2c/${merchantId}`,
          payload: {
            id: `language-guard-event-${index}`,
            timestamp: Math.floor(Date.now() / 1000) + index,
            type: "CUSTOMER_MESSAGE",
            data: {
              messageId: `language-guard-message-${index}`,
              content,
              from: "language-guard-customer",
              to: "language-guard-a2c",
              msgType: "text",
              timestamp: Math.floor(Date.now() / 1000) + index
            }
          }
        });
        expect(webhook.statusCode).toBe(200);
        expect(webhook.json().status).toBe("strict_flow_replied");
      }

      expect(sentMessages).toHaveLength(2);
      const secondReply = String(sentMessages[1].content);
      expect(secondReply).toContain("online part-time job");
      expect(secondReply).toContain("registration");
      expect(secondReply).not.toMatch(/[\u3400-\u9fff]/);

      const conversations = await app.inject({ method: "GET", url: "/api/merchant/conversations", headers: { cookie: merchantCookie } });
      const conversationId = conversations.json().rows[0].id as string;
      const messages = await app.inject({ method: "GET", url: `/api/merchant/conversations/${conversationId}/messages`, headers: { cookie: merchantCookie } });
      const outbounds = messages.json().rows.filter((row: { direction: string }) => row.direction === "outbound");
      expect(outbounds[1].rawPayload).toMatchObject({
        strictFlow: true,
        strictFlowStep: "registration_intent",
        languageGuardTarget: "en",
        languageGuardStatus: "fallback",
        languageGuardFallbackUsed: true
      });
    } finally {
      await app.close();
      globalThis.fetch = originalFetch;
    }
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
    const calls: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
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
        ["ai", true],
        ["telegram", true],
        ["platformRegisterUrl", true]
      ]);
      expect(calls.some((url) => url.endsWith("/v1/accounts"))).toBe(true);
    } finally {
      await app.close();
      globalThis.fetch = originalFetch;
    }
  });

  it("reports A2C config check errors from a real A2C request", async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/open/auth/token")) {
        return Response.json({ code: 401, msg: "访问过于频繁，请稍后再试" }, { status: 401 });
      }
      if (url.includes("generativelanguage.googleapis.com")) {
        return Response.json({ candidates: [{ content: { parts: [{ text: "OK" }] } }] });
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
        payload: { name: "A2C实时检测商户" }
      });
      const merchantId = merchant.json().id as string;
      await app.inject({
        method: "PATCH",
        url: `/api/admin/merchants/${merchantId}/config`,
        headers: { cookie: adminCookie },
        payload: {
          a2cBaseUrl: "https://a2c-check-error.test/api/openapi",
          a2cAppId: "check-error-app",
          a2cAppSecret: "check-error-secret",
          a2cAccountPhone: "saved-a2c-real-check",
          googleAiApiKey: "gemini-test",
          platformRegisterUrl: "https://merchant.example/register"
        }
      });
      await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { cookie: adminCookie },
        payload: {
          merchantId,
          email: "a2c-real-check@test.local",
          name: "A2C实时检测",
          password: "Merchant123456",
          role: "merchant_admin"
        }
      });
      const merchantCookie = await login(app, "a2c-real-check@test.local", "Merchant123456");

      const checked = await app.inject({
        method: "GET",
        url: "/api/merchant/config/check",
        headers: { cookie: merchantCookie }
      });

      expect(checked.statusCode).toBe(200);
      expect(checked.json().ok).toBe(false);
      const a2c = checked.json().rows.find((row: { key: string }) => row.key === "a2c");
      expect(a2c).toMatchObject({ ok: false, status: "error" });
      expect(a2c.detail).toContain("访问过于频繁");
      expect(calls.some((url) => url.endsWith("/open/auth/token"))).toBe(true);
    } finally {
      await app.close();
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps saved A2C accounts usable when manual sync is rate limited", async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/open/auth/token")) {
        return Response.json({ code: 401, msg: "访问过于频繁，请稍后再试" }, { status: 401 });
      }
      return Response.json({ code: 500, msg: "unexpected request" }, { status: 500 });
    }) as typeof fetch;

    const app = buildApp(testConfig());
    try {
      const adminCookie = await login(app, "admin@test.local", "Admin123456");
      const merchant = await app.inject({
        method: "POST",
        url: "/api/admin/merchants",
        headers: { cookie: adminCookie },
        payload: { name: "A2C限频商户" }
      });
      const merchantId = merchant.json().id as string;
      await app.inject({
        method: "PATCH",
        url: `/api/admin/merchants/${merchantId}/config`,
        headers: { cookie: adminCookie },
        payload: {
          a2cBaseUrl: "https://a2c-rate-limit.test/api/openapi",
          a2cAppId: "rate-limit-app",
          a2cAppSecret: "rate-limit-secret",
          a2cAccountPhone: "saved-a2c-1,saved-a2c-2"
        }
      });
      await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { cookie: adminCookie },
        payload: {
          merchantId,
          email: "a2c-rate-limit@test.local",
          name: "A2C限频管理员",
          password: "Merchant123456",
          role: "merchant_admin"
        }
      });
      const merchantCookie = await login(app, "a2c-rate-limit@test.local", "Merchant123456");

      const sync = await app.inject({
        method: "POST",
        url: "/api/merchant/a2c/accounts/sync",
        headers: { cookie: merchantCookie }
      });

      expect(sync.statusCode).toBe(200);
      expect(sync.json()).toMatchObject({ stale: true, imported: 0 });
      expect(sync.json().warning).toContain("本地保存的客服账号");
      expect(sync.json().rows).toHaveLength(2);
      expect(calls.filter((url) => url.endsWith("/open/auth/token"))).toHaveLength(1);
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
      expect(sentBodies[0]).toMatchObject({
        to: "manual-customer-phone",
        senderPhoneNumber: "manual-a2c-account",
        type: 1
      });
      expect(String(sentBodies[0].content)).toContain("We are verifying your information");

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
      expect(sent.json().externalId).toBe("manual-2");
      expect(sentBodies[1]).toMatchObject({
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
      expect(sentBodies[2]).toMatchObject({
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
        translatedContent: "请把手机号和 Telegram 发给我",
        operatorTranslatedContent: "请把手机号和 Telegram 发给我",
        operatorTranslationTargetLanguage: "zh-CN"
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
      const memory = await app.inject({
        method: "GET",
        url: `/api/merchant/conversations/${conversations.json().rows[0].id}/memory`,
        headers: { cookie: merchantCookie }
      });
      expect(memory.statusCode).toBe(200);
      expect(memory.json().facts.recentSignals).toEqual(expect.arrayContaining([
        expect.objectContaining({ direction: "outbound", content: "Hello, please register first." })
      ]));
    } finally {
      await app.close();
      globalThis.fetch = originalFetch;
    }
  });

  it("uses one merchant country for all A2C accounts and learns samples from replies", async () => {
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
        payload: { name: "单国家商户" }
      });
      const merchantId = merchant.json().id as string;
      await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { cookie: adminCookie },
        payload: { merchantId, email: "countries@test.local", name: "单国家", password: "Merchant123456", role: "merchant_admin" }
      });
      const merchantCookie = await login(app, "countries@test.local", "Merchant123456");

      await app.inject({
        method: "POST",
        url: "/api/merchant/countries",
        headers: { cookie: merchantCookie },
        payload: { name: "巴西", platformRegisterUrl: "https://br.example/register" }
      });
      await app.inject({
        method: "POST",
        url: "/api/merchant/countries",
        headers: { cookie: merchantCookie },
        payload: { name: "菲律宾", requireTelegram: false, requireWhatsApp: true }
      });
      const countries = await app.inject({ method: "GET", url: "/api/merchant/countries", headers: { cookie: merchantCookie } });
      expect(countries.json().rows).toHaveLength(1);
      expect(countries.json().rows[0]).toMatchObject({ code: "ph", name: "菲律宾", defaultLanguage: "en" });

      const bolivia = await app.inject({
        method: "POST",
        url: "/api/merchant/countries",
        headers: { cookie: merchantCookie },
        payload: { name: "玻利维亚", code: "default", defaultLanguage: "en" }
      });
      expect(bolivia.json()).toMatchObject({ code: "bo", name: "玻利维亚", defaultLanguage: "es" });
      const boliviaCountries = await app.inject({ method: "GET", url: "/api/merchant/countries", headers: { cookie: merchantCookie } });
      expect(boliviaCountries.json().rows).toHaveLength(1);
      expect(boliviaCountries.json().rows[0]).toMatchObject({ code: "bo", name: "玻利维亚", defaultLanguage: "es" });

      await app.inject({
        method: "PATCH",
        url: "/api/merchant/config",
        headers: { cookie: merchantCookie },
        payload: { a2cBaseUrl: "https://a2c.test/api/openapi", a2cAppId: "app-id", a2cAppSecret: "app-secret" }
      });
      await app.inject({ method: "POST", url: "/api/merchant/a2c/accounts/sync", headers: { cookie: merchantCookie } });
      const accounts = await app.inject({ method: "GET", url: "/api/merchant/a2c/accounts", headers: { cookie: merchantCookie } });
      expect(new Set(accounts.json().rows.map((row: { countryId: string }) => row.countryId))).toEqual(new Set([bolivia.json().id]));

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
      expect(new Set(conversations.json().rows.map((row: { countryId: string }) => row.countryId))).toEqual(new Set([bolivia.json().id]));

      for (const row of conversations.json().rows as Array<{ id: string; countryId: string }>) {
        const memory = await app.inject({ method: "GET", url: `/api/merchant/conversations/${row.id}/memory`, headers: { cookie: merchantCookie } });
        expect(memory.json().countryId).toBe(row.countryId);
      }
      const learned = await app.inject({ method: "GET", url: "/api/merchant/training-samples", headers: { cookie: merchantCookie } });
      const learnedRows = learned.json().rows as Array<{ keywords: string; customerMessage: string; standardReply: string; intent: string }>;
      expect(learnedRows.filter((row) => row.keywords.includes("conversation_sample"))).toHaveLength(2);
      expect(learnedRows[0].customerMessage).toContain("Hello, I need help");
      expect(learnedRows[0].standardReply.length).toBeGreaterThan(0);
      expect(learnedRows[0].intent).toBe("need_help");

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
