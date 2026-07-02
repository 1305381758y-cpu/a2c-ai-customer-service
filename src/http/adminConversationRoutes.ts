import type { FastifyInstance } from "fastify";
import { requireUser } from "../auth.js";
import type { AppConfig } from "../config.js";
import type { Repositories } from "../repositories.js";
import { generateConversationReview } from "../services/conversationReview.js";
import { appConfigForMerchant } from "../services/runtimeConfig.js";
import { normalizeConversationExportQuery, sendConversationExport, type ConversationExportQuery } from "./conversationExport.js";

type AdminConversationRoutesDeps = {
  config: AppConfig;
  repos: Repositories;
  adminOnly: ReturnType<typeof requireUser>;
};

export function registerAdminConversationRoutes(app: FastifyInstance, deps: AdminConversationRoutesDeps): void {
  app.get<{ Querystring: { merchantId?: string; countryId?: string; status?: string; handoffStatus?: string; language?: string; a2cAccountPhone?: string; customerPhone?: string; limit?: string } }>("/api/admin/conversations", { preHandler: deps.adminOnly }, async (request) => ({
    rows: deps.repos.listConversations({
      merchantId: request.query.merchantId,
      countryId: request.query.countryId,
      status: request.query.status,
      handoffStatus: request.query.handoffStatus,
      language: request.query.language,
      a2cAccountPhone: request.query.a2cAccountPhone,
      customerPhone: request.query.customerPhone,
      limit: request.query.limit ? Number(request.query.limit) : undefined
    })
  }));

  app.get<{ Querystring: ConversationExportQuery }>("/api/admin/conversations/export", { preHandler: deps.adminOnly }, async (request, reply) => {
    const rows = deps.repos.exportConversationMessages(normalizeConversationExportQuery(request.query));
    return sendConversationExport(reply, rows, request.query.format, "admin-conversations");
  });

  app.get<{ Querystring: { merchantId?: string; countryId?: string; status?: string; language?: string; limit?: string } }>("/api/admin/customers", { preHandler: deps.adminOnly }, async (request) => ({
    rows: deps.repos.listCustomers({
      merchantId: request.query.merchantId,
      countryId: request.query.countryId,
      status: request.query.status,
      language: request.query.language,
      limit: request.query.limit ? Number(request.query.limit) : undefined
    })
  }));

  app.get<{ Querystring: { merchantId?: string; countryId?: string; status?: string; suggestedIntent?: string; limit?: string } }>("/api/admin/intent-learning", { preHandler: deps.adminOnly }, async (request) => ({
    rows: deps.repos.listIntentLearningEvents({
      merchantId: request.query.merchantId,
      countryId: request.query.countryId,
      status: request.query.status,
      suggestedIntent: request.query.suggestedIntent,
      limit: request.query.limit ? Number(request.query.limit) : undefined
    })
  }));

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/intent-learning/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "invalid id" });
    const row = deps.repos.patchIntentLearningEvent(id, request.body ?? {});
    if (!row) return reply.code(404).send({ error: "intent learning event not found" });
    return row;
  });

  app.delete<{ Params: { customerKey: string }; Querystring: { merchantId?: string } }>("/api/admin/customers/:customerKey", { preHandler: deps.adminOnly }, async (request, reply) => {
    const merchantId = request.query.merchantId || "default";
    const result = deps.repos.deleteCustomer(merchantId, decodeURIComponent(request.params.customerKey));
    if (!result.deleted) return reply.code(404).send({ error: "customer not found" });
    return { ok: true, ...result };
  });

  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>("/api/admin/conversations/:id/messages", { preHandler: deps.adminOnly }, async (request, reply) => {
    const conversation = deps.repos.getConversation(request.params.id);
    if (!conversation) return reply.code(404).send({ error: "conversation not found" });
    return { conversation, rows: deps.repos.listConversationMessages(request.params.id, request.query.limit ? Number(request.query.limit) : 50) };
  });

  app.delete<{ Params: { id: string } }>("/api/admin/conversations/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    const ok = deps.repos.deleteConversation(request.params.id);
    if (!ok) return reply.code(404).send({ error: "conversation not found" });
    return { ok: true };
  });

  app.post<{ Params: { id: string }; Body: { pinned?: boolean } }>("/api/admin/conversations/:id/pin", { preHandler: deps.adminOnly }, async (request, reply) => {
    const conversation = deps.repos.getConversation(request.params.id);
    if (!conversation) return reply.code(404).send({ error: "conversation not found" });
    const row = deps.repos.pinConversation(request.params.id, conversation.merchantId, Boolean(request.body?.pinned));
    if (!row) return reply.code(404).send({ error: "conversation not found" });
    return row;
  });

  app.get<{ Params: { id: string } }>("/api/admin/conversations/:id/memory", { preHandler: deps.adminOnly }, async (request, reply) => {
    const memory = deps.repos.getCustomerMemoryByConversation(request.params.id);
    if (!memory) return reply.code(404).send({ error: "memory not found" });
    return memory;
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/conversations/:id/memory", { preHandler: deps.adminOnly }, async (request, reply) => {
    const memory = deps.repos.patchCustomerMemory(request.params.id, undefined, request.body ?? {});
    if (!memory) return reply.code(404).send({ error: "memory not found" });
    return memory;
  });

  app.get<{ Params: { id: string } }>("/api/admin/conversations/:id/review", { preHandler: deps.adminOnly }, async (request, reply) => {
    const conversation = deps.repos.getConversation(request.params.id);
    if (!conversation) return reply.code(404).send({ error: "conversation not found" });
    return deps.repos.getConversationReview(request.params.id) ?? { review: null, items: [] };
  });

  app.post<{ Params: { id: string } }>("/api/admin/conversations/:id/review", { preHandler: deps.adminOnly }, async (request, reply) => {
    const conversation = deps.repos.getConversation(request.params.id);
    if (!conversation) return reply.code(404).send({ error: "conversation not found" });
    const cfg = deps.repos.getMerchantConfig(conversation.merchantId);
    const runtimeConfig = appConfigForMerchant(deps.config, cfg, deps.repos.getMerchantCountry(conversation.countryId));
    return generateConversationReview(deps.repos, runtimeConfig, conversation.id);
  });
}
