import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { hashPassword, requireUser, requestUser } from "../auth.js";
import type { Repositories } from "../repositories.js";
import { maskUser } from "./routeHelpers.js";

type AdminUserRoutesDeps = {
  repos: Repositories;
  adminOnly: ReturnType<typeof requireUser>;
};

export function registerAdminUserRoutes(app: FastifyInstance, deps: AdminUserRoutesDeps): void {
  app.get<{ Querystring: { merchantId?: string } }>("/api/admin/users", { preHandler: deps.adminOnly }, async (request) => ({
    rows: deps.repos.listUsers({ merchantId: request.query.merchantId }).map(maskUser)
  }));

  app.post("/api/admin/users", { preHandler: deps.adminOnly }, async (request) => {
    const body = z.object({
      merchantId: z.string().nullable().optional(),
      email: z.string().email(),
      name: z.string().min(1),
      password: z.string().min(8),
      role: z.enum(["platform_admin", "merchant_admin", "merchant_operator"])
    }).parse(request.body);
    return maskUser(deps.repos.createUser({
      merchantId: body.role === "platform_admin" ? null : body.merchantId ?? "default",
      email: body.email,
      name: body.name,
      passwordHash: hashPassword(body.password),
      role: body.role
    }));
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/users/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    const body = request.body ?? {};
    const role = body.role === "platform_admin" || body.role === "merchant_admin" || body.role === "merchant_operator" ? body.role : undefined;
    const user = deps.repos.patchUser(request.params.id, {
      name: typeof body.name === "string" ? body.name : undefined,
      status: body.status === "active" || body.status === "disabled" ? body.status : undefined,
      role,
      merchantId: role === "platform_admin" ? null : typeof body.merchantId === "string" ? body.merchantId : undefined,
      passwordHash: typeof body.password === "string" && body.password.length >= 8 ? hashPassword(body.password) : undefined
    });
    if (!user) return reply.code(404).send({ error: "user not found" });
    return maskUser(user);
  });

  app.delete<{ Params: { id: string } }>("/api/admin/users/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    const current = requestUser(request);
    if (current.id === request.params.id) return reply.code(400).send({ error: "不能删除当前登录账号" });
    const ok = deps.repos.deleteUser(request.params.id);
    if (!ok) return reply.code(404).send({ error: "user not found" });
    return { ok: true };
  });
}
