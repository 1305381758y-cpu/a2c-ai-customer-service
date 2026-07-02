import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { A2CClient } from "../clients/a2c.js";
import { requireUser } from "../auth.js";
import type { AppConfig } from "../config.js";
import type { MerchantConfigRecord, Repositories } from "../repositories.js";
import type { ConversationEngine } from "../services/conversationEngine.js";
import { generateConversationReview } from "../services/conversationReview.js";
import { appConfigForMerchant } from "../services/runtimeConfig.js";
import { translateForCustomer, translateForOperator } from "../services/translation.js";
import { normalizeConversationExportQuery, sendConversationExport, type ConversationExportQuery } from "./conversationExport.js";
import { scopedMerchantId } from "./routeHelpers.js";

type MerchantConversationRoutesDeps = {
  config: AppConfig;
  repos: Repositories;
  conversationEngine: ConversationEngine;
  merchantRoles: ReturnType<typeof requireUser>;
  merchantAdmins: ReturnType<typeof requireUser>;
};

const proactiveSendSchema = z.object({
  customerPhone: z.string().min(1),
  nickname: z.string().optional(),
  type: z.enum(["text", "image", "video", "audio", "document"]).optional(),
  content: z.string().optional(),
  url: z.string().optional(),
  caption: z.string().optional(),
  fileName: z.string().optional()
});

type ProactiveSendBody = z.infer<typeof proactiveSendSchema>;

