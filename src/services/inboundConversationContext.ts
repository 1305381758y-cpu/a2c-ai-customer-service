import { A2CClient } from "../clients/a2c.js";
import { TelegramClient } from "../clients/telegram.js";
import type { AppConfig } from "../config.js";
import type { Conversation, MerchantAgentProfileRecord, MerchantConfigRecord, MerchantCountryRecord, MerchantRecord, Repositories } from "../repositories.js";
import type { AiTasks } from "./aiTasks.js";
import { normalizeA2CWebhookPayload, type A2CWebhookPayload, type NormalizedInboundMessage } from "./inboundMessage.js";
import { appConfigForMerchant } from "./runtimeConfig.js";

export interface PreparedInboundConversationContext extends NormalizedInboundMessage {
  merchant: MerchantRecord;
  merchantConfig: MerchantConfigRecord;
  agentProfile: MerchantAgentProfileRecord;
  country: MerchantCountryRecord;
  runtimeConfig: AppConfig;
  a2c: A2CClient;
  telegram: TelegramClient;
  conversation: Conversation;
  imageAnalysis: Awaited<ReturnType<AiTasks["analyzeImage"]>>;
  customerTextForAi: string;
  simulation: boolean;
}

export async function prepareInboundConversationContext(input: {
  repos: Repositories;
  ai: Pick<AiTasks, "analyzeImage">;
  config: AppConfig;
  payload: A2CWebhookPayload;
  merchantId?: string;
  simulation?: boolean;
}): Promise<PreparedInboundConversationContext> {
  const normalized = normalizeA2CWebhookPayload(input.payload);
  const { data, mediaUrl, shouldAnalyzeImage, analysisText, content } = normalized;
  const merchant = resolveMerchant(input.repos, data.to, input.merchantId);
  const merchantConfig = input.repos.getMerchantConfig(merchant.id);
  const agentProfile = input.repos.getMerchantAgentProfile(merchant.id);
  const simulation = Boolean(input.simulation || merchantConfig.trainingSimulationEnabled);
  const country = input.repos.ensurePrimaryCountry(merchant.id);
  const runtimeConfig = appConfigForMerchant(input.config, merchantConfig, country);
  const conversation = input.repos.getOrCreateConversation(data.from, data.to, data.nickname ?? "", merchant.id, country.id);
  const imageAnalysis = shouldAnalyzeImage
    ? await input.ai.analyzeImage(runtimeConfig, mediaUrl)
    : { text: "", status: "skipped" as const };
  const customerTextForAi = analysisText || (imageAnalysis.text ? `${content} ${imageAnalysis.text}` : content);

  return {
    ...normalized,
    merchant,
    merchantConfig,
    agentProfile,
    country,
    runtimeConfig,
    a2c: new A2CClient(runtimeConfig, input.repos.a2cTokenStore(merchant.id)),
    telegram: new TelegramClient(runtimeConfig),
    conversation,
    imageAnalysis,
    customerTextForAi,
    simulation
  };
}

function resolveMerchant(repos: Repositories, a2cAccountPhone: string, merchantId?: string): MerchantRecord {
  if (!merchantId) return repos.findMerchantByA2CAccount(a2cAccountPhone);
  return repos.getMerchant(merchantId) ?? repos.findMerchantByA2CAccount(a2cAccountPhone);
}
