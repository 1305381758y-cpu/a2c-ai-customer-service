import { describe, expect, it } from "vitest";

import type { MerchantCountry } from "../frontend/src/types.js";
import { applyCountryNameInference, buildA2CWebhookUrl, configEndpoints, countryToDraft, DEFAULT_COUNTRY_DRAFT, reinferCountryDraft } from "../frontend/src/config/configModel.js";

const makeCountry = (overrides: Partial<MerchantCountry>): MerchantCountry => ({
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
  ...overrides
});

describe("configModel", () => {
  it("maps merchant country rows to editable drafts", () => {
    expect(countryToDraft(makeCountry({
      code: "bo",
      name: "玻利维亚",
      defaultLanguage: "es",
      platformRegisterUrl: "https://register.example",
      requireWhatsApp: true
    }))).toMatchObject({
      code: "bo",
      name: "玻利维亚",
      defaultLanguage: "es",
      platformRegisterUrl: "https://register.example",
      requirePlatformAccount: "true",
      requirePhone: "true",
      requireTelegram: "true",
      requireWhatsApp: "true"
    });
  });

  it("infers country code and default language from country name", () => {
    const draft = applyCountryNameInference(DEFAULT_COUNTRY_DRAFT, "玻利维亚");

    expect(draft.code).toBe("bo");
    expect(draft.defaultLanguage).toBe("es");
    expect(draft.name).toBe("玻利维亚");
    expect(reinferCountryDraft({ ...DEFAULT_COUNTRY_DRAFT, name: "菲律宾" })).toMatchObject({ code: "ph", defaultLanguage: "en" });
  });

  it("builds platform and merchant config endpoints", () => {
    expect(configEndpoints(true, "merchant-1")).toMatchObject({
      configUrl: "/api/admin/merchants/merchant-1/config",
      countriesUrl: "/api/admin/merchants/merchant-1/countries",
      a2cAccountsUrl: "/api/admin/merchants/merchant-1/a2c/accounts",
      telegramSetupUrl: "/api/admin/merchants/merchant-1/telegram/setup-webhook"
    });
    expect(configEndpoints(false, "ignored")).toMatchObject({
      configUrl: "/api/merchant/config",
      countriesUrl: "/api/merchant/countries",
      a2cAccountsUrl: "/api/merchant/a2c/accounts",
      telegramSetupUrl: "/api/merchant/telegram/setup-webhook"
    });
  });

  it("builds merchant-specific A2C webhook urls", () => {
    expect(buildA2CWebhookUrl("https://service.example", true, "merchant-1", {})).toBe("https://service.example/webhooks/a2c/merchant-1");
    expect(buildA2CWebhookUrl("https://service.example", false, "ignored", { merchantId: "merchant-2" })).toBe("https://service.example/webhooks/a2c/merchant-2");
    expect(buildA2CWebhookUrl("https://service.example", false, "ignored", {})).toBe("https://service.example/webhooks/a2c/default");
  });
});
