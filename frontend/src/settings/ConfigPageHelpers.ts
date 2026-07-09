import type { A2CAccount, MerchantCountry } from "../types.js";

export type CountryDraft = {
  code: string;
  name: string;
  defaultLanguage: string;
  platformRegisterUrl: string;
  tgRegisterGuideUrl: string;
  requirePlatformAccount: string;
  requirePhone: string;
  requireTelegram: string;
  requireWhatsApp: string;
};

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

export type ConfigPageEndpoints = {
  config: string;
  countries: string;
  a2cAccounts: string;
  a2cSync: string;
  teacherTgLinks: string;
  check: string;
};

export function configPageEndpoints(platform: boolean, merchantId: string): ConfigPageEndpoints {
  return platform
    ? {
      config: `/api/admin/merchants/${merchantId}/config`,
      countries: `/api/admin/merchants/${merchantId}/countries`,
      a2cAccounts: `/api/admin/merchants/${merchantId}/a2c/accounts`,
      a2cSync: `/api/admin/merchants/${merchantId}/a2c/accounts/sync`,
      teacherTgLinks: `/api/admin/merchants/${merchantId}/teacher-tg-links`,
      check: `/api/admin/merchants/${merchantId}/config/check`
    }
    : {
      config: "/api/merchant/config",
      countries: "/api/merchant/countries",
      a2cAccounts: "/api/merchant/a2c/accounts",
      a2cSync: "/api/merchant/a2c/accounts/sync",
      teacherTgLinks: "/api/merchant/teacher-tg-links",
      check: "/api/merchant/config/check"
    };
}

export function configWebhookUrl(origin: string, platform: boolean, merchantId: string, form: Record<string, string | boolean>) {
  return `${origin}/webhooks/a2c/${platform ? merchantId : String(form.merchantId || "default")}`;
}

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

export function filterA2CAccounts(accounts: A2CAccount[], filters: { keyword: string; status: string; countryId: string }) {
  const keyword = filters.keyword.trim().toLowerCase();
  return accounts.filter((account) => {
    const haystack = [account.apiPhone, account.verifiedName, account.countryName, account.countryCode, account.wabaId].join(" ").toLowerCase();
    if (keyword && !haystack.includes(keyword)) return false;
    if (filters.status === "enabled" && !account.enabled) return false;
    if (filters.status === "disabled" && account.enabled) return false;
    if (filters.countryId && account.countryId !== filters.countryId) return false;
    return true;
  });
}
