import { describe, expect, it } from "vitest";
import {
  mapA2CInviteCode,
  mapMerchant,
  mapMerchantA2CAccount,
  mapMerchantAgentProfile,
  mapMerchantConfig,
  mapMerchantCountry
} from "../src/repositoryMerchantMappers.js";

describe("repositoryMerchantMappers", () => {
  it("maps merchants and AI config defaults", () => {
    expect(mapMerchant({ id: "m1", name: "阿斯顿" })).toEqual({
      id: "m1",
      name: "阿斯顿",
      status: "active"
    });

    expect(mapMerchantConfig({
      merchant_id: "m1",
      ai_provider: "other",
      google_ai_api_key: "google-key",
      smart_reply_enabled: 0,
      training_simulation_enabled: 1,
      strict_script_flow_enabled: 1,
      telegram_handoff_chat_status: "bad"
    })).toMatchObject({
      merchantId: "m1",
      aiProvider: "minimax",
      minimaxModel: "MiniMax-M3",
      deepseekModel: "deepseek-chat",
      googleAiApiKey: "google-key",
      googleAiModel: "gemini-2.5-flash",
      telegramHandoffChatStatus: "unbound",
      smartReplyEnabled: false,
      trainingSimulationEnabled: true,
      strictScriptFlowEnabled: true
    });

    expect(mapMerchantConfig({ merchant_id: "m2", ai_provider: "deepseek" }).aiProvider).toBe("deepseek");
    expect(mapMerchantConfig({ merchant_id: "m3", ai_provider: "gemini" }).aiProvider).toBe("gemini");
  });

  it("maps agent profile defaults for merchant-specific agent behavior", () => {
    expect(mapMerchantAgentProfile({ merchant_id: "m1", enabled: 0 })).toMatchObject({
      merchantId: "m1",
      agentName: "开户注册接待专员",
      enabled: false
    });
  });

  it("maps A2C accounts and invite codes with country/status fallbacks", () => {
    expect(mapMerchantA2CAccount({
      id: 12,
      merchant_id: "m1",
      api_phone: "5511",
      enabled: 0
    })).toMatchObject({
      id: 12,
      merchantId: "m1",
      countryId: "m1:default",
      countryCode: "default",
      countryName: "默认国家",
      defaultLanguage: "unknown",
      apiPhone: "5511",
      enabled: false
    });

    expect(mapA2CInviteCode({
      id: 8,
      merchant_id: "m1",
      a2c_account_id: 12,
      code: "INV-1",
      status: "bad"
    })).toMatchObject({
      id: 8,
      merchantId: "m1",
      countryId: "m1:default",
      a2cAccountId: 12,
      code: "INV-1",
      status: "available"
    });
  });

  it("maps countries and default completion goals", () => {
    expect(mapMerchantCountry({
      id: "m1:bo",
      merchant_id: "m1",
      code: "BO",
      name: "玻利维亚",
      default_language: "es",
      require_whatsapp: 1
    })).toMatchObject({
      id: "m1:bo",
      merchantId: "m1",
      code: "BO",
      name: "玻利维亚",
      defaultLanguage: "es",
      requirePlatformAccount: true,
      requirePhone: true,
      requireTelegram: true,
      requireWhatsApp: true,
      status: "active"
    });
  });
});
