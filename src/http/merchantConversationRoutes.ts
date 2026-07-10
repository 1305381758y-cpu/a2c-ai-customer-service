import type { FastifyInstance } from "fastify";
import { requireUser } from "../auth.js";
import type { AppConfig } from "../config.js";
import type { Repositories } from "../repositories.js";
import {
  applyMerchantConversationReviewItems,
  deleteMerchantConversation,
  generateMerchantConversationReview,
  getMerchantConversationMemory,
  getMerchantConversationMessages,
  getMerchantConversationReview,
  getMerchantUnreadSummary,
  listMerchantConversations,
  markAllMerchantConversationsRead,
  markMerchantConversationRead,
  patchMerchantConversationMemory,
  pinMerchantConversation,
  updateMerchantHandoffStatus
} from "../services/merchantConversations.js";
import { listConversationExportRows, sendConversationExport, type ConversationExportQuery } from "./conversationExport.js";
import { registerMerchantOutboundMessageRoutes } from "./merchantOutboundMessageRoutes.js";
import { sendResult } from "./routeResponses.js";
import { scopedMerchantId } from "./routeHelpers.js";

type MerchantConversationRoutesDeps = {
  config: AppConfig;
  repos: Repositories;
  merchantRoles: ReturnType<typeof requireUser>;
  merchantAdmins: ReturnType<typeof requireUser>;
};

export function registerMerchantConversationRoutes(app: FastifyInstance, deps: MerchantConversationRoutesDeps): void {
  registerMerchantOutboundMessageRoutes(app, deps);

  app.get<{ Querystring: { countryId?: string; status?: string; handoffStatus?: string; language?: string; a2cAccountPhone?: string; customerPhone?: string; startAt?: string; endAt?: string; timeZone?: string; limit?: string } }>("/api/merchant/conversations", { preHandler: deps.merchantRoles }, async (request) => ({
    ...listMerchantConversations(deps.repos, scopedMerchantId(request), request.query)
  }));

  app.get<{ Querystring: ConversationExportQuery }>("/api/merchant/conversations/export", { preHandler: deps.merchantRoles }, async (request, reply) => {
    const rows = listConversationExportRows(deps.repos, request.query, { merchantId: scopedMerchantId(request) });
    return sendConversationExport(reply, rows, request.query.format, "merchant-conversations");
  });

  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>("/api/merchant/conversations/:id/messages", { preHandler: deps.merchantRoles }, async (request, reply) => {
    return sendResult(reply, getMerchantConversationMessages(deps.repos, scopedMerchantId(request), request.params.id, request.query.limit));
  });

  app.delete<{ Params: { id: string } }>("/api/merchant/conversations/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    return sendResult(reply, deleteMerchantConversation(deps.repos, scopedMerchantId(request), request.params.id));
  });

  app.get("/api/merchant/conversations/unread-summary", { preHandler: deps.merchantRoles }, async (request) => ({
    ...getMerchantUnreadSummary(deps.repos, scopedMerchantId(request))
  }));

  app.post<{ Params: { id: string } }>("/api/merchant/conversations/:id/read", { preHandler: deps.merchantRoles }, async (request, reply) => {
    return sendResult(reply, markMerchantConversationRead(deps.repos, scopedMerchantId(request), request.params.id));
  });

  app.post<{ Body: { a2cAccountPhone?: string } }>("/api/merchant/conversations/read-all", { preHandler: deps.merchantRoles }, async (request) => {
    return markAllMerchantConversationsRead(deps.repos, scopedMerchantId(request), request.body ?? {});
  });

  app.post<{ Params: { id: string }; Body: { pinned?: boolean } }>("/api/merchant/conversations/:id/pin", { preHandler: deps.merchantRoles }, async (request, reply) => {
    return sendResult(reply, pinMerchantConversation(deps.repos, scopedMerchantId(request), request.params.id, Boolean(request.body?.pinned)));
  });

  app.get<{ Params: { id: string } }>("/api/merchant/conversations/:id/memory", { preHandler: deps.merchantRoles }, async (request, reply) => {
    return sendResult(reply, getMerchantConversationMemory(deps.repos, scopedMerchantId(request), request.params.id));
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/conversations/:id/memory", { preHandler: deps.merchantRoles }, async (request, reply) => {
    return sendResult(reply, patchMerchantConversationMemory(deps.repos, scopedMerchantId(request), request.params.id, request.body ?? {}));
  });

  app.get<{ Params: { id: string } }>("/api/merchant/conversations/:id/review", { preHandler: deps.merchantRoles }, async (request, reply) => {
    return sendResult(reply, getMerchantConversationReview(deps.repos, scopedMerchantId(request), request.params.id));
  });

  app.post<{ Params: { id: string } }>("/api/merchant/conversations/:id/review", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    return sendResult(reply, await generateMerchantConversationReview(deps.repos, deps.config, scopedMerchantId(request), request.params.id));
  });

  app.post<{ Params: { id: string }; Body: { itemId?: number; itemIds?: number[] } }>("/api/merchant/conversations/:id/review/apply", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    return sendResult(reply, applyMerchantConversationReviewItems(deps.repos, scopedMerchantId(request), request.params.id, request.body ?? {}));
  });

  app.patch<{ Params: { conversationId: string }; Body: { handoffStatus?: "pending" | "processing" | "done" } }>("/api/merchant/handoffs/:conversationId", { preHandler: deps.merchantRoles }, async (request, reply) => {
    return sendResult(reply, await updateMerchantHandoffStatus(deps.repos, deps.config, scopedMerchantId(request), request.params.conversationId, request.body?.handoffStatus, (error) => app.log.warn({ err: error }, "conversation review generation failed")));
  });

}
