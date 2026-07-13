import type { FastifyInstance } from "fastify";
import { requireUser, requestUser } from "../auth.js";
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

  app.get<{ Params: { customerKey: string }; Querystring: { merchantId?: string } }>("/api/admin/customers/:customerKey", { preHandler: deps.adminOnly }, async (request, reply) => {
    const row = deps.repos.getCustomer(request.query.merchantId || "default", decodeURIComponent(request.params.customerKey));
    return row ? row : reply.code(404).send({ error: "customer not found" });
  });

  app.patch<{ Params: { customerKey: string }; Querystring: { merchantId?: string }; Body: Record<string, unknown> }>("/api/admin/customers/:customerKey", { preHandler: deps.adminOnly }, async (request, reply) => {
    const row = deps.repos.patchCustomer(request.query.merchantId || "default", decodeURIComponent(request.params.customerKey), request.body ?? {});
    return row ? row : reply.code(404).send({ error: "customer not found" });
  });

  app.get<{ Params: { customerKey: string }; Querystring: { merchantId?: string } }>("/api/admin/customers/:customerKey/balance-transactions", { preHandler: deps.adminOnly }, async (request, reply) => {
    const merchantId = request.query.merchantId || "default";
    const customerKey = decodeURIComponent(request.params.customerKey);
    if (!deps.repos.getCustomer(merchantId, customerKey)) return reply.code(404).send({ error: "customer not found" });
    return { rows: deps.repos.listCustomerBalanceTransactions(merchantId, customerKey) };
  });

  app.post<{ Params: { customerKey: string }; Querystring: { merchantId?: string }; Body: { amount?: number; note?: string } }>("/api/admin/customers/:customerKey/balance-transactions", { preHandler: deps.adminOnly }, async (request, reply) => {
    const merchantId = request.query.merchantId || "default";
    const row = deps.repos.createCustomerBalanceTransaction(merchantId, decodeURIComponent(request.params.customerKey), Number(request.body?.amount), String(request.body?.note || ""), requestUser(request).name);
    return row ? row : reply.code(400).send({ error: "客户不存在或充值金额无效" });
  });

  app.patch<{ Params: { transactionId: string }; Querystring: { merchantId?: string }; Body: { amount?: number; note?: string } }>("/api/admin/customer-balance-transactions/:transactionId", { preHandler: deps.adminOnly }, async (request, reply) => {
    const row = deps.repos.patchCustomerBalanceTransaction(Number(request.params.transactionId), request.query.merchantId || "default", { amount: request.body?.amount === undefined ? undefined : Number(request.body.amount), note: request.body?.note });
    return row ? row : reply.code(404).send({ error: "充值记录不存在或金额无效" });
  });

  app.delete<{ Params: { transactionId: string }; Querystring: { merchantId?: string } }>("/api/admin/customer-balance-transactions/:transactionId", { preHandler: deps.adminOnly }, async (request, reply) => {
    const deleted = deps.repos.deleteCustomerBalanceTransaction(Number(request.params.transactionId), request.query.merchantId || "default");
    return deleted ? { ok: true } : reply.code(404).send({ error: "充值记录不存在" });
  });

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
