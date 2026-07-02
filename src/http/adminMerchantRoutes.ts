import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { hashPassword, type requireUser } from "../auth.js";
import type { Repositories } from "../repositories.js";
import { maskUser } from "./routeHelpers.js";

type AdminMerchantRoutesDeps = {
  repos: Repositories;
  adminOnly: ReturnType<typeof requireUser>;
};

export function registerAdminMerchantRoutes(app: FastifyInstance, deps: AdminMerchantRoutesDeps): void {
  app.get("/api/admin/merchants", { preHandler: deps.adminOnly }, async () => ({ rows: deps.repos.listMerchants() }));

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
    if (body.adminUser && deps.repos.getUserByEmail(body.adminUser.email)) {
      return reply.code(400).send({ error: "登录邮箱已存在" });
    }
    const merchant = deps.repos.createMerchant(body.name);
    if (!body.country && !body.adminUser) return merchant;
    const country = body.country ? deps.repos.createMerchantCountry(merchant.id, body.country) : undefined;
    const adminUser = body.adminUser ? maskUser(deps.repos.createUser({
      merchantId: merchant.id,
      email: body.adminUser.email,
      name: body.adminUser.name,
      passwordHash: hashPassword(body.adminUser.password),
      role: "merchant_admin"
    })) : undefined;
    return { merchant, country, adminUser };
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/merchants/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    const merchant = deps.repos.patchMerchant(request.params.id, request.body ?? {});
    if (!merchant) return reply.code(404).send({ error: "merchant not found" });
    return merchant;
  });

  app.delete<{ Params: { id: string } }>("/api/admin/merchants/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    if (request.params.id === "default") return reply.code(400).send({ error: "默认商户不能删除" });
    const ok = deps.repos.deleteMerchant(request.params.id);
    if (!ok) return reply.code(404).send({ error: "merchant not found" });
    return { ok: true };
  });
}
