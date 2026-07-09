import { describe, expect, it } from "vitest";

import { configA2CAccountPatchEndpoint, configPageEndpoints, configSaveSuccessMessage, configTelegramSetupEndpoint, configTutorialImageEndpoint, configWebhookUrl, countryToDraft, filterA2CAccounts, teacherTgImportPayload } from "../frontend/src/settings/ConfigPageHelpers.js";
import type { A2CAccount, MerchantCountry } from "../frontend/src/types.js";

describe("frontend config page helpers", () => {
  it("builds merchant setting endpoints", () => {
    expect(configPageEndpoints(false, "ignored")).toEqual({
      config: "/api/merchant/config",
      countries: "/api/merchant/countries",
      a2cAccounts: "/api/merchant/a2c/accounts",
      a2cSync: "/api/merchant/a2c/accounts/sync",
      teacherTgLinks: "/api/merchant/teacher-tg-links",
      check: "/api/merchant/config/check"
    });
  });

  it("builds platform setting endpoints for the selected merchant", () => {
    expect(configPageEndpoints(true, "merchant-1")).toEqual({
      config: "/api/admin/merchants/merchant-1/config",
      countries: "/api/admin/merchants/merchant-1/countries",
      a2cAccounts: "/api/admin/merchants/merchant-1/a2c/accounts",
      a2cSync: "/api/admin/merchants/merchant-1/a2c/accounts/sync",
      teacherTgLinks: "/api/admin/merchants/merchant-1/teacher-tg-links",
      check: "/api/admin/merchants/merchant-1/config/check"
    });
  });

  it("builds webhook urls for platform and merchant pages", () => {
    expect(configWebhookUrl("https://service.example", true, "merchant-1", { merchantId: "ignored" })).toBe("https://service.example/webhooks/a2c/merchant-1");
    expect(configWebhookUrl("https://service.example", false, "ignored", { merchantId: "merchant-2" })).toBe("https://service.example/webhooks/a2c/merchant-2");
    expect(configWebhookUrl("https://service.example", false, "ignored", {})).toBe("https://service.example/webhooks/a2c/default");
  });

  it("builds action endpoints for settings buttons", () => {
    expect(configTutorialImageEndpoint(false, "ignored")).toBe("/api/merchant/config/registration-tutorial-image");
    expect(configTutorialImageEndpoint(true, "merchant-1")).toBe("/api/admin/merchants/merchant-1/config/registration-tutorial-image");
    expect(configTelegramSetupEndpoint(false, "ignored")).toBe("/api/merchant/telegram/setup-webhook");
    expect(configTelegramSetupEndpoint(true, "merchant-1")).toBe("/api/admin/merchants/merchant-1/telegram/setup-webhook");
    expect(configA2CAccountPatchEndpoint(false, 7)).toBe("/api/merchant/a2c/accounts/7");
    expect(configA2CAccountPatchEndpoint(true, 7)).toBe("/api/admin/a2c/accounts/7");
  });

  it("explains whether account sync is available after saving config", () => {
    expect(configSaveSuccessMessage({})).toContain("填写 A2C App ID 和密钥");
    expect(configSaveSuccessMessage({ a2cAppId: "app", a2cAppSecret: "secret" })).toContain("保存配置不会自动同步账号");
  });

  it("converts current country config into editable draft values", () => {
    expect(countryToDraft(country({ name: "玻利维亚", code: "bo", defaultLanguage: "es", requireWhatsApp: false }))).toMatchObject({
      code: "bo",
      name: "玻利维亚",
      defaultLanguage: "es",
      requirePlatformAccount: "true",
      requirePhone: "true",
      requireTelegram: "true",
      requireWhatsApp: "false"
    });
  });

  it("filters A2C accounts by keyword, status and country", () => {
    const accounts = [
      account({ apiPhone: "1001", verifiedName: "Bolivia Desk", countryId: "bo", countryName: "玻利维亚", enabled: true }),
      account({ apiPhone: "2002", verifiedName: "Brazil Desk", countryId: "br", countryName: "巴西", enabled: false })
    ];

    expect(filterA2CAccounts(accounts, { keyword: "bolivia", status: "", countryId: "" }).map((item) => item.apiPhone)).toEqual(["1001"]);
    expect(filterA2CAccounts(accounts, { keyword: "", status: "enabled", countryId: "bo" }).map((item) => item.apiPhone)).toEqual(["1001"]);
    expect(filterA2CAccounts(accounts, { keyword: "", status: "disabled", countryId: "br" }).map((item) => item.apiPhone)).toEqual(["2002"]);
  });

  it("builds teacher Telegram import payload from the current country and draft", () => {
    expect(teacherTgImportPayload(country({ id: "bo-country" }), { urls: "https://t.me/a\nhttps://t.me/b", priority: "5", rotationCount: "3" })).toEqual({
      countryId: "bo-country",
      urls: "https://t.me/a\nhttps://t.me/b",
      priority: 5,
      rotationCount: 3
    });
    expect(teacherTgImportPayload(country({ id: "bo-country" }), { urls: "https://t.me/a", priority: "", rotationCount: "" })).toMatchObject({
      priority: 0,
      rotationCount: 1
    });
  });
});

function country(patch: Partial<MerchantCountry> = {}): MerchantCountry {
  return {
    id: "country-1",
    merchantId: "merchant-1",
    code: "br",
    name: "巴西",
    defaultLanguage: "pt-BR",
    platformRegisterUrl: "",
    tgRegisterGuideUrl: "",
    requirePlatformAccount: true,
    requirePhone: true,
    requireTelegram: true,
    requireWhatsApp: false,
    status: "active",
    ...patch
  };
}

function account(patch: Partial<A2CAccount> = {}): A2CAccount {
  return {
    id: 1,
    merchantId: "merchant-1",
    countryId: "br",
    countryCode: "br",
    countryName: "巴西",
    defaultLanguage: "pt-BR",
    apiPhone: "1001",
    wabaId: "",
    status: 1,
    numberStatus: 1,
    qualityRating: 1,
    messagingLimit: 1000,
    verifiedName: "A2C Account",
    enabled: true,
    syncedAt: "2026-07-01 00:00:00",
    ...patch
  };
}
