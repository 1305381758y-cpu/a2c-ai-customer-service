import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser, requestUser } from "../auth.js";
import type { Repositories } from "../repositories.js";
import { createAdminUser, deleteAdminUser, listAdminUsers, patchAdminUser } from "../services/adminUsers.js";
import { maskUser } from "./routeHelpers.js";

type AdminUserRoutesDeps = {
  repos: Repositories;
  adminOnly: ReturnType<typeof requireUser>;
};

export function registerAdminUserRoutes(app: FastifyInstance, deps: AdminUserRoutesDeps): void {
  app.get<{ Querystring: { merchantId?: string } }>("/api/admin/users", { preHandler: deps.adminOnly }, async (request) => ({
    rows: listAdminUsers(deps.repos, { merchantId: request.query.merchantId }).map(maskUser)
  }));

  app.post("/api/admin/users", { preHandler: deps.adminOnly }, async (request) => {
    const body = z.object({
      merchantId: z.string().nullable().optional(),
      email: z.string().email(),
      name: z.string().min(1),
      password: z.string().min(8),
      role: z.enum(["platform_admin", "merchant_admin", "merchant_operator"])
    }).parse(request.body);
    return maskUser(createAdminUser(deps.repos, body));
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/users/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    const user = patchAdminUser(deps.repos, request.params.id, request.body ?? {});
    if (!user) return reply.code(404).send({ error: "user not found" });
    return maskUser(user);
  });

  app.delete<{ Params: { id: string } }>("/api/admin/users/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    const result = deleteAdminUser(deps.repos, request.params.id, requestUser(request).id);
    if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
    return result;
  });
}
