import { A2CClient } from "../clients/a2c.js";
import type { AppConfig } from "../config.js";
import type { Conversation, MerchantConfigRecord, Repositories } from "../repositories.js";
import { recordOutboundConversationMessage, type OutboundConversationRecordResult } from "./outboundConversationRecorder.js";
import { appConfigForConversation } from "./runtimeConfig.js";
import { translateForCustomer, type TranslationResult } from "./translation.js";

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
  a2cClientFactory?: (runtimeConfig: AppConfig, merchantId: string) => Pick<A2CClient, "sendMessage">;
  outboundRecorder?: typeof recordOutboundConversationMessage;
  customerTranslator?: typeof translateForCustomer;
};

export async function sendManualOutboundMessage(
  deps: ManualOutboundDeps,
  input: {
    merchantId: string;
    conversation: Conversation;
    body: ManualOutboundBody;
    rawPayload: Record<string, unknown>;
    recordMemory?: boolean;
  }
): Promise<ManualOutboundSendResult> {
  const runtimeConfig = appConfigForConversation(deps.config, deps.repos, input.conversation);
  const client = deps.a2cClientFactory
    ? deps.a2cClientFactory(runtimeConfig, input.merchantId)
    : new A2CClient(runtimeConfig, deps.repos.a2cTokenStore(input.merchantId));
  const type = input.body.type ?? "text";
  const translateCustomer = deps.customerTranslator || translateForCustomer;
  const translation = type === "text" ? await translateCustomer(runtimeConfig, input.body.content || "", input.conversation.language) : undefined;
  const outgoingContent = translation?.translatedText || input.body.content;
  const content = outgoingContent || input.body.caption || input.body.url || "";
  const recordOutbound = deps.outboundRecorder || recordOutboundConversationMessage;
  const outbound: OutboundConversationRecordResult = await recordOutbound({
    repos: deps.repos,
    runtimeConfig,
    a2c: client,
    conversation: input.conversation,
    payload: {
      to: input.conversation.customerPhone,
      senderPhoneNumber: input.conversation.a2cAccountPhone,
      type,
      content: outgoingContent,
      url: input.body.url,
      caption: input.body.caption,
      fileName: input.body.fileName
    },
    idPolicy: {
      simulatedPrefix: "simulated_manual",
      sentFallbackPrefix: "a2c_manual",
      failedPrefix: "manual_send_failed",
      contextId: input.conversation.id
    },
    message: {
      content,
      msgType: type,
      language: input.conversation.language,
      intent: "unknown",
      rawPayload: input.rawPayload,
      customerTranslation: translation
    },
    operatorTranslation: type === "text" && Boolean(outgoingContent),
    memory: input.recordMemory ? {
      intent: "unknown",
      content,
      direction: "outbound"
    } : undefined
  });
  if (outbound.sendResult.a2cSendStatus === "failed") {
    return { ok: false, statusCode: 502, error: outbound.sendResult.a2cSendError || "send failed" };
  }
  return { ok: true, value: { externalId: outbound.sendResult.externalId, conversation: input.conversation, content, translation } };
}

export async function sendProactiveManualOutboundMessage(
  deps: ManualOutboundDeps,
  input: {
    merchantId: string;
    apiPhone: string;
    customerPhone: string;
    nickname?: string;
    body: ManualOutboundBody;
  }
): Promise<ManualOutboundSendResult> {
  const cfg = deps.repos.getMerchantConfig(input.merchantId);
  if (!a2cAccountAllowed(deps.repos, input.merchantId, cfg, input.apiPhone)) {
    return { ok: false, statusCode: 404, error: "a2c account not found or disabled" };
  }

  const conversation = deps.repos.getOrCreateConversation(
    input.customerPhone,
    input.apiPhone,
    input.nickname || "",
    input.merchantId,
    deps.repos.defaultCountryId(input.merchantId)
  );
  deps.repos.upsertCustomerFromConversation(conversation);
  return sendManualOutboundMessage(deps, {
    merchantId: input.merchantId,
    conversation,
    body: input.body,
    rawPayload: { replyMode: "manual", manual: true, proactive: true },
    recordMemory: true
  });
}

export function a2cAccountAllowed(repos: Repositories, merchantId: string, config: MerchantConfigRecord, apiPhone: string): boolean {
  const enabledAccount = repos.listMerchantA2CAccounts({ merchantId, enabled: true }).some((account) => account.apiPhone === apiPhone);
  if (enabledAccount) return true;
  return config.a2cAccountPhone.split(",").map((item) => item.trim()).filter(Boolean).includes(apiPhone);
}