export function registerMerchantConversationRoutes(app: FastifyInstance, deps: MerchantConversationRoutesDeps): void {
  app.get<{ Querystring: { countryId?: string; status?: string; handoffStatus?: string; language?: string; a2cAccountPhone?: string; customerPhone?: string; limit?: string } }>("/api/merchant/conversations", { preHandler: deps.merchantRoles }, async (request) => ({
    rows: deps.repos.listConversations({
      merchantId: scopedMerchantId(request),
      countryId: request.query.countryId,
      status: request.query.status,
      handoffStatus: request.query.handoffStatus,
      language: request.query.language,
      a2cAccountPhone: request.query.a2cAccountPhone,
      customerPhone: request.query.customerPhone,
      limit: request.query.limit ? Number(request.query.limit) : undefined
    })
  }));

  app.get<{ Querystring: ConversationExportQuery }>("/api/merchant/conversations/export", { preHandler: deps.merchantRoles }, async (request, reply) => {
    const rows = deps.repos.exportConversationMessages({
      ...normalizeConversationExportQuery(request.query),
      merchantId: scopedMerchantId(request)
    });
    return sendConversationExport(reply, rows, request.query.format, "merchant-conversations");
  });

  app.get<{ Querystring: { countryId?: string; status?: string; language?: string; limit?: string } }>("/api/merchant/customers", { preHandler: deps.merchantRoles }, async (request) => ({
    rows: deps.repos.listCustomers({
      merchantId: scopedMerchantId(request),
      countryId: request.query.countryId,
      status: request.query.status,
      language: request.query.language,
      limit: request.query.limit ? Number(request.query.limit) : undefined
    })
  }));

  app.get<{ Querystring: { countryId?: string; status?: string; suggestedIntent?: string; limit?: string } }>("/api/merchant/intent-learning", { preHandler: deps.merchantRoles }, async (request) => ({
    rows: deps.repos.listIntentLearningEvents({
      merchantId: scopedMerchantId(request),
      countryId: request.query.countryId,
      status: request.query.status,
      suggestedIntent: request.query.suggestedIntent,
      limit: request.query.limit ? Number(request.query.limit) : undefined
    })
  }));

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/intent-learning/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "invalid id" });
    const row = deps.repos.patchIntentLearningEvent(id, request.body ?? {}, scopedMerchantId(request));
    if (!row) return reply.code(404).send({ error: "intent learning event not found" });
    return row;
  });

  app.delete<{ Params: { customerKey: string } }>("/api/merchant/customers/:customerKey", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    const result = deps.repos.deleteCustomer(scopedMerchantId(request), decodeURIComponent(request.params.customerKey));
    if (!result.deleted) return reply.code(404).send({ error: "customer not found" });
    return { ok: true, ...result };
  });

  app.post<{ Body: { customerPhone?: string; a2cAccountPhone?: string; nickname?: string; content?: string; msgType?: string; url?: string; caption?: string; fileName?: string } }>("/api/merchant/training-simulator/messages", { preHandler: deps.merchantRoles }, async (request, reply) => {
    const merchantId = scopedMerchantId(request);
    const body = z.object({
      customerPhone: z.string().trim().min(1).optional(),
      a2cAccountPhone: z.string().trim().min(1).optional(),
      nickname: z.string().trim().optional(),
      content: z.string().optional(),
      msgType: z.enum(["text", "image", "video", "audio", "document"]).optional(),
      url: z.string().optional(),
      caption: z.string().optional(),
      fileName: z.string().optional()
    }).parse(request.body ?? {});
    const config = deps.repos.getMerchantConfig(merchantId);
    const accounts = deps.repos.listMerchantA2CAccounts({ merchantId, enabled: true });
    const configuredAccount = config.a2cAccountPhone.split(",").map((item) => item.trim()).find(Boolean);
    const a2cAccountPhone = body.a2cAccountPhone || accounts[0]?.apiPhone || configuredAccount || "simulation-a2c";
    const customerPhone = body.customerPhone || `sim-customer-${Date.now()}`;
    const msgType = body.msgType || (body.url ? "image" : "text");
    const content = body.content || body.caption || "";
    if (msgType === "text" && !content.trim()) return reply.code(400).send({ error: "请输入客户消息" });
    if (msgType !== "text" && !body.url && !content.trim()) return reply.code(400).send({ error: "请输入媒体链接或说明" });
    const now = Math.floor(Date.now() / 1000);
    const messageId = `sim_in:${merchantId}:${customerPhone}:${Date.now()}:${randomUUID().slice(0, 8)}`;
    const result = await deps.conversationEngine.simulateInboundMessage({
      merchantId,
      payload: {
        id: `sim:${messageId}`,
        timestamp: now,
        type: "CUSTOMER_MESSAGE",
        data: {
          messageId,
          content,
          from: customerPhone,
          to: a2cAccountPhone,
          msgType,
          timestamp: now,
          nickname: body.nickname || "模拟客户",
          url: body.url,
          caption: body.caption,
          fileName: body.fileName
        }
      }
    });
    const conversation = result.conversationId ? deps.repos.getConversation(result.conversationId) : undefined;
    return {
      ...result,
      conversation,
      rows: result.conversationId ? deps.repos.listConversationMessages(result.conversationId, 80) : []
    };
  });

  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>("/api/merchant/conversations/:id/messages", { preHandler: deps.merchantRoles }, async (request, reply) => {
    const conversation = deps.repos.getConversation(request.params.id);
    if (!conversation || conversation.merchantId !== scopedMerchantId(request)) return reply.code(404).send({ error: "conversation not found" });
    return { conversation, rows: deps.repos.listConversationMessages(request.params.id, request.query.limit ? Number(request.query.limit) : 50) };
  });

  app.delete<{ Params: { id: string } }>("/api/merchant/conversations/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    const ok = deps.repos.deleteConversation(request.params.id, scopedMerchantId(request));
    if (!ok) return reply.code(404).send({ error: "conversation not found" });
    return { ok: true };
  });

  app.get("/api/merchant/conversations/unread-summary", { preHandler: deps.merchantRoles }, async (request) => ({
    rows: deps.repos.unreadSummary(scopedMerchantId(request))
  }));

  app.post<{ Params: { id: string } }>("/api/merchant/conversations/:id/read", { preHandler: deps.merchantRoles }, async (request, reply) => {
    const row = deps.repos.markConversationRead(request.params.id, scopedMerchantId(request));
    if (!row || row.merchantId !== scopedMerchantId(request)) return reply.code(404).send({ error: "conversation not found" });
    return row;
  });

  app.post<{ Body: { a2cAccountPhone?: string } }>("/api/merchant/conversations/read-all", { preHandler: deps.merchantRoles }, async (request) => {
    return deps.repos.markConversationsRead(scopedMerchantId(request), {
      a2cAccountPhone: String(request.body?.a2cAccountPhone || "").trim() || undefined
    });
  });

  app.post<{ Params: { id: string }; Body: { pinned?: boolean } }>("/api/merchant/conversations/:id/pin", { preHandler: deps.merchantRoles }, async (request, reply) => {
    const row = deps.repos.pinConversation(request.params.id, scopedMerchantId(request), Boolean(request.body?.pinned));
    if (!row || row.merchantId !== scopedMerchantId(request)) return reply.code(404).send({ error: "conversation not found" });
    return row;
  });

  app.get<{ Params: { id: string } }>("/api/merchant/conversations/:id/memory", { preHandler: deps.merchantRoles }, async (request, reply) => {
    const conversation = deps.repos.getConversation(request.params.id);
    if (!conversation || conversation.merchantId !== scopedMerchantId(request)) return reply.code(404).send({ error: "conversation not found" });
    const memory = deps.repos.getCustomerMemoryByConversation(request.params.id) ?? deps.repos.updateCustomerMemoryFromMessage(conversation, { intent: "unknown", content: "", direction: "inbound" });
    return memory;
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/conversations/:id/memory", { preHandler: deps.merchantRoles }, async (request, reply) => {
    const memory = deps.repos.patchCustomerMemory(request.params.id, scopedMerchantId(request), request.body ?? {});
    if (!memory) return reply.code(404).send({ error: "memory not found" });
    return memory;
  });

  app.get<{ Params: { id: string } }>("/api/merchant/conversations/:id/review", { preHandler: deps.merchantRoles }, async (request, reply) => {
    const conversation = deps.repos.getConversation(request.params.id);
    if (!conversation || conversation.merchantId !== scopedMerchantId(request)) return reply.code(404).send({ error: "conversation not found" });
    return deps.repos.getConversationReview(request.params.id, conversation.merchantId) ?? { review: null, items: [] };
  });

  app.post<{ Params: { id: string } }>("/api/merchant/conversations/:id/review", { preHandler: deps.merchantRoles }, async (request, reply) => {
    const conversation = deps.repos.getConversation(request.params.id);
    if (!conversation || conversation.merchantId !== scopedMerchantId(request)) return reply.code(404).send({ error: "conversation not found" });
    const cfg = deps.repos.getMerchantConfig(conversation.merchantId);
    const runtimeConfig = appConfigForMerchant(deps.config, cfg, deps.repos.getMerchantCountry(conversation.countryId));
    return generateConversationReview(deps.repos, runtimeConfig, conversation.id);
  });

  app.post<{ Params: { id: string }; Body: { itemId?: number; itemIds?: number[] } }>("/api/merchant/conversations/:id/review/apply", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    const conversation = deps.repos.getConversation(request.params.id);
    const merchantId = scopedMerchantId(request);
    if (!conversation || conversation.merchantId !== merchantId) return reply.code(404).send({ error: "conversation not found" });
    const itemIds = Array.isArray(request.body?.itemIds) ? request.body.itemIds : request.body?.itemId ? [request.body.itemId] : [];
    if (!itemIds.length) return reply.code(400).send({ error: "itemId required" });
    const rows = itemIds.map((id) => deps.repos.applyConversationReviewItem(Number(id), merchantId)).filter(Boolean);
    return { rows };
  });

  app.patch<{ Params: { conversationId: string }; Body: { handoffStatus?: "pending" | "processing" | "done" } }>("/api/merchant/handoffs/:conversationId", { preHandler: deps.merchantRoles }, async (request, reply) => {
    const status = request.body?.handoffStatus;
    if (status !== "pending" && status !== "processing" && status !== "done") return reply.code(400).send({ error: "invalid handoffStatus" });
    const row = deps.repos.updateHandoffStatus(request.params.conversationId, scopedMerchantId(request), status);
    if (!row) return reply.code(404).send({ error: "conversation not found" });
    if (status === "done") {
      const cfg = deps.repos.getMerchantConfig(row.merchantId);
      await generateConversationReview(deps.repos, appConfigForMerchant(deps.config, cfg, deps.repos.getMerchantCountry(row.countryId)), row.id).catch((error) => app.log.warn({ err: error }, "conversation review generation failed"));
    }
    return row;
  });

  app.post<{ Params: { id: string }; Body: { type?: "text" | "image" | "video" | "audio" | "document"; content?: string; url?: string; caption?: string; fileName?: string } }>("/api/merchant/conversations/:id/send", { preHandler: deps.merchantRoles }, async (request, reply) => {
    const conversation = deps.repos.getConversation(request.params.id);
    if (!conversation || conversation.merchantId !== scopedMerchantId(request)) return reply.code(404).send({ error: "conversation not found" });
    const cfg = deps.repos.getMerchantConfig(conversation.merchantId);
    const country = deps.repos.getMerchantCountry(conversation.countryId);
    const runtimeConfig = appConfigForMerchant(deps.config, cfg, country);
    const client = new A2CClient(runtimeConfig, deps.repos.a2cTokenStore(conversation.merchantId));
    const type = request.body?.type ?? "text";
    const translation = type === "text" ? await translateForCustomer(runtimeConfig, request.body?.content || "", conversation.language) : undefined;
    const outgoingContent = translation?.translatedText || request.body?.content;
    const operatorTranslation = type === "text" && outgoingContent ? await translateForOperator(runtimeConfig, outgoingContent, conversation.language) : undefined;
    try {
      const externalId = await client.sendMessage({
        to: conversation.customerPhone,
        senderPhoneNumber: conversation.a2cAccountPhone,
        type,
        content: outgoingContent,
        url: request.body?.url,
        caption: request.body?.caption,
        fileName: request.body?.fileName
      });
      deps.repos.insertMessage({
        conversationId: conversation.id,
        direction: "outbound",
        externalId,
        content: outgoingContent || request.body?.caption || request.body?.url || "",
        msgType: type,
        language: conversation.language,
        intent: "unknown",
        rawPayload: {
          replyMode: "manual",
          manual: true,
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
      return { externalId, translation };
    } catch (error) {
      return reply.code(502).send({ error: error instanceof Error ? error.message : "send failed" });
    }
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
    const country = deps.repos.getMerchantCountry(conversation.countryId);
    const runtimeConfig = appConfigForMerchant(deps.config, cfg, country);
    const client = new A2CClient(runtimeConfig, deps.repos.a2cTokenStore(merchantId));
    const type = body.type ?? "text";
    const translation = type === "text" ? await translateForCustomer(runtimeConfig, body.content || "", conversation.language) : undefined;
    const outgoingContent = translation?.translatedText || body.content;
    const operatorTranslation = type === "text" && outgoingContent ? await translateForOperator(runtimeConfig, outgoingContent, conversation.language) : undefined;
    try {
      const externalId = await client.sendMessage({
        to: conversation.customerPhone,
        senderPhoneNumber: conversation.a2cAccountPhone,
        type,
        content: outgoingContent,
        url: body.url,
        caption: body.caption,
        fileName: body.fileName
      });
      deps.repos.insertMessage({
        conversationId: conversation.id,
        direction: "outbound",
        externalId,
        content: outgoingContent || body.caption || body.url || "",
        msgType: type,
        language: conversation.language,
        intent: "unknown",
        rawPayload: {
          replyMode: "manual",
          manual: true,
          proactive: true,
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
      deps.repos.updateCustomerMemoryFromMessage(conversation, { intent: "unknown", content: outgoingContent || body.caption || body.url || "", direction: "outbound" });
      return { externalId, conversation, translation };
    } catch (error) {
      return reply.code(502).send({ error: error instanceof Error ? error.message : "send failed" });
    }
  });
}

function a2cAccountAllowed(repos: Repositories, merchantId: string, config: MerchantConfigRecord, apiPhone: string): boolean {
  const enabledAccount = repos.listMerchantA2CAccounts({ merchantId, enabled: true }).some((account) => account.apiPhone === apiPhone);
  if (enabledAccount) return true;
  return config.a2cAccountPhone.split(",").map((item) => item.trim()).filter(Boolean).includes(apiPhone);
}
