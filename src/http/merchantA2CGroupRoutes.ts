import type { FastifyInstance, FastifyReply } from "fastify";
import type { requireUser } from "../auth.js";
import type { Repositories } from "../repositories.js";
import { scopedMerchantId } from "./routeHelpers.js";

type Deps = {
  repos: Repositories;
  adminOnly: ReturnType<typeof requireUser>;
  merchantRoles: ReturnType<typeof requireUser>;
  merchantAdmins: ReturnType<typeof requireUser>;
};

export function registerMerchantA2CGroupRoutes(app: FastifyInstance, deps: Deps): void {
  app.get<{ Params: { id: string } }>("/api/admin/merchants/:id/a2c/account-groups", { preHandler: deps.adminOnly }, async (request) => ({ rows: deps.repos.listA2CAccountGroups(request.params.id) }));

  app.get("/api/merchant/a2c/account-groups", { preHandler: deps.merchantRoles }, async (request) => ({ rows: deps.repos.listA2CAccountGroups(scopedMerchantId(request)) }));
  app.post<{ Body: Record<string, unknown> }>("/api/merchant/a2c/account-groups", { preHandler: deps.merchantAdmins }, async (request, reply) => handle(reply, () => deps.repos.createA2CAccountGroup(scopedMerchantId(request), request.body ?? {})));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/a2c/account-groups/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => handleExisting(reply, () => deps.repos.patchA2CAccountGroup(parseId(request.params.id), scopedMerchantId(request), request.body ?? {}), "客服分组不存在"));
  app.delete<{ Params: { id: string } }>("/api/merchant/a2c/account-groups/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => handleExisting(reply, () => deps.repos.deleteA2CAccountGroup(parseId(request.params.id), scopedMerchantId(request)) ? { ok: true } : undefined, "客服分组不存在"));
  app.put<{ Params: { id: string }; Body: { accountIds?: number[] } }>("/api/merchant/a2c/account-groups/:id/accounts", { preHandler: deps.merchantAdmins }, async (request, reply) => handleExisting(reply, () => deps.repos.setA2CAccountGroupMembers(parseId(request.params.id), scopedMerchantId(request), Array.isArray(request.body?.accountIds) ? request.body.accountIds.map(Number) : []), "客服分组不存在"));

  app.get<{ Params: { id: string } }>("/api/merchant/a2c/account-groups/:id/invite-codes", { preHandler: deps.merchantRoles }, async (request) => ({ rows: deps.repos.listGroupInviteCodes(parseId(request.params.id), scopedMerchantId(request)) }));
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/a2c/account-groups/:id/invite-codes", { preHandler: deps.merchantAdmins }, async (request, reply) => handle(reply, () => deps.repos.createGroupInviteCode(parseId(request.params.id), scopedMerchantId(request), request.body ?? {})));
  app.post<{ Params: { id: string }; Body: { codes?: string; registerUrl?: string; reusable?: boolean } }>("/api/merchant/a2c/account-groups/:id/invite-codes/import", { preHandler: deps.merchantAdmins }, async (request, reply) => handle(reply, () => deps.repos.importGroupInviteCodes(parseId(request.params.id), scopedMerchantId(request), request.body ?? {})));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/a2c/group-invite-codes/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => handleExisting(reply, () => deps.repos.patchGroupInviteCode(parseId(request.params.id), scopedMerchantId(request), request.body ?? {}), "邀请码不存在"));
  app.delete<{ Params: { id: string } }>("/api/merchant/a2c/group-invite-codes/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => handleExisting(reply, () => deps.repos.deleteGroupInviteCode(parseId(request.params.id), scopedMerchantId(request)) ? { ok: true } : undefined, "邀请码不存在"));

  app.get<{ Params: { source: string; id: string } }>("/api/merchant/a2c/invite-codes/:source/:id/teacher-links", { preHandler: deps.merchantRoles }, async (request, reply) => {
    const source = parseSource(request.params.source);
    if (!source) return reply.code(400).send({ error: "邀请码来源无效" });
    return { rows: deps.repos.listInviteTeacherBindings(source, parseId(request.params.id), scopedMerchantId(request)) };
  });
  app.put<{ Params: { source: string; id: string }; Body: { teacherTgLinkIds?: number[] } }>("/api/merchant/a2c/invite-codes/:source/:id/teacher-links", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    const source = parseSource(request.params.source);
    if (!source) return reply.code(400).send({ error: "邀请码来源无效" });
    return handle(reply, () => ({ rows: deps.repos.replaceInviteTeacherBindings(source, parseId(request.params.id), scopedMerchantId(request), Array.isArray(request.body?.teacherTgLinkIds) ? request.body.teacherTgLinkIds.map(Number) : []) }));
  });
}

function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error("编号无效");
  return id;
}

function parseSource(value: string): "account" | "group" | undefined {
  return value === "account" || value === "group" ? value : undefined;
}

function handle(reply: FastifyReply, action: () => unknown): unknown {
  try {
    return action();
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "操作失败" });
  }
}

function handleExisting(reply: FastifyReply, action: () => unknown, notFound: string): unknown {
  try {
    const result = action();
    return result ?? reply.code(404).send({ error: notFound });
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "操作失败" });
  }
}
