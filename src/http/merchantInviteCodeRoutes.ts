import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { requireUser } from "../auth.js";
import type { Repositories } from "../repositories.js";
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
  app.get<{ Params: { id: string } }>("/api/admin/a2c/accounts/:id/invite-codes", { preHandler: deps.adminOnly }, async (request, reply) => listInviteCodes(request, reply, deps.repos));
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/a2c/accounts/:id/invite-codes", { preHandler: deps.adminOnly }, async (request, reply) => createInviteCode(request, reply, deps.repos));
  app.post<{ Params: { id: string }; Body: { codes?: string; registerUrl?: string } }>("/api/admin/a2c/accounts/:id/invite-codes/import", { preHandler: deps.adminOnly }, async (request, reply) => importInviteCodes(request, reply, deps.repos));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/invite-codes/:id", { preHandler: deps.adminOnly }, async (request, reply) => patchInviteCode(request, reply, deps.repos));
  app.delete<{ Params: { id: string } }>("/api/admin/invite-codes/:id", { preHandler: deps.adminOnly }, async (request, reply) => deleteInviteCode(request, reply, deps.repos));
}

function registerMerchantOwnInviteCodeRoutes(app: FastifyInstance, deps: MerchantInviteCodeRoutesDeps): void {
  app.get<{ Params: { id: string } }>("/api/merchant/a2c/accounts/:id/invite-codes", { preHandler: deps.merchantRoles }, async (request, reply) => listInviteCodes(request, reply, deps.repos, scopedMerchantId(request)));
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/a2c/accounts/:id/invite-codes", { preHandler: deps.merchantAdmins }, async (request, reply) => createInviteCode(request, reply, deps.repos, scopedMerchantId(request)));
  app.post<{ Params: { id: string }; Body: { codes?: string; registerUrl?: string } }>("/api/merchant/a2c/accounts/:id/invite-codes/import", { preHandler: deps.merchantAdmins }, async (request, reply) => importInviteCodes(request, reply, deps.repos, scopedMerchantId(request)));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/invite-codes/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => patchInviteCode(request, reply, deps.repos, scopedMerchantId(request)));
  app.delete<{ Params: { id: string } }>("/api/merchant/invite-codes/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => deleteInviteCode(request, reply, deps.repos, scopedMerchantId(request)));
}

function accountIdParam(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const id = Number(request.params.id);
  if (!Number.isInteger(id)) {
    reply.code(400).send({ error: "invalid id" });
    return undefined;
  }
  return id;
}

function listInviteCodes(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply, repos: Repositories, merchantId?: string) {
  const id = accountIdParam(request, reply);
  if (id === undefined) return;
  return { rows: repos.listInviteCodesForA2CAccount(id, merchantId) };
}

function createInviteCode(request: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>, reply: FastifyReply, repos: Repositories, merchantId?: string) {
  const id = accountIdParam(request, reply);
  if (id === undefined) return;
  try {
    return repos.createInviteCodeForA2CAccount(id, request.body ?? {}, merchantId);
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "invalid invite code" });
  }
}

function importInviteCodes(request: FastifyRequest<{ Params: { id: string }; Body: { codes?: string; registerUrl?: string } }>, reply: FastifyReply, repos: Repositories, merchantId?: string) {
  const id = accountIdParam(request, reply);
  if (id === undefined) return;
  try {
    return repos.importInviteCodesForA2CAccount(id, request.body ?? {}, merchantId);
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "invalid invite codes" });
  }
}

function patchInviteCode(request: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>, reply: FastifyReply, repos: Repositories, merchantId?: string) {
  const id = accountIdParam(request, reply);
  if (id === undefined) return;
  const row = repos.patchInviteCode(id, request.body ?? {}, merchantId);
  if (!row) return reply.code(404).send({ error: "invite code not found" });
  return row;
}

function deleteInviteCode(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply, repos: Repositories, merchantId?: string) {
  const id = accountIdParam(request, reply);
  if (id === undefined) return;
  const ok = repos.deleteInviteCode(id, merchantId);
  if (!ok) return reply.code(404).send({ error: "invite code not found" });
  return { ok: true };
}
