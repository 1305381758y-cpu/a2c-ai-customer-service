import type { FastifyInstance } from "fastify";
import { requireUser } from "../auth.js";
import type { AppConfig } from "../config.js";
import type { Repositories } from "../repositories.js";
import { generateConversationReview } from "../services/conversationReview.js";
import { appConfigForMerchant } from "../services/runtimeConfig.js";
import { normalizeConversationExportQuery, sendConversationExport, type ConversationExportQuery } from "./conversationExport.js";
import { registerMerchantOutboundMessageRoutes } from "./merchantOutboundMessageRoutes.js";
import { scopedMerchantId } from "./routeHelpers.js";

type MerchantConversationRoutesDeps = {
  config: AppConfig;
  repos: Repositories;
  merchantRoles: ReturnType<typeof requireUser>;
  merchantAdmins: ReturnType<typeof requireUser>;
};

export function registerMerchantConversationRoutes(app: FastifyInstance, deps: MerchantConversationRoutesDeps): void {
  registerMerchantOutboundMessageRoutes(app, deps);

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

}
