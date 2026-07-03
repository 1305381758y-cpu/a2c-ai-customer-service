import { A2CClient } from "../clients/a2c.js";
import type { AppConfig } from "../config.js";
import type { Conversation, MerchantConfigRecord, Repositories } from "../repositories.js";
import { buildOutboundConversationRawPayload } from "./outboundConversationPayload.js";
import { appConfigForMerchant } from "./runtimeConfig.js";
import { translateForCustomer, translateForOperator, type TranslationResult } from "./translation.js";

export type ManualOutboundBody = {
  type?: "text" | "image" | "video" | "audio" | "document";
  content?: string;
  url?: string;
  caption?: string;
  fileName?: string;
};

export type ManualOutboundResult = {
  externalId: string;
  conversation: Conversation;
  content: string;
  translation?: TranslationResult;
};

export type ManualOutboundSendResult =
  | { ok: true; value: ManualOutboundResult }
  | { ok: false; statusCode: number; error: string };

export type ManualOutboundDeps = {
  config: AppConfig;
  repos: Repositories;
};

export async function sendManualOutboundMessage(
  deps: ManualOutboundDeps,
  input: {
    merchantId: string;
    conversation: Conversation;
    body: ManualOutboundBody;
    rawPayload: Record<string, unknown>;
  }
): Promise<ManualOutboundSendResult> {
  const cfg = deps.repos.getMerchantConfig(input.merchantId);
  const country = deps.repos.getMerchantCountry(input.conversation.countryId);
  const runtimeConfig = appConfigForMerchant(deps.config, cfg, country);
  const client = new A2CClient(runtimeConfig, deps.repos.a2cTokenStore(input.merchantId));
  const type = input.body.type ?? "text";
  const translation = type === "text" ? await translateForCustomer(runtimeConfig, input.body.content || "", input.conversation.language) : undefined;
  const outgoingContent = translation?.translatedText || input.body.content;
  const operatorTranslation = type === "text" && outgoingContent ? await translateForOperator(runtimeConfig, outgoingContent, input.conversation.language) : undefined;
  try {
    const externalId = await client.sendMessage({
      to: input.conversation.customerPhone,
      senderPhoneNumber: input.conversation.a2cAccountPhone,
      type,
      content: outgoingContent,
      url: input.body.url,
      caption: input.body.caption,
      fileName: input.body.fileName
    });
    const content = outgoingContent || input.body.caption || input.body.url || "";
    deps.repos.insertMessage({
      conversationId: input.conversation.id,
      direction: "outbound",
      externalId,
      content,
      msgType: type,
      language: input.conversation.language,
      intent: "unknown",
      rawPayload: buildOutboundConversationRawPayload({
        basePayload: input.rawPayload,
        customerTranslation: translation,
        operatorTranslation,
        sendResult: {
          externalId,
          a2cSendStatus: "sent",
          a2cSendError: ""
        }
      })
    });
    return { ok: true, value: { externalId, conversation: input.conversation, content, translation } };
  } catch (error) {
    return { ok: false, statusCode: 502, error: error instanceof Error ? error.message : "send failed" };
  }
}

export function a2cAccountAllowed(repos: Repositories, merchantId: string, config: MerchantConfigRecord, apiPhone: string): boolean {
  const enabledAccount = repos.listMerchantA2CAccounts({ merchantId, enabled: true }).some((account) => account.apiPhone === apiPhone);
  if (enabledAccount) return true;
  return config.a2cAccountPhone.split(",").map((item) => item.trim()).filter(Boolean).includes(apiPhone);
}
