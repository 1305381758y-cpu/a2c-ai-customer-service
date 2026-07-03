import type { FastifyInstance } from "fastify";
import { requireUser } from "../auth.js";
import type { AppConfig } from "../config.js";
import type { Repositories } from "../repositories.js";
import {
  deleteAdminConversation,
  deleteAdminCustomer,
  generateAdminConversationReview,
  getAdminConversationMemory,
  getAdminConversationMessages,
  getAdminConversationReview,
  listAdminConversations,
  listAdminCustomers,
  listAdminIntentLearningEvents,
  patchAdminConversationMemory,
  patchAdminIntentLearningEvent,
  pinAdminConversation,
  type AdminConversationListQuery,
  type AdminCustomerListQuery,
  type AdminIntentLearningListQuery
} from "../services/adminConversations.js";
import { listConversationExportRows, sendConversationExport, type ConversationExportQuery } from "./conversationExport.js";
import { sendResult } from "./routeResponses.js";

type AdminConversationRoutesDeps = {
  config: AppConfig;
  repos: Repositories;
  adminOnly: ReturnType<typeof requireUser>;
};

export function registerAdminConversationRoutes(app: FastifyInstance, deps: AdminConversationRoutesDeps): void {
  app.get<{ Querystring: AdminConversationListQuery }>("/api/admin/conversations", { preHandler: deps.adminOnly }, async (request) =>
    listAdminConversations(deps.repos, request.query)
  );

  app.get<{ Querystring: ConversationExportQuery }>("/api/admin/conversations/export", { preHandler: deps.adminOnly }, async (request, reply) => {
    const rows = listConversationExportRows(deps.repos, request.query);
    return sendConversationExport(reply, rows, request.query.format, "admin-conversations");
  });

  app.get<{ Querystring: AdminCustomerListQuery }>("/api/admin/customers", { preHandler: deps.adminOnly }, async (request) =>
    listAdminCustomers(deps.repos, request.query)
  );

  app.get<{ Querystring: AdminIntentLearningListQuery }>("/api/admin/intent-learning", { preHandler: deps.adminOnly }, async (request) =>
    listAdminIntentLearningEvents(deps.repos, request.query)
  );

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/intent-learning/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    return sendResult(reply, patchAdminIntentLearningEvent(deps.repos, request.params.id, request.body ?? {}));
  });

  app.delete<{ Params: { customerKey: string }; Querystring: { merchantId?: string } }>("/api/admin/customers/:customerKey", { preHandler: deps.adminOnly }, async (request, reply) => {
    return sendResult(reply, deleteAdminCustomer(deps.repos, request.params.customerKey, request.query.merchantId));
  });

  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>("/api/admin/conversations/:id/messages", { preHandler: deps.adminOnly }, async (request, reply) => {
    return sendResult(reply, getAdminConversationMessages(deps.repos, request.params.id, request.query.limit));
  });

  app.delete<{ Params: { id: string } }>("/api/admin/conversations/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    return sendResult(reply, deleteAdminConversation(deps.repos, request.params.id));
  });

  app.post<{ Params: { id: string }; Body: { pinned?: boolean } }>("/api/admin/conversations/:id/pin", { preHandler: deps.adminOnly }, async (request, reply) => {
    return sendResult(reply, pinAdminConversation(deps.repos, request.params.id, Boolean(request.body?.pinned)));
  });

  app.get<{ Params: { id: string } }>("/api/admin/conversations/:id/memory", { preHandler: deps.adminOnly }, async (request, reply) => {
    return sendResult(reply, getAdminConversationMemory(deps.repos, request.params.id));
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/conversations/:id/memory", { preHandler: deps.adminOnly }, async (request, reply) => {
    return sendResult(reply, patchAdminConversationMemory(deps.repos, request.params.id, request.body ?? {}));
  });

  app.get<{ Params: { id: string } }>("/api/admin/conversations/:id/review", { preHandler: deps.adminOnly }, async (request, reply) => {
    return sendResult(reply, getAdminConversationReview(deps.repos, request.params.id));
  });

  app.post<{ Params: { id: string } }>("/api/admin/conversations/:id/review", { preHandler: deps.adminOnly }, async (request, reply) => {
    return sendResult(reply, await generateAdminConversationReview(deps.repos, deps.config, request.params.id));
  });
}
