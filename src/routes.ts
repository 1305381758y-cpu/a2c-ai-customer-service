import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { hashPassword, requireUser } from "./auth.js";
import type { AppConfig } from "./config.js";
import type { Repositories } from "./repositories.js";
import type { ConversationEngine } from "./services/conversationEngine.js";
import { registerConversationIngressRoutes } from "./http/conversationIngressRoutes.js";
import { requireInternalApiKey as auth } from "./http/internalApiKeyAuth.js";
import { registerAdminUserRoutes } from "./http/adminUserRoutes.js";
import { maskUser } from "./http/routeHelpers.js";
import { registerAuthRoutes } from "./http/authRoutes.js";
import { registerAdminDashboardRoutes } from "./http/adminDashboardRoutes.js";
import { registerAdminTrainingRoutes } from "./http/adminTrainingRoutes.js";
import { registerAdminScriptFlowRoutes } from "./http/adminScriptFlowRoutes.js";
import { registerMerchantScriptFlowRoutes } from "./http/merchantScriptFlowRoutes.js";
import { registerMerchantTrainingRoutes } from "./http/merchantTrainingRoutes.js";
import { importSamples } from "./http/trainingImports.js";
import { registerAdminConversationRoutes } from "./http/adminConversationRoutes.js";
import { registerMerchantConversationRoutes } from "./http/merchantConversationRoutes.js";
import { registerMerchantSettingsRoutes, registerStaticFrontendRoute, registerTelegramWebhookRoutes } from "./http/merchantSettingsRoutes.js";

export function registerRoutes(app: FastifyInstance, deps: { config: AppConfig; repos: Repositories; conversationEngine: ConversationEngine }): void {
  const adminOnly = requireUser(deps.config, deps.repos, ["platform_admin"]);
  const merchantRoles = requireUser(deps.config, deps.repos, ["platform_admin", "merchant_admin", "merchant_operator"]);
  const merchantAdmins = requireUser(deps.config, deps.repos, ["platform_admin", "merchant_admin"]);

  app.get("/health", async () => ({ ok: true }));

  registerAuthRoutes(app, deps);

  registerAdminDashboardRoutes(app, { repos: deps.repos, adminOnly });

  app.get("/api/admin/merchants", { preHandler: adminOnly }, async () => ({ rows: deps.repos.listMerchants() }));
  app.post("/api/admin/merchants", { preHandler: adminOnly }, async (request, reply) => {
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
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/merchants/:id", { preHandler: adminOnly }, async (request, reply) => {
    const merchant = deps.repos.patchMerchant(request.params.id, request.body ?? {});
    if (!merchant) return reply.code(404).send({ error: "merchant not found" });
    return merchant;
  });
  app.delete<{ Params: { id: string } }>("/api/admin/merchants/:id", { preHandler: adminOnly }, async (request, reply) => {
    if (request.params.id === "default") return reply.code(400).send({ error: "默认商户不能删除" });
    const ok = deps.repos.deleteMerchant(request.params.id);
    if (!ok) return reply.code(404).send({ error: "merchant not found" });
    return { ok: true };
  });
  registerMerchantSettingsRoutes(app, { config: deps.config, repos: deps.repos, adminOnly, merchantRoles, merchantAdmins });
  registerAdminUserRoutes(app, { repos: deps.repos, adminOnly });
  registerAdminTrainingRoutes(app, { repos: deps.repos, adminOnly });
  registerAdminScriptFlowRoutes(app, { repos: deps.repos, adminOnly });
  registerAdminConversationRoutes(app, { config: deps.config, repos: deps.repos, adminOnly });
  registerMerchantTrainingRoutes(app, { config: deps.config, repos: deps.repos, merchantRoles, merchantAdmins });
  registerMerchantScriptFlowRoutes(app, { repos: deps.repos, merchantRoles, merchantAdmins });
  registerMerchantConversationRoutes(app, { config: deps.config, repos: deps.repos, conversationEngine: deps.conversationEngine, merchantRoles, merchantAdmins });

  app.post("/internal/training-samples/import", { preHandler: auth(deps.config) }, async (request, reply) => importSamples(request, reply, deps, "default"));
  app.post<{ Body: { email?: string; password?: string; name?: string } }>("/internal/admin/reset-password", { preHandler: auth(deps.config) }, async (request, reply) => {
    const body = z.object({
      email: z.string().email().default(deps.config.DEFAULT_ADMIN_EMAIL),
      password: z.string().min(8).default(deps.config.DEFAULT_ADMIN_PASSWORD),
      name: z.string().min(1).optional()
    }).parse(request.body ?? {});
    const user = deps.repos.resetPlatformAdmin({
      email: body.email,
      passwordHash: hashPassword(body.password),
      name: body.name
    });
    return maskUser(user);
  });
  app.post<{ Body: { confirm?: string } }>("/internal/admin/clear-learning-data", { preHandler: auth(deps.config) }, async (request, reply) => {
    const body = z.object({ confirm: z.string() }).parse(request.body ?? {});
    if (body.confirm !== "CLEAR_LEARNING_AND_CUSTOMERS") {
      return reply.code(400).send({ error: "invalid confirmation" });
    }
    return {
      ok: true,
      ...deps.repos.clearLearningAndCustomerData()
    };
  });
  app.get<{ Querystring: { language?: string; intent?: string; stage?: string; enabled?: string } }>("/internal/training-samples", { preHandler: auth(deps.config) }, async (request) => ({
    rows: deps.repos.listTrainingSamples({
      language: request.query.language,
      intent: request.query.intent,
      stage: request.query.stage,
      enabled: request.query.enabled === undefined ? undefined : request.query.enabled === "true" || request.query.enabled === "1"
    })
  }));
  app.delete("/internal/training-samples", { preHandler: auth(deps.config) }, async () => ({
    ok: true,
    ...deps.repos.deleteAllTrainingSamples()
  }));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/internal/training-samples/:id", { preHandler: auth(deps.config) }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "invalid id" });
    const row = deps.repos.patchTrainingSample(id, request.body ?? {});
    if (!row) return reply.code(404).send({ error: "sample not found" });
    return row;
  });
  app.get<{ Querystring: { status?: string; language?: string; limit?: string } }>("/internal/conversations", { preHandler: auth(deps.config) }, async (request) => ({
    rows: deps.repos.listConversations({
      status: request.query.status,
      language: request.query.language,
      limit: request.query.limit ? Number(request.query.limit) : undefined
    })
  }));
  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>("/internal/conversations/:id/messages", { preHandler: auth(deps.config) }, async (request, reply) => {
    const conversation = deps.repos.getConversation(request.params.id);
    if (!conversation) return reply.code(404).send({ error: "conversation not found" });
    return { conversation, rows: deps.repos.listConversationMessages(request.params.id, request.query.limit ? Number(request.query.limit) : 50) };
  });

  registerConversationIngressRoutes(app, deps);
  registerTelegramWebhookRoutes(app, deps);
  registerStaticFrontendRoute(app);
}
