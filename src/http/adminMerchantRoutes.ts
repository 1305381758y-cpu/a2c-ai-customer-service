import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { type requireUser } from "../auth.js";
import type { Repositories } from "../repositories.js";
import { createAdminMerchant, deleteAdminMerchant, listAdminMerchants, patchAdminMerchant } from "../services/adminMerchants.js";
import { maskUser } from "./routeHelpers.js";

type AdminMerchantRoutesDeps = {
  repos: Repositories;
  adminOnly: ReturnType<typeof requireUser>;
};

export function registerAdminMerchantRoutes(app: FastifyInstance, deps: AdminMerchantRoutesDeps): void {
  app.get("/api/admin/merchants", { preHandler: deps.adminOnly }, async () => ({ rows: listAdminMerchants(deps.repos) }));

  app.post("/api/admin/merchants", { preHandler: deps.adminOnly }, async (request, reply) => {
    const body = z.object({
      name: z.string().min(1),
      country: z.object({
        code: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        defaultLanguage: z.string().min(1).optional(),
        platformRegisterUrl: z.string().optional(),
        tgRegisterGuideUrl: z.string().optional(),
        requirePlatformAccount: z.boolean().optional(),
        requirePhone: z.boolean().optional(),
        requireTelegram: z.boolean().optional(),
        requireWhatsApp: z.boolean().optional()
      }).optional(),
      adminUser: z.object({
        email: z.string().email(),
        name: z.string().min(1),
        password: z.string().min(8)
      }).optional()
    }).parse(request.body);
    const result = createAdminMerchant(deps.repos, body);
    if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
    if (!result.country && !result.adminUser) return result.merchant;
    return { merchant: result.merchant, country: result.country, adminUser: result.adminUser ? maskUser(result.adminUser) : undefined };
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/merchants/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    const merchant = patchAdminMerchant(deps.repos, request.params.id, request.body ?? {});
    if (!merchant) return reply.code(404).send({ error: "merchant not found" });
    return merchant;
  });

  app.delete<{ Params: { id: string } }>("/api/admin/merchants/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    const result = deleteAdminMerchant(deps.repos, request.params.id);
    if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
    return result;
  });
}
