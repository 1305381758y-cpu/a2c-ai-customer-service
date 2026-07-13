import { A2CClient, type A2CTokenStore } from "../clients/a2c.js";
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

export interface ResolvedInboundConversationSession {
  merchant: MerchantRecord;
  merchantConfig: MerchantConfigRecord;
  agentProfile: MerchantAgentProfileRecord;
  country: MerchantCountryRecord;
  conversation: Conversation;
  tokenStore?: A2CTokenStore;
}

export interface InboundConversationDirectory {
  resolve(input: {
    customerPhone: string;
    a2cAccountPhone: string;
    nickname: string;
    merchantId?: string;
    chargeSession?: boolean;
  }): ResolvedInboundConversationSession;
}

export class RepositoryInboundConversationDirectory implements InboundConversationDirectory {
  constructor(private readonly repos: Repositories) {}

  resolve(input: { customerPhone: string; a2cAccountPhone: string; nickname: string; merchantId?: string; chargeSession?: boolean }): ResolvedInboundConversationSession {
    const merchant = resolveMerchant(this.repos, input.a2cAccountPhone, input.merchantId);
    const merchantConfig = this.repos.getMerchantConfig(merchant.id);
    const agentProfile = this.repos.getMerchantAgentProfile(merchant.id);
    const country = this.repos.ensurePrimaryCountry(merchant.id);
    const conversation = this.repos.getOrCreateConversation(input.customerPhone, input.a2cAccountPhone, input.nickname, merchant.id, country.id, input.chargeSession ?? true);
    return {
      merchant,
      merchantConfig,
      agentProfile,
      country,
      conversation,
      tokenStore: this.repos.a2cTokenStore(merchant.id)
    };
  }
}

export async function prepareInboundConversationContext(input: {
  repos: Repositories;
  ai: Pick<AiTasks, "analyzeImage">;
  config: AppConfig;
  payload: A2CWebhookPayload;
  merchantId?: string;
  simulation?: boolean;
  directory?: InboundConversationDirectory;
}): Promise<PreparedInboundConversationContext> {
  const normalized = normalizeA2CWebhookPayload(input.payload);
  const { data, mediaUrl, shouldAnalyzeImage, analysisText, content } = normalized;
  const directory = input.directory || new RepositoryInboundConversationDirectory(input.repos);
  const knownMerchant = input.directory ? undefined : resolveMerchant(input.repos, data.to, input.merchantId);
  const configBeforeConversation = knownMerchant ? input.repos.getMerchantConfig(knownMerchant.id) : undefined;
  const simulation = Boolean(input.simulation || configBeforeConversation?.trainingSimulationEnabled);
  const { merchant: resolvedMerchant, merchantConfig, agentProfile, country, conversation, tokenStore } = directory.resolve({
    customerPhone: data.from,
    a2cAccountPhone: data.to,
    nickname: data.nickname ?? "",
    merchantId: input.merchantId,
    ...(knownMerchant ? { chargeSession: !simulation } : {})
  });
  const runtimeConfig = appConfigForMerchant(input.config, merchantConfig, country);
  const imageAnalysis = shouldAnalyzeImage
    ? await input.ai.analyzeImage(runtimeConfig, mediaUrl)
    : { text: "", status: "skipped" as const };
  const customerTextForAi = analysisText || (imageAnalysis.text ? `${content} ${imageAnalysis.text}` : content);

  return {
    ...normalized,
    merchant: resolvedMerchant,
    merchantConfig,
    agentProfile,
    country,
    runtimeConfig,
    a2c: new A2CClient(runtimeConfig, tokenStore),
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
