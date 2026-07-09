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
