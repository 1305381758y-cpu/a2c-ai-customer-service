import type { MerchantCountry } from "../types.js";
import { inferCountryProfile } from "../ui/country.js";
import type { CountryDraft } from "./CountrySettingsCard.js";
import type { ConfigForm } from "./types.js";

export const DEFAULT_COUNTRY_DRAFT: CountryDraft = {
  code: "br",
  name: "巴西",
  defaultLanguage: "pt-BR",
  platformRegisterUrl: "",
  tgRegisterGuideUrl: "",
  requirePlatformAccount: "true",
  requirePhone: "true",
  requireTelegram: "true",
  requireWhatsApp: "false"
};

export function countryToDraft(country: MerchantCountry): CountryDraft {
  return {
    code: country.code || "default",
    name: country.name || "默认国家",
    defaultLanguage: country.defaultLanguage || "unknown",
    platformRegisterUrl: country.platformRegisterUrl || "",
    tgRegisterGuideUrl: country.tgRegisterGuideUrl || "",
    requirePlatformAccount: String(country.requirePlatformAccount),
    requirePhone: String(country.requirePhone),
    requireTelegram: String(country.requireTelegram),
    requireWhatsApp: String(country.requireWhatsApp)
  };
}

export function applyCountryNameInference(draft: CountryDraft, name: string): CountryDraft {
  const inferred = inferCountryProfile(name);
  return { ...draft, name, code: inferred.code, defaultLanguage: inferred.defaultLanguage };
}

export function reinferCountryDraft(draft: CountryDraft): CountryDraft {
  return applyCountryNameInference(draft, draft.name);
}

export function configEndpoints(platform: boolean, merchantId: string) {
  return {
    configUrl: platform ? `/api/admin/merchants/${merchantId}/config` : "/api/merchant/config",
    countriesUrl: platform ? `/api/admin/merchants/${merchantId}/countries` : "/api/merchant/countries",
    a2cAccountsUrl: platform ? `/api/admin/merchants/${merchantId}/a2c/accounts` : "/api/merchant/a2c/accounts",
    a2cSyncUrl: platform ? `/api/admin/merchants/${merchantId}/a2c/accounts/sync` : "/api/merchant/a2c/accounts/sync",
    checkUrl: platform ? `/api/admin/merchants/${merchantId}/config/check` : "/api/merchant/config/check",
    telegramSetupUrl: platform ? `/api/admin/merchants/${merchantId}/telegram/setup-webhook` : "/api/merchant/telegram/setup-webhook",
    registrationTutorialImageUrl: platform ? `/api/admin/merchants/${merchantId}/config/registration-tutorial-image` : "/api/merchant/config/registration-tutorial-image"
  };
}

export function buildA2CWebhookUrl(origin: string, platform: boolean, merchantId: string, form: ConfigForm) {
  return `${origin}/webhooks/a2c/${platform ? merchantId : String(form.merchantId || "default")}`;
}
