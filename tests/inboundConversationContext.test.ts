import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";
import { prepareInboundConversationContext } from "../src/services/inboundConversationContext.js";
import type { A2CWebhookPayload } from "../src/services/inboundMessage.js";

function payload(data: Partial<A2CWebhookPayload["data"]>): A2CWebhookPayload {
  return {
    id: "payload-1",
    timestamp: 1,
    type: "CUSTOMER_MESSAGE",
    data: {
      messageId: "message-1",
      content: "你好",
      from: "customer-1",
      to: "agent-1",
      msgType: "text",
      timestamp: 1,
      ...data
    }
  };
}

function config() {
  return loadConfig({
    DATABASE_URL: ":memory:",
    A2C_BASE_URL: "https://a2c.test",
    A2C_APP_ID: "default-app",
    A2C_APP_SECRET: "default-secret"
  });
}

describe("inbound conversation context", () => {
  it("prepares merchant, country, runtime config, conversation and text analysis input behind one interface", async () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("上下文商户");
    repos.createMerchantCountry(merchant.id, {
      name: "玻利维亚",
      platformRegisterUrl: "https://bo.example/register",
      requirePlatformAccount: true,
      requirePhone: true,
      requireTelegram: true
    });
    repos.patchMerchantConfig(merchant.id, {
      a2cBaseUrl: "https://merchant-a2c.test",
      a2cAppId: "merchant-app",
      a2cAppSecret: "merchant-secret",
      trainingSimulationEnabled: true
    });
    const ai = { analyzeImage: vi.fn() };

    const context = await prepareInboundConversationContext({
      repos,
      ai,
      config: config(),
      payload: payload({ content: "Hola", nickname: "客户A" }),
      merchantId: merchant.id
    });

    expect(context.merchant.id).toBe(merchant.id);
    expect(context.country.name).toBe("玻利维亚");
    expect(context.runtimeConfig.A2C_APP_ID).toBe("merchant-app");
    expect(context.runtimeConfig.PLATFORM_REGISTER_URL).toBe("https://bo.example/register");
    expect(context.conversation.customerPhone).toBe("customer-1");
    expect(context.conversation.nickname).toBe("客户A");
    expect(context.customerTextForAi).toBe("Hola");
    expect(context.simulation).toBe(true);
    expect(ai.analyzeImage).not.toHaveBeenCalled();
  });

  it("keeps image URLs out of customer text and appends OCR text when available", async () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("图片上下文商户");
    const ai = {
      analyzeImage: vi.fn(async () => ({ text: "页面显示无法访问", status: "ok" as const }))
    };

    const context = await prepareInboundConversationContext({
      repos,
      ai,
      config: config(),
      payload: payload({
        from: "customer-image",
        to: "agent-image",
        content: "https://bucket.example.com/1226109357673717760.jpg?Expires=1782043661",
        url: "https://bucket.example.com/1226109357673717760.jpg?Expires=1782043661",
        msgType: "2"
      }),
      merchantId: merchant.id,
      simulation: true
    });

    expect(context.msgType).toBe("image");
    expect(context.content).toBe("[图片]");
    expect(context.customerTextForAi).toBe("[图片] 页面显示无法访问");
    expect(context.customerTextForAi).not.toContain("1226109357673717760");
    expect(context.simulation).toBe(true);
    expect(ai.analyzeImage).toHaveBeenCalledOnce();
  });

  it("can resolve merchant session through an injected directory", async () => {
    const merchant = { id: "merchant-directory", name: "目录商户", status: "active" as const };
    const merchantConfig = {
      merchantId: merchant.id,
      a2cBaseUrl: "https://directory-a2c.test",
      a2cAppId: "directory-app",
      a2cAppSecret: "directory-secret",
      trainingSimulationEnabled: false
    };
    const country = {
      id: "country-directory",
      merchantId: merchant.id,
      code: "BO",
      name: "玻利维亚",
      defaultLanguage: "es",
      platformRegisterUrl: "https://bo.example/register",
      tgRegisterGuideUrl: "",
      requirePlatformAccount: true,
      requirePhone: true,
      requireTelegram: true,
      requireWhatsApp: false,
      status: "active" as const
    };
    const conversation = {
      id: "conversation-directory",
      merchantId: merchant.id,
      countryId: country.id,
      customerPhone: "customer-directory",
      a2cAccountPhone: "agent-directory",
      nickname: "目录客户",
      language: "es",
      stage: "new",
      status: "active" as const
    };
    const directory = {
      resolve: vi.fn(() => ({
        merchant,
        merchantConfig,
        agentProfile: { merchantId: merchant.id, agentName: "目录客服" },
        country,
        conversation,
        tokenStore: {
          get: vi.fn(),
          set: vi.fn()
        }
      }))
    };

    const context = await prepareInboundConversationContext({
      repos: {} as never,
      ai: { analyzeImage: vi.fn() },
      config: config(),
      payload: payload({
        from: "customer-directory",
        to: "agent-directory",
        content: "Información",
        nickname: "目录客户"
      }),
      merchantId: merchant.id,
      directory: directory as never
    });

    expect(directory.resolve).toHaveBeenCalledWith({
      customerPhone: "customer-directory",
      a2cAccountPhone: "agent-directory",
      nickname: "目录客户",
      merchantId: merchant.id
    });
    expect(context.merchant).toBe(merchant);
    expect(context.conversation).toBe(conversation);
    expect(context.runtimeConfig.A2C_APP_ID).toBe("directory-app");
    expect(context.runtimeConfig.PLATFORM_REGISTER_URL).toBe("https://bo.example/register");
  });
});
