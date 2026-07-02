import type { AppConfig } from "../config.js";
import type { MerchantConfigRecord, Repositories } from "../repositories.js";

export type CountryRuntimeConfig = {
  platformRegisterUrl?: string;
  tgRegisterGuideUrl?: string;
};

export function appConfigForMerchant(config: AppConfig, merchantConfig: MerchantConfigRecord, country?: CountryRuntimeConfig): AppConfig {
  return {
    ...config,
    A2C_BASE_URL: merchantConfig.a2cBaseUrl || config.A2C_BASE_URL,
    A2C_APP_ID: merchantConfig.a2cAppId || config.A2C_APP_ID,
    A2C_APP_SECRET: merchantConfig.a2cAppSecret || config.A2C_APP_SECRET,
    OPENAI_API_KEY: merchantConfig.openaiApiKey || config.OPENAI_API_KEY,
    OPENAI_MODEL: merchantConfig.openaiModel || config.OPENAI_MODEL,
    AI_PROVIDER: merchantConfig.aiProvider || config.AI_PROVIDER,
    MINIMAX_API_KEY: merchantConfig.minimaxApiKey || config.MINIMAX_API_KEY,
    MINIMAX_MODEL: merchantConfig.minimaxModel || config.MINIMAX_MODEL,
    MINIMAX_BASE_URL: config.MINIMAX_BASE_URL,
    DEEPSEEK_API_KEY: merchantConfig.deepseekApiKey || config.DEEPSEEK_API_KEY,
    DEEPSEEK_MODEL: merchantConfig.deepseekModel || config.DEEPSEEK_MODEL,
    DEEPSEEK_BASE_URL: config.DEEPSEEK_BASE_URL,
    GOOGLE_AI_API_KEY: merchantConfig.googleAiApiKey || config.GOOGLE_AI_API_KEY,
    GOOGLE_AI_MODEL: merchantConfig.googleAiModel || config.GOOGLE_AI_MODEL,
    TELEGRAM_BOT_TOKEN: merchantConfig.telegramBotToken || config.TELEGRAM_BOT_TOKEN,
    TELEGRAM_HANDOFF_CHAT_ID: merchantConfig.telegramHandoffChatId || config.TELEGRAM_HANDOFF_CHAT_ID,
    PLATFORM_REGISTER_URL: country?.platformRegisterUrl || merchantConfig.platformRegisterUrl || config.PLATFORM_REGISTER_URL,
    TG_REGISTER_GUIDE_URL: country?.tgRegisterGuideUrl || merchantConfig.tgRegisterGuideUrl || config.TG_REGISTER_GUIDE_URL,
    REGISTRATION_TUTORIAL_IMAGE_URL: merchantConfig.registrationTutorialImageUrl || config.REGISTRATION_TUTORIAL_IMAGE_URL
  };
}

export function appConfigForConversation(config: AppConfig, repos: Repositories, conversation: Parameters<Repositories["updateConversation"]>[0]): AppConfig {
  const merchantConfig = repos.getMerchantConfig(conversation.merchantId);
  const country = repos.getMerchantCountry(conversation.countryId);
  return appConfigForMerchant(config, merchantConfig, country);
}
