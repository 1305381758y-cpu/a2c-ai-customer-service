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

export function buildConfigSavedMessage(config: Pick<ConfigForm, "a2cAppId" | "a2cAppSecret">): string {
  if (!config.a2cAppId || !config.a2cAppSecret) {
    return "配置已保存。填写 A2C App ID 和密钥后，可手动点击“同步A2C客服账号”。";
  }
  return "配置已保存。为避免 A2C 认证频繁，保存配置不会自动同步账号；需要刷新客服账号时请手动点击“同步A2C客服账号”。";
}

export function buildA2CSyncMessage(result: { imported: number; stale?: boolean; warning?: string }): string {
  if (result.stale) return result.warning || "A2C 暂时限频，已继续使用本地保存的客服账号。";
  return `已同步 ${result.imported} 个 A2C 客服账号，已自动写入接收账号。`;
}

export function buildTelegramSetupMessage(result: { webhookUrl?: string }): string {
  return `TG绑定已开启${result.webhookUrl ? `：${result.webhookUrl}` : ""}。请把机器人拉进唯一接管群，并在群里发送 /bind；发送后点“刷新TG状态”。`;
}
