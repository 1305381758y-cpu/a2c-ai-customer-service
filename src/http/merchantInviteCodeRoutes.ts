import type { FastifyInstance } from "fastify";
import type { requireUser } from "../auth.js";
import type { Repositories } from "../repositories.js";
import {
  createInviteCode,
  deleteInviteCode,
  importInviteCodes,
  listInviteCodes,
  patchInviteCode
} from "../services/inviteCodes.js";
import { sendResult } from "./routeResponses.js";
import { scopedMerchantId } from "./routeHelpers.js";

type MerchantInviteCodeRoutesDeps = {
  repos: Repositories;
  adminOnly: ReturnType<typeof requireUser>;
  merchantRoles: ReturnType<typeof requireUser>;
  merchantAdmins: ReturnType<typeof requireUser>;
};

export function registerMerchantInviteCodeRoutes(app: FastifyInstance, deps: MerchantInviteCodeRoutesDeps): void {
  registerAdminInviteCodeRoutes(app, deps);
  registerMerchantOwnInviteCodeRoutes(app, deps);
}

function registerAdminInviteCodeRoutes(app: FastifyInstance, deps: MerchantInviteCodeRoutesDeps): void {
  app.get<{ Params: { id: string } }>("/api/admin/a2c/accounts/:id/invite-codes", { preHandler: deps.adminOnly }, async (request, reply) => sendResult(reply, listInviteCodes(deps.repos, request.params.id)));
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/a2c/accounts/:id/invite-codes", { preHandler: deps.adminOnly }, async (request, reply) => sendResult(reply, createInviteCode(deps.repos, request.params.id, request.body ?? {})));
  app.post<{ Params: { id: string }; Body: { codes?: string; registerUrl?: string } }>("/api/admin/a2c/accounts/:id/invite-codes/import", { preHandler: deps.adminOnly }, async (request, reply) => sendResult(reply, importInviteCodes(deps.repos, request.params.id, request.body ?? {})));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/invite-codes/:id", { preHandler: deps.adminOnly }, async (request, reply) => sendResult(reply, patchInviteCode(deps.repos, request.params.id, request.body ?? {})));
  app.delete<{ Params: { id: string } }>("/api/admin/invite-codes/:id", { preHandler: deps.adminOnly }, async (request, reply) => sendResult(reply, deleteInviteCode(deps.repos, request.params.id)));
}

function registerMerchantOwnInviteCodeRoutes(app: FastifyInstance, deps: MerchantInviteCodeRoutesDeps): void {
  app.get<{ Params: { id: string } }>("/api/merchant/a2c/accounts/:id/invite-codes", { preHandler: deps.merchantRoles }, async (request, reply) => sendResult(reply, listInviteCodes(deps.repos, request.params.id, scopedMerchantId(request))));
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/a2c/accounts/:id/invite-codes", { preHandler: deps.merchantAdmins }, async (request, reply) => sendResult(reply, createInviteCode(deps.repos, request.params.id, request.body ?? {}, scopedMerchantId(request))));
  app.post<{ Params: { id: string }; Body: { codes?: string; registerUrl?: string } }>("/api/merchant/a2c/accounts/:id/invite-codes/import", { preHandler: deps.merchantAdmins }, async (request, reply) => sendResult(reply, importInviteCodes(deps.repos, request.params.id, request.body ?? {}, scopedMerchantId(request))));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/invite-codes/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => sendResult(reply, patchInviteCode(deps.repos, request.params.id, request.body ?? {}, scopedMerchantId(request))));
  app.delete<{ Params: { id: string } }>("/api/merchant/invite-codes/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => sendResult(reply, deleteInviteCode(deps.repos, request.params.id, scopedMerchantId(request))));
}
