import { z } from "zod";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { requireUser } from "../auth.js";
import { A2CClient } from "../clients/a2c.js";
import type { AppConfig } from "../config.js";
import type { MerchantConfigRecord, Repositories } from "../repositories.js";
import { appConfigForMerchant } from "../services/runtimeConfig.js";
import { translateForCustomer, translateForOperator } from "../services/translation.js";
import { scopedMerchantId } from "./routeHelpers.js";

type MerchantOutboundMessageRoutesDeps = {
  config: AppConfig;
  repos: Repositories;
  merchantRoles: ReturnType<typeof requireUser>;
};

const manualSendSchema = z.object({
  type: z.enum(["text", "image", "video", "audio", "document"]).optional(),
  content: z.string().optional(),
  url: z.string().optional(),
  caption: z.string().optional(),
  fileName: z.string().optional()
});

const proactiveSendSchema = manualSendSchema.extend({
  customerPhone: z.string().min(1),
  nickname: z.string().optional()
});

type ManualSendBody = z.infer<typeof manualSendSchema>;
type ProactiveSendBody = z.infer<typeof proactiveSendSchema>;

export function registerMerchantOutboundMessageRoutes(app: FastifyInstance, deps: MerchantOutboundMessageRoutesDeps): void {
  app.post<{ Params: { id: string }; Body: ManualSendBody }>("/api/merchant/conversations/:id/send", { preHandler: deps.merchantRoles }, async (request, reply) => {
    const conversation = deps.repos.getConversation(request.params.id);
    if (!conversation || conversation.merchantId !== scopedMerchantId(request)) return reply.code(404).send({ error: "conversation not found" });
    return sendOutboundMessage(reply, deps, {
      merchantId: conversation.merchantId,
      conversation,
      body: manualSendSchema.parse(request.body ?? {}),
      rawPayload: { replyMode: "manual", manual: true }
    });
  });

  app.post<{ Params: { apiPhone: string }; Body: ProactiveSendBody }>("/api/merchant/a2c/accounts/:apiPhone/send", { preHandler: deps.merchantRoles }, async (request, reply) => {
    const merchantId = scopedMerchantId(request);
    const apiPhone = decodeURIComponent(request.params.apiPhone);
    const body = proactiveSendSchema.parse(request.body ?? {});
    const cfg = deps.repos.getMerchantConfig(merchantId);
    if (!a2cAccountAllowed(deps.repos, merchantId, cfg, apiPhone)) {
      return reply.code(404).send({ error: "a2c account not found or disabled" });
    }

    const conversation = deps.repos.getOrCreateConversation(body.customerPhone, apiPhone, body.nickname || "", merchantId, deps.repos.defaultCountryId(merchantId));
    deps.repos.upsertCustomerFromConversation(conversation);
    const result = await sendOutboundMessage(reply, deps, {
      merchantId,
      conversation,
      body,
      rawPayload: { replyMode: "manual", manual: true, proactive: true }
    });
    if (result && typeof result === "object" && "externalId" in result) {
      deps.repos.updateCustomerMemoryFromMessage(conversation, {
        intent: "unknown",
        content: result.content,
        direction: "outbound"
      });
    }
    return result;
  });
}

async function sendOutboundMessage(
  reply: FastifyReply,
  deps: MerchantOutboundMessageRoutesDeps,
  input: {
    merchantId: string;
    conversation: NonNullable<ReturnType<Repositories["getConversation"]>>;
    body: ManualSendBody;
    rawPayload: Record<string, unknown>;
  }
) {
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
      rawPayload: {
        ...input.rawPayload,
        originalContent: translation?.originalText,
        translatedContent: translation?.translatedText,
        targetLanguage: translation?.targetLanguage,
        translationStatus: translation?.status,
        translationError: translation?.error || "",
        operatorTranslatedContent: operatorTranslation?.translatedText,
        operatorTranslationTargetLanguage: operatorTranslation?.targetLanguage,
        operatorTranslationStatus: operatorTranslation?.status,
        operatorTranslationError: operatorTranslation?.error || ""
      }
    });
    return { externalId, conversation: input.conversation, content, translation };
  } catch (error) {
    return reply.code(502).send({ error: error instanceof Error ? error.message : "send failed" });
  }
}

function a2cAccountAllowed(repos: Repositories, merchantId: string, config: MerchantConfigRecord, apiPhone: string): boolean {
  const enabledAccount = repos.listMerchantA2CAccounts({ merchantId, enabled: true }).some((account) => account.apiPhone === apiPhone);
  if (enabledAccount) return true;
  return config.a2cAccountPhone.split(",").map((item) => item.trim()).filter(Boolean).includes(apiPhone);
}
