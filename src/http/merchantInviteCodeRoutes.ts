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
  app.post("/api/admin/a2c/accounts/:id/invite-codes", { preHandler: deps.adminOnly }, async (_request, reply) => reply.code(403).send({ error: "邀请码请在商户端管理" }));
  app.post("/api/admin/a2c/accounts/:id/invite-codes/import", { preHandler: deps.adminOnly }, async (_request, reply) => reply.code(403).send({ error: "邀请码请在商户端管理" }));
  app.patch("/api/admin/invite-codes/:id", { preHandler: deps.adminOnly }, async (_request, reply) => reply.code(403).send({ error: "邀请码请在商户端管理" }));
  app.delete("/api/admin/invite-codes/:id", { preHandler: deps.adminOnly }, async (_request, reply) => reply.code(403).send({ error: "邀请码请在商户端管理" }));
}

function registerMerchantOwnInviteCodeRoutes(app: FastifyInstance, deps: MerchantInviteCodeRoutesDeps): void {
  app.get<{ Params: { id: string } }>("/api/merchant/a2c/accounts/:id/invite-codes", { preHandler: deps.merchantRoles }, async (request, reply) => sendResult(reply, listInviteCodes(deps.repos, request.params.id, scopedMerchantId(request))));
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/a2c/accounts/:id/invite-codes", { preHandler: deps.merchantAdmins }, async (request, reply) => sendResult(reply, createInviteCode(deps.repos, request.params.id, request.body ?? {}, scopedMerchantId(request))));
  app.post<{ Params: { id: string }; Body: { codes?: string; registerUrl?: string } }>("/api/merchant/a2c/accounts/:id/invite-codes/import", { preHandler: deps.merchantAdmins }, async (request, reply) => sendResult(reply, importInviteCodes(deps.repos, request.params.id, request.body ?? {}, scopedMerchantId(request))));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/invite-codes/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => sendResult(reply, patchInviteCode(deps.repos, request.params.id, request.body ?? {}, scopedMerchantId(request))));
  app.delete<{ Params: { id: string } }>("/api/merchant/invite-codes/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => sendResult(reply, deleteInviteCode(deps.repos, request.params.id, scopedMerchantId(request))));
}
