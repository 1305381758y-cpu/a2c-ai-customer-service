import { existsSync, readFileSync } from "node:fs";
import { createHmac, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { A2CClient } from "./clients/a2c.js";
import { generateGeminiText, geminiApiKey, geminiModel } from "./clients/gemini.js";
import { TelegramClient } from "./clients/telegram.js";
import { clearSessionCookie, createSessionToken, hashPassword, requireUser, requestUser, setSessionCookie, toSessionUser, verifyPassword } from "./auth.js";
import { parseTrainingSamples } from "./import/trainingSamples.js";
import { parseTrainingMaterial } from "./import/trainingMaterials.js";
import type { AppConfig } from "./config.js";
import type { MerchantConfigRecord, Repositories } from "./repositories.js";
import type { WebhookProcessor } from "./services/webhookProcessor.js";
import { translateForCustomer, translateForOperator } from "./services/translation.js";
import { VectorIndexService } from "./services/vectorIndex.js";

export function registerRoutes(app: FastifyInstance, deps: { config: AppConfig; repos: Repositories; processor: WebhookProcessor }): void {
  const adminOnly = requireUser(deps.config, deps.repos, ["platform_admin"]);
  const merchantRoles = requireUser(deps.config, deps.repos, ["platform_admin", "merchant_admin", "merchant_operator"]);
  const merchantAdmins = requireUser(deps.config, deps.repos, ["platform_admin", "merchant_admin"]);

  app.get("/health", async () => ({ ok: true }));

  app.post("/api/auth/login", async (request, reply) => {
    const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(request.body);
    const user = deps.repos.getUserByEmail(body.email);
    if (!user || user.status !== "active" || !verifyPassword(body.password, user.passwordHash)) {
      return reply.code(401).send({ error: "invalid credentials" });
    }
    const session = toSessionUser(user);
    setSessionCookie(reply, createSessionToken(session, deps.config.SESSION_SECRET));
    return { user: session };
  });

  app.post("/api/auth/logout", async (_request, reply) => {
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get("/api/auth/me", { preHandler: requireUser(deps.config, deps.repos) }, async (request) => ({ user: requestUser(request) }));

  app.get("/api/admin/dashboard", { preHandler: adminOnly }, async () => ({
    merchants: deps.repos.listMerchants().length,
    customers: deps.repos.listCustomers({ limit: 500 }).length,
    conversations: deps.repos.listConversations({ limit: 500 }).length,
    handoffs: deps.repos.listConversations({ status: "human_handoff", limit: 500 }).length,
    samples: deps.repos.listTrainingSamples({ enabled: true }).length
  }));

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
  app.get<{ Params: { id: string } }>("/api/admin/merchants/:id/config", { preHandler: adminOnly }, async (request) => maskConfig(deps.repos.getMerchantConfig(request.params.id)));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/merchants/:id/config", { preHandler: adminOnly }, async (request) => maskConfig(deps.repos.patchMerchantConfig(request.params.id, cleanConfigPatch(request.body ?? {}))));
  app.get<{ Params: { id: string } }>("/api/admin/merchants/:id/config/check", { preHandler: adminOnly }, async (request, reply) => checkMerchantConfig(reply, deps, request.params.id));
  app.get<{ Params: { id: string } }>("/api/admin/merchants/:id/countries", { preHandler: adminOnly }, async (request) => ({ rows: deps.repos.listMerchantCountries(request.params.id) }));
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/merchants/:id/countries", { preHandler: adminOnly }, async (request, reply) => {
    try {
      return deps.repos.createMerchantCountry(request.params.id, request.body ?? {});
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "invalid country" });
    }
  });
  app.patch<{ Params: { id: string; countryId: string }; Body: Record<string, unknown> }>("/api/admin/merchants/:id/countries/:countryId", { preHandler: adminOnly }, async (request, reply) => {
    const row = deps.repos.patchMerchantCountry(request.params.countryId, request.params.id, request.body ?? {});
    if (!row) return reply.code(404).send({ error: "country not found" });
    return row;
  });
  app.get<{ Params: { id: string } }>("/api/admin/merchants/:id/a2c/accounts", { preHandler: adminOnly }, async (request) => ({ rows: deps.repos.listMerchantA2CAccounts({ merchantId: request.params.id }) }));
  app.post<{ Params: { id: string } }>("/api/admin/merchants/:id/a2c/accounts/sync", { preHandler: adminOnly }, async (request, reply) => syncA2CAccounts(request, reply, deps, request.params.id));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/a2c/accounts/:id", { preHandler: adminOnly }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "invalid id" });
    const row = deps.repos.patchMerchantA2CAccount(id, request.body ?? {});
    if (!row) return reply.code(404).send({ error: "a2c account not found" });
    return { row, config: maskConfig(deps.repos.getMerchantConfig(row.merchantId)) };
  });
  app.get<{ Params: { id: string } }>("/api/admin/a2c/accounts/:id/invite-codes", { preHandler: adminOnly }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "invalid id" });
    return { rows: deps.repos.listInviteCodesForA2CAccount(id) };
  });
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/a2c/accounts/:id/invite-codes", { preHandler: adminOnly }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "invalid id" });
    try {
      return deps.repos.createInviteCodeForA2CAccount(id, request.body ?? {});
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "invalid invite code" });
    }
  });
  app.post<{ Params: { id: string }; Body: { codes?: string; registerUrl?: string } }>("/api/admin/a2c/accounts/:id/invite-codes/import", { preHandler: adminOnly }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "invalid id" });
    try {
      return deps.repos.importInviteCodesForA2CAccount(id, request.body ?? {});
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "invalid invite codes" });
    }
  });
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/invite-codes/:id", { preHandler: adminOnly }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "invalid id" });
    const row = deps.repos.patchInviteCode(id, request.body ?? {});
    if (!row) return reply.code(404).send({ error: "invite code not found" });
    return row;
  });
  app.delete<{ Params: { id: string } }>("/api/admin/invite-codes/:id", { preHandler: adminOnly }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "invalid id" });
    const ok = deps.repos.deleteInviteCode(id);
    if (!ok) return reply.code(404).send({ error: "invite code not found" });
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>("/api/admin/merchants/:id/telegram/setup-webhook", { preHandler: adminOnly }, async (request, reply) => setupTelegramWebhook(request, reply, deps, request.params.id));

  app.get<{ Querystring: { merchantId?: string } }>("/api/admin/users", { preHandler: adminOnly }, async (request) => ({
    rows: deps.repos.listUsers({ merchantId: request.query.merchantId }).map(maskUser)
  }));
  app.get<{ Querystring: { merchantId?: string; countryId?: string; type?: string; enabled?: string } }>("/api/admin/knowledge", { preHandler: adminOnly }, async (request) => ({
    rows: deps.repos.listKnowledgeItems({
      merchantId: request.query.merchantId,
      countryId: request.query.countryId,
      type: request.query.type,
      enabled: request.query.enabled === undefined ? undefined : request.query.enabled === "true" || request.query.enabled === "1"
    })
  }));
  app.post<{ Body: Record<string, unknown> }>("/api/admin/knowledge", { preHandler: adminOnly }, async (request, reply) => {
    try {
      return deps.repos.createKnowledgeItem(String(request.body?.merchantId || "default"), request.body ?? {});
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "invalid knowledge item" });
    }
  });
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/knowledge/:id", { preHandler: adminOnly }, async (request, reply) => {
    const row = deps.repos.patchKnowledgeItem(Number(request.params.id), request.body ?? {});
    if (!row) return reply.code(404).send({ error: "knowledge item not found" });
    return row;
  });
  app.delete<{ Params: { id: string } }>("/api/admin/knowledge/:id", { preHandler: adminOnly }, async (request, reply) => {
    const ok = deps.repos.deleteKnowledgeItem(Number(request.params.id));
    if (!ok) return reply.code(404).send({ error: "knowledge item not found" });
    return { ok: true };
  });
  app.get<{ Querystring: { merchantId?: string; countryId?: string; language?: string; intent?: string; stage?: string; enabled?: string } }>("/api/admin/training-samples", { preHandler: adminOnly }, async (request) => ({
    rows: deps.repos.listTrainingSamples({
      merchantId: request.query.merchantId,
      countryId: request.query.countryId,
      language: request.query.language,
      intent: request.query.intent,
      stage: request.query.stage,
      enabled: request.query.enabled === undefined ? undefined : request.query.enabled === "true" || request.query.enabled === "1"
    })
  }));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/training-samples/:id", { preHandler: adminOnly }, async (request, reply) => {
    const row = deps.repos.patchTrainingSample(Number(request.params.id), request.body ?? {});
    if (!row) return reply.code(404).send({ error: "sample not found" });
    return row;
  });
  app.delete<{ Params: { id: string } }>("/api/admin/training-samples/:id", { preHandler: adminOnly }, async (request, reply) => {
    const ok = deps.repos.deleteTrainingSample(Number(request.params.id));
    if (!ok) return reply.code(404).send({ error: "sample not found" });
    return { ok: true };
  });
  app.get<{ Querystring: { merchantId?: string; countryId?: string; sourceType?: string; status?: string; limit?: string } }>("/api/admin/training-materials", { preHandler: adminOnly }, async (request) => ({
    rows: deps.repos.listTrainingMaterials({
      merchantId: request.query.merchantId,
      countryId: request.query.countryId,
      sourceType: request.query.sourceType,
      status: request.query.status,
      limit: request.query.limit ? Number(request.query.limit) : undefined
    })
  }));
  app.get<{ Params: { id: string } }>("/api/admin/training-materials/:id", { preHandler: adminOnly }, async (request, reply) => {
    const id = Number(request.params.id);
    const material = deps.repos.getTrainingMaterial(id);
    if (!material) return reply.code(404).send({ error: "material not found" });
    return { material, items: deps.repos.listTrainingMaterialItems(id) };
  });
  app.delete<{ Params: { id: string } }>("/api/admin/training-materials/:id", { preHandler: adminOnly }, async (request, reply) => {
    const ok = deps.repos.deleteTrainingMaterial(Number(request.params.id));
    if (!ok) return reply.code(404).send({ error: "material not found" });
    return { ok: true };
  });
  app.get<{ Querystring: { merchantId?: string; countryId?: string; status?: string; handoffStatus?: string; language?: string; a2cAccountPhone?: string; limit?: string } }>("/api/admin/conversations", { preHandler: adminOnly }, async (request) => ({
    rows: deps.repos.listConversations({
      merchantId: request.query.merchantId,
      countryId: request.query.countryId,
      status: request.query.status,
      handoffStatus: request.query.handoffStatus,
      language: request.query.language,
      a2cAccountPhone: request.query.a2cAccountPhone,
      limit: request.query.limit ? Number(request.query.limit) : undefined
    })
  }));
  app.get<{ Querystring: { merchantId?: string; countryId?: string; status?: string; language?: string; limit?: string } }>("/api/admin/customers", { preHandler: adminOnly }, async (request) => ({
    rows: deps.repos.listCustomers({
      merchantId: request.query.merchantId,
      countryId: request.query.countryId,
      status: request.query.status,
      language: request.query.language,
      limit: request.query.limit ? Number(request.query.limit) : undefined
    })
  }));
  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>("/api/admin/conversations/:id/messages", { preHandler: adminOnly }, async (request, reply) => {
    const conversation = deps.repos.getConversation(request.params.id);
    if (!conversation) return reply.code(404).send({ error: "conversation not found" });
    return { conversation, rows: deps.repos.listConversationMessages(request.params.id, request.query.limit ? Number(request.query.limit) : 50) };
  });
  app.delete<{ Params: { id: string } }>("/api/admin/conversations/:id", { preHandler: adminOnly }, async (request, reply) => {
    const ok = deps.repos.deleteConversation(request.params.id);
    if (!ok) return reply.code(404).send({ error: "conversation not found" });
    return { ok: true };
  });
  app.get<{ Params: { id: string } }>("/api/admin/conversations/:id/memory", { preHandler: adminOnly }, async (request, reply) => {
    const memory = deps.repos.getCustomerMemoryByConversation(request.params.id);
    if (!memory) return reply.code(404).send({ error: "memory not found" });
    return memory;
  });
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/conversations/:id/memory", { preHandler: adminOnly }, async (request, reply) => {
    const memory = deps.repos.patchCustomerMemory(request.params.id, undefined, request.body ?? {});
    if (!memory) return reply.code(404).send({ error: "memory not found" });
    return memory;
  });
  app.post("/api/admin/users", { preHandler: adminOnly }, async (request) => {
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
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/users/:id", { preHandler: adminOnly }, async (request, reply) => {
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

  app.get("/api/merchant/dashboard", { preHandler: merchantRoles }, async (request) => {
    const merchantId = scopedMerchantId(request);
    const conversations = deps.repos.listConversations({ merchantId, limit: 500 });
    return {
      customers: deps.repos.listCustomers({ merchantId, limit: 500 }).length,
      conversations: conversations.length,
      active: conversations.filter((item) => item.status === "active").length,
      handoffs: conversations.filter((item) => item.status === "human_handoff").length,
      pendingHandoffs: conversations.filter((item) => item.status === "human_handoff" && item.handoffStatus !== "done").length,
      samples: deps.repos.listTrainingSamples({ merchantId, enabled: true }).length
    };
  });
  app.get("/api/merchant/config", { preHandler: merchantRoles }, async (request) => maskConfig(deps.repos.getMerchantConfig(scopedMerchantId(request))));
  app.patch<{ Body: Record<string, unknown> }>("/api/merchant/config", { preHandler: merchantAdmins }, async (request) => maskConfig(deps.repos.patchMerchantConfig(scopedMerchantId(request), cleanConfigPatch(request.body ?? {}))));
  app.get("/api/merchant/config/check", { preHandler: merchantRoles }, async (request, reply) => checkMerchantConfig(reply, deps, scopedMerchantId(request)));
	  app.get("/api/merchant/countries", { preHandler: merchantRoles }, async (request) => ({ rows: deps.repos.listMerchantCountries(scopedMerchantId(request)) }));
  app.post<{ Body: Record<string, unknown> }>("/api/merchant/countries", { preHandler: merchantAdmins }, async (request, reply) => {
    try {
      return deps.repos.createMerchantCountry(scopedMerchantId(request), request.body ?? {});
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "invalid country" });
    }
  });
  app.patch<{ Params: { countryId: string }; Body: Record<string, unknown> }>("/api/merchant/countries/:countryId", { preHandler: merchantAdmins }, async (request, reply) => {
    const row = deps.repos.patchMerchantCountry(request.params.countryId, scopedMerchantId(request), request.body ?? {});
    if (!row) return reply.code(404).send({ error: "country not found" });
    return row;
  });
  app.get("/api/merchant/a2c/accounts", { preHandler: merchantRoles }, async (request) => ({ rows: deps.repos.listMerchantA2CAccounts({ merchantId: scopedMerchantId(request) }) }));
  app.post("/api/merchant/a2c/accounts/sync", { preHandler: merchantAdmins }, async (request, reply) => syncA2CAccounts(request, reply, deps, scopedMerchantId(request)));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/a2c/accounts/:id", { preHandler: merchantAdmins }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "invalid id" });
    const row = deps.repos.patchMerchantA2CAccount(id, request.body ?? {}, scopedMerchantId(request));
    if (!row) return reply.code(404).send({ error: "a2c account not found" });
    return { row, config: maskConfig(deps.repos.getMerchantConfig(row.merchantId)) };
  });
  app.get<{ Params: { id: string } }>("/api/merchant/a2c/accounts/:id/invite-codes", { preHandler: merchantRoles }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "invalid id" });
    return { rows: deps.repos.listInviteCodesForA2CAccount(id, scopedMerchantId(request)) };
  });
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/a2c/accounts/:id/invite-codes", { preHandler: merchantAdmins }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "invalid id" });
    try {
      return deps.repos.createInviteCodeForA2CAccount(id, request.body ?? {}, scopedMerchantId(request));
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "invalid invite code" });
    }
  });
  app.post<{ Params: { id: string }; Body: { codes?: string; registerUrl?: string } }>("/api/merchant/a2c/accounts/:id/invite-codes/import", { preHandler: merchantAdmins }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "invalid id" });
    try {
      return deps.repos.importInviteCodesForA2CAccount(id, request.body ?? {}, scopedMerchantId(request));
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "invalid invite codes" });
    }
  });
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/invite-codes/:id", { preHandler: merchantAdmins }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "invalid id" });
    const row = deps.repos.patchInviteCode(id, request.body ?? {}, scopedMerchantId(request));
    if (!row) return reply.code(404).send({ error: "invite code not found" });
    return row;
  });
  app.delete<{ Params: { id: string } }>("/api/merchant/invite-codes/:id", { preHandler: merchantAdmins }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "invalid id" });
    const ok = deps.repos.deleteInviteCode(id, scopedMerchantId(request));
    if (!ok) return reply.code(404).send({ error: "invite code not found" });
    return { ok: true };
  });
  app.post("/api/merchant/telegram/setup-webhook", { preHandler: merchantAdmins }, async (request, reply) => setupTelegramWebhook(request, reply, deps, scopedMerchantId(request)));
  app.get<{ Querystring: { countryId?: string; type?: string; enabled?: string } }>("/api/merchant/knowledge", { preHandler: merchantRoles }, async (request) => ({
    rows: deps.repos.listKnowledgeItems({
      merchantId: scopedMerchantId(request),
      countryId: request.query.countryId,
      type: request.query.type,
      enabled: request.query.enabled === undefined ? undefined : request.query.enabled === "true" || request.query.enabled === "1"
    })
  }));
  app.post<{ Body: Record<string, unknown> }>("/api/merchant/knowledge", { preHandler: merchantAdmins }, async (request, reply) => {
    try {
      return deps.repos.createKnowledgeItem(scopedMerchantId(request), request.body ?? {});
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "invalid knowledge item" });
    }
  });
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/knowledge/:id", { preHandler: merchantAdmins }, async (request, reply) => {
    const row = deps.repos.patchKnowledgeItem(Number(request.params.id), request.body ?? {}, scopedMerchantId(request));
    if (!row) return reply.code(404).send({ error: "knowledge item not found" });
    return row;
  });
  app.delete<{ Params: { id: string } }>("/api/merchant/knowledge/:id", { preHandler: merchantAdmins }, async (request, reply) => {
    const ok = deps.repos.deleteKnowledgeItem(Number(request.params.id), scopedMerchantId(request));
    if (!ok) return reply.code(404).send({ error: "knowledge item not found" });
    return { ok: true };
  });

  app.post("/api/merchant/training-samples/import", { preHandler: merchantRoles }, async (request, reply) => importSamples(request, reply, deps, scopedMerchantId(request)));
  app.post("/api/merchant/training-materials/import", { preHandler: merchantRoles }, async (request, reply) => importMaterial(request, reply, deps, scopedMerchantId(request)));
  app.get<{ Querystring: { countryId?: string; sourceType?: string; status?: string; limit?: string } }>("/api/merchant/training-materials", { preHandler: merchantRoles }, async (request) => ({
    rows: deps.repos.listTrainingMaterials({
      merchantId: scopedMerchantId(request),
      countryId: request.query.countryId,
      sourceType: request.query.sourceType,
      status: request.query.status,
      limit: request.query.limit ? Number(request.query.limit) : undefined
    })
  }));
  app.get<{ Params: { id: string } }>("/api/merchant/training-materials/:id", { preHandler: merchantRoles }, async (request, reply) => {
    const id = Number(request.params.id);
    const merchantId = scopedMerchantId(request);
    const material = deps.repos.getTrainingMaterial(id, merchantId);
    if (!material) return reply.code(404).send({ error: "material not found" });
    return { material, items: deps.repos.listTrainingMaterialItems(id, merchantId) };
  });
  app.delete<{ Params: { id: string } }>("/api/merchant/training-materials/:id", { preHandler: merchantAdmins }, async (request, reply) => {
    const ok = deps.repos.deleteTrainingMaterial(Number(request.params.id), scopedMerchantId(request));
    if (!ok) return reply.code(404).send({ error: "material not found" });
    return { ok: true };
  });
  app.get<{ Querystring: { countryId?: string; language?: string; intent?: string; stage?: string; enabled?: string } }>("/api/merchant/training-samples", { preHandler: merchantRoles }, async (request) => ({
    rows: deps.repos.listTrainingSamples({
      merchantId: scopedMerchantId(request),
      countryId: request.query.countryId,
      language: request.query.language,
      intent: request.query.intent,
      stage: request.query.stage,
      enabled: request.query.enabled === undefined ? undefined : request.query.enabled === "true" || request.query.enabled === "1"
    })
  }));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/training-samples/:id", { preHandler: merchantRoles }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "invalid id" });
    const row = deps.repos.patchTrainingSample(id, request.body ?? {}, scopedMerchantId(request));
    if (!row) return reply.code(404).send({ error: "sample not found" });
    return row;
  });
  app.delete<{ Params: { id: string } }>("/api/merchant/training-samples/:id", { preHandler: merchantAdmins }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "invalid id" });
    const ok = deps.repos.deleteTrainingSample(id, scopedMerchantId(request));
    if (!ok) return reply.code(404).send({ error: "sample not found" });
    return { ok: true };
  });

  app.get<{ Querystring: { countryId?: string; status?: string; handoffStatus?: string; language?: string; a2cAccountPhone?: string; limit?: string } }>("/api/merchant/conversations", { preHandler: merchantRoles }, async (request) => ({
    rows: deps.repos.listConversations({
      merchantId: scopedMerchantId(request),
      countryId: request.query.countryId,
      status: request.query.status,
      handoffStatus: request.query.handoffStatus,
      language: request.query.language,
      a2cAccountPhone: request.query.a2cAccountPhone,
      limit: request.query.limit ? Number(request.query.limit) : undefined
    })
  }));
  app.get<{ Querystring: { countryId?: string; status?: string; language?: string; limit?: string } }>("/api/merchant/customers", { preHandler: merchantRoles }, async (request) => ({
    rows: deps.repos.listCustomers({
      merchantId: scopedMerchantId(request),
      countryId: request.query.countryId,
      status: request.query.status,
      language: request.query.language,
      limit: request.query.limit ? Number(request.query.limit) : undefined
    })
  }));
  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>("/api/merchant/conversations/:id/messages", { preHandler: merchantRoles }, async (request, reply) => {
    const conversation = deps.repos.getConversation(request.params.id);
    if (!conversation || conversation.merchantId !== scopedMerchantId(request)) return reply.code(404).send({ error: "conversation not found" });
    return { conversation, rows: deps.repos.listConversationMessages(request.params.id, request.query.limit ? Number(request.query.limit) : 50) };
  });
  app.delete<{ Params: { id: string } }>("/api/merchant/conversations/:id", { preHandler: merchantAdmins }, async (request, reply) => {
    const ok = deps.repos.deleteConversation(request.params.id, scopedMerchantId(request));
    if (!ok) return reply.code(404).send({ error: "conversation not found" });
    return { ok: true };
  });
  app.get("/api/merchant/conversations/unread-summary", { preHandler: merchantRoles }, async (request) => ({
    rows: deps.repos.unreadSummary(scopedMerchantId(request))
  }));
  app.post<{ Params: { id: string } }>("/api/merchant/conversations/:id/read", { preHandler: merchantRoles }, async (request, reply) => {
    const row = deps.repos.markConversationRead(request.params.id, scopedMerchantId(request));
    if (!row || row.merchantId !== scopedMerchantId(request)) return reply.code(404).send({ error: "conversation not found" });
    return row;
  });
  app.get<{ Params: { id: string } }>("/api/merchant/conversations/:id/memory", { preHandler: merchantRoles }, async (request, reply) => {
    const conversation = deps.repos.getConversation(request.params.id);
    if (!conversation || conversation.merchantId !== scopedMerchantId(request)) return reply.code(404).send({ error: "conversation not found" });
    const memory = deps.repos.getCustomerMemoryByConversation(request.params.id) ?? deps.repos.updateCustomerMemoryFromMessage(conversation, { intent: "unknown", content: "", direction: "inbound" });
    return memory;
  });
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/conversations/:id/memory", { preHandler: merchantRoles }, async (request, reply) => {
    const memory = deps.repos.patchCustomerMemory(request.params.id, scopedMerchantId(request), request.body ?? {});
    if (!memory) return reply.code(404).send({ error: "memory not found" });
    return memory;
  });
  app.get<{ Params: { id: string } }>("/api/merchant/conversations/:id/retrievals", { preHandler: merchantRoles }, async (request, reply) => {
    const merchantId = scopedMerchantId(request);
    const conversation = deps.repos.getConversation(request.params.id);
    if (!conversation || conversation.merchantId !== merchantId) return reply.code(404).send({ error: "conversation not found" });
    return { rows: deps.repos.listConversationRetrievals(request.params.id, merchantId) };
  });
  app.get<{ Querystring: { countryId?: string } }>("/api/merchant/vector-index/status", { preHandler: merchantRoles }, async (request) => ({
    rows: deps.repos.vectorIndexStatus({ merchantId: scopedMerchantId(request), countryId: request.query.countryId })
  }));
  app.post<{ Body: { countryId?: string; embedNow?: boolean } }>("/api/merchant/vector-index/rebuild", { preHandler: merchantAdmins }, async (request) => {
    const merchantId = scopedMerchantId(request);
    const cfg = deps.repos.getMerchantConfig(merchantId);
    const country = deps.repos.getMerchantCountry(request.body?.countryId || deps.repos.defaultCountryId(merchantId));
    const runtimeConfig = appConfigForMerchant(deps.config, cfg, country);
    const result = await new VectorIndexService(deps.repos).rebuild({
      config: runtimeConfig,
      merchantId,
      countryId: request.body?.countryId,
      embedNow: request.body?.embedNow !== false
    });
    return { ok: true, ...result, rows: deps.repos.vectorIndexStatus({ merchantId, countryId: request.body?.countryId }) };
  });
  app.patch<{ Params: { conversationId: string }; Body: { handoffStatus?: "pending" | "processing" | "done" } }>("/api/merchant/handoffs/:conversationId", { preHandler: merchantRoles }, async (request, reply) => {
    const status = request.body?.handoffStatus;
    if (status !== "pending" && status !== "processing" && status !== "done") return reply.code(400).send({ error: "invalid handoffStatus" });
    const row = deps.repos.updateHandoffStatus(request.params.conversationId, scopedMerchantId(request), status);
    if (!row) return reply.code(404).send({ error: "conversation not found" });
    return row;
  });
  app.post<{ Params: { id: string }; Body: { type?: "text" | "image" | "video" | "audio" | "document"; content?: string; url?: string; caption?: string; fileName?: string } }>("/api/merchant/conversations/:id/send", { preHandler: merchantRoles }, async (request, reply) => {
    const conversation = deps.repos.getConversation(request.params.id);
    if (!conversation || conversation.merchantId !== scopedMerchantId(request)) return reply.code(404).send({ error: "conversation not found" });
    const cfg = deps.repos.getMerchantConfig(conversation.merchantId);
    const country = deps.repos.getMerchantCountry(conversation.countryId);
    const runtimeConfig = appConfigForMerchant(deps.config, cfg, country);
    const client = new A2CClient(runtimeConfig, deps.repos.a2cTokenStore(conversation.merchantId));
    const type = request.body?.type ?? "text";
    const translation = type === "text" ? await translateForCustomer(runtimeConfig, request.body?.content || "", conversation.language) : undefined;
    const outgoingContent = translation?.translatedText || request.body?.content;
    const operatorTranslation = type === "text" && outgoingContent ? await translateForOperator(runtimeConfig, outgoingContent, conversation.language) : undefined;
    try {
      const externalId = await client.sendMessage({
        to: conversation.customerPhone,
        senderPhoneNumber: conversation.a2cAccountPhone,
        type,
        content: outgoingContent,
        url: request.body?.url,
        caption: request.body?.caption,
        fileName: request.body?.fileName
      });
      deps.repos.insertMessage({
        conversationId: conversation.id,
        direction: "outbound",
        externalId,
        content: outgoingContent || request.body?.caption || request.body?.url || "",
        msgType: type,
        language: conversation.language,
        intent: "unknown",
        rawPayload: {
          manual: true,
          originalContent: translation?.originalText,
          translatedContent: translation?.translatedText,
          targetLanguage: translation?.targetLanguage,
          translationStatus: translation?.status,
          translationError: translation?.error || "",
          operatorTranslatedContent: operatorTranslation?.translatedText,
          operatorTranslationTargetLanguage: operatorTranslation?.targetLanguage,
          operatorTranslationStatus: operatorTranslation?.status,
          operatorTranslationError: operatorTranslation?.error || ""
        }
      });
      return { externalId, translation };
    } catch (error) {
      return reply.code(502).send({ error: error instanceof Error ? error.message : "send failed" });
    }
  });

  app.post<{ Params: { apiPhone: string }; Body: ProactiveSendBody }>("/api/merchant/a2c/accounts/:apiPhone/send", { preHandler: merchantRoles }, async (request, reply) => {
    const merchantId = scopedMerchantId(request);
    const apiPhone = decodeURIComponent(request.params.apiPhone);
    const body = proactiveSendSchema.parse(request.body ?? {});
    const cfg = deps.repos.getMerchantConfig(merchantId);
    if (!a2cAccountAllowed(deps.repos, merchantId, cfg, apiPhone)) {
      return reply.code(404).send({ error: "a2c account not found or disabled" });
    }

    const conversation = deps.repos.getOrCreateConversation(body.customerPhone, apiPhone, body.nickname || "", merchantId, deps.repos.defaultCountryId(merchantId));
    deps.repos.upsertCustomerFromConversation(conversation);
    const country = deps.repos.getMerchantCountry(conversation.countryId);
    const runtimeConfig = appConfigForMerchant(deps.config, cfg, country);
    const client = new A2CClient(runtimeConfig, deps.repos.a2cTokenStore(merchantId));
    const type = body.type ?? "text";
    const translation = type === "text" ? await translateForCustomer(runtimeConfig, body.content || "", conversation.language) : undefined;
    const outgoingContent = translation?.translatedText || body.content;
    const operatorTranslation = type === "text" && outgoingContent ? await translateForOperator(runtimeConfig, outgoingContent, conversation.language) : undefined;
    try {
      const externalId = await client.sendMessage({
        to: conversation.customerPhone,
        senderPhoneNumber: conversation.a2cAccountPhone,
        type,
        content: outgoingContent,
        url: body.url,
        caption: body.caption,
        fileName: body.fileName
      });
      deps.repos.insertMessage({
        conversationId: conversation.id,
        direction: "outbound",
        externalId,
        content: outgoingContent || body.caption || body.url || "",
        msgType: type,
        language: conversation.language,
        intent: "unknown",
        rawPayload: {
          manual: true,
          proactive: true,
          originalContent: translation?.originalText,
          translatedContent: translation?.translatedText,
          targetLanguage: translation?.targetLanguage,
          translationStatus: translation?.status,
          translationError: translation?.error || "",
          operatorTranslatedContent: operatorTranslation?.translatedText,
          operatorTranslationTargetLanguage: operatorTranslation?.targetLanguage,
          operatorTranslationStatus: operatorTranslation?.status,
          operatorTranslationError: operatorTranslation?.error || ""
        }
      });
      deps.repos.updateCustomerMemoryFromMessage(conversation, { intent: "unknown", content: outgoingContent || body.caption || body.url || "", direction: "outbound" });
      return { externalId, conversation, translation };
    } catch (error) {
      return reply.code(502).send({ error: error instanceof Error ? error.message : "send failed" });
    }
  });

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
  app.get<{ Querystring: { merchantId?: string; countryId?: string } }>("/internal/vector-index/status", { preHandler: auth(deps.config) }, async (request) => ({
    rows: deps.repos.vectorIndexStatus({
      merchantId: request.query.merchantId,
      countryId: request.query.countryId
    })
  }));
  app.post<{ Body: { merchantId?: string; countryId?: string; embedNow?: boolean } }>("/internal/vector-index/rebuild", { preHandler: auth(deps.config) }, async (request) => {
    const merchantId = request.body?.merchantId || "default";
    const cfg = deps.repos.getMerchantConfig(merchantId);
    const country = deps.repos.getMerchantCountry(request.body?.countryId || deps.repos.defaultCountryId(merchantId));
    const runtimeConfig = appConfigForMerchant(deps.config, cfg, country);
    const result = await new VectorIndexService(deps.repos).rebuild({
      config: runtimeConfig,
      merchantId,
      countryId: request.body?.countryId,
      embedNow: request.body?.embedNow !== false
    });
    return { ok: true, ...result, rows: deps.repos.vectorIndexStatus({ merchantId, countryId: request.body?.countryId }) };
  });

  app.post("/webhooks/a2c", async (request, reply) => {
    const result = await deps.processor.process(request.body as never);
    return reply.code(200).send(result);
  });

  app.post<{ Params: { merchantId: string } }>("/webhooks/a2c/:merchantId", async (request, reply) => {
    const merchant = deps.repos.getMerchant(request.params.merchantId);
    if (!merchant || merchant.status !== "active") return reply.code(404).send({ error: "merchant not found" });
    const result = await deps.processor.process(request.body as never, merchant.id);
    return reply.code(200).send(result);
  });

  app.post<{ Params: { merchantId: string }; Body: TelegramUpdate }>("/webhooks/telegram/:merchantId", async (request, reply) => {
    const merchant = deps.repos.getMerchant(request.params.merchantId);
    if (!merchant) return reply.code(404).send({ error: "merchant not found" });
    const expectedSecret = telegramWebhookSecret(deps.config, merchant.id);
    if (!verifySecret(String(request.headers["x-telegram-bot-api-secret-token"] || ""), expectedSecret)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const result = bindTelegramUpdate(deps.repos, merchant.id, request.body);
    return reply.code(200).send(result);
  });

  app.get("/*", async (_request, reply) => {
    const indexPath = join(process.cwd(), "dist", "public", "index.html");
    if (existsSync(indexPath)) return reply.type("text/html; charset=utf-8").send(readFileSync(indexPath, "utf8"));
    return reply.type("text/html; charset=utf-8").send("<h1>A2C AI 自动客服</h1><p>服务已在线运行</p>");
  });
}

type TelegramUpdate = {
  update_id?: number;
  message?: { text?: string; chat?: TelegramChat };
  my_chat_member?: {
    chat?: TelegramChat;
    new_chat_member?: { status?: string };
  };
};

type TelegramChat = {
  id: number | string;
  type?: string;
  title?: string;
};

const proactiveSendSchema = z.object({
  customerPhone: z.string().min(1),
  nickname: z.string().optional(),
  type: z.enum(["text", "image", "video", "audio", "document"]).optional(),
  content: z.string().optional(),
  url: z.string().optional(),
  caption: z.string().optional(),
  fileName: z.string().optional()
});

type ProactiveSendBody = z.infer<typeof proactiveSendSchema>;

async function syncA2CAccounts(request: FastifyRequest, reply: FastifyReply, deps: { config: AppConfig; repos: Repositories }, merchantId: string) {
  const merchant = deps.repos.getMerchant(merchantId);
  if (!merchant) return reply.code(404).send({ error: "merchant not found" });
  const cfg = deps.repos.getMerchantConfig(merchantId);
  const client = new A2CClient(appConfigForMerchant(deps.config, cfg), deps.repos.a2cTokenStore(merchantId));
  try {
    const accounts = await client.listAccounts();
    const rows = deps.repos.syncMerchantA2CAccounts(merchantId, accounts);
    return {
      imported: rows.length,
      rows,
      config: maskConfig(deps.repos.getMerchantConfig(merchantId))
    };
  } catch (error) {
    return reply.code(502).send({ error: error instanceof Error ? error.message : "A2C accounts sync failed" });
  }
}

type ConfigCheckItem = {
  key: string;
  label: string;
  ok: boolean;
  status: "ok" | "missing" | "error" | "waiting";
  detail: string;
};

async function checkMerchantConfig(reply: FastifyReply, deps: { config: AppConfig; repos: Repositories }, merchantId: string) {
  const merchant = deps.repos.getMerchant(merchantId);
  if (!merchant) return reply.code(404).send({ error: "merchant not found" });
  const cfg = deps.repos.getMerchantConfig(merchantId);
  const runtimeConfig = appConfigForMerchant(deps.config, cfg);
  const checks: ConfigCheckItem[] = [];

  checks.push(checkA2C(runtimeConfig, deps.repos, merchantId));
  checks.push(await checkGemini(runtimeConfig));
  checks.push(await checkTelegram(runtimeConfig));
  checks.push({
    key: "platformRegisterUrl",
    label: "开户链接",
    ok: Boolean(runtimeConfig.PLATFORM_REGISTER_URL),
    status: runtimeConfig.PLATFORM_REGISTER_URL ? "ok" : "missing",
    detail: runtimeConfig.PLATFORM_REGISTER_URL || "未配置，AI 回复里无法给客户开户链接"
  });

  return {
    ok: checks.every((item) => item.ok),
    rows: checks,
    checkedAt: new Date().toISOString()
  };
}

function checkA2C(config: AppConfig, repos: Repositories, merchantId: string): ConfigCheckItem {
  if (!config.A2C_APP_ID || !config.A2C_APP_SECRET) {
    return { key: "a2c", label: "A2C", ok: false, status: "missing", detail: "缺少 A2C App ID 或密钥" };
  }
  const accounts = repos.listMerchantA2CAccounts({ merchantId, enabled: true });
  const detail = accounts.length
    ? `密钥已填写，当前已保存 ${accounts.length} 个启用客服账号。需要刷新账号时请手动点击“同步A2C客服账号”。`
    : "密钥已填写，但还没有同步客服账号。请手动点击“同步A2C客服账号”，避免配置检测频繁请求 A2C 认证。";
  return { key: "a2c", label: "A2C", ok: true, status: "ok", detail };
}

async function checkGemini(config: AppConfig): Promise<ConfigCheckItem> {
  const apiKey = geminiApiKey(config);
  if (!apiKey) return { key: "gemini", label: "Google AI Studio / Gemini", ok: false, status: "missing", detail: "缺少 Google AI Studio Key，客户消息会降级使用样本/默认话术" };
  try {
    await generateGeminiText(config, "Reply with OK only.");
    return { key: "gemini", label: "Google AI Studio / Gemini", ok: true, status: "ok", detail: `模型 ${geminiModel(config)} 可用，客户消息会优先调用 AI 回复` };
  } catch (error) {
    return { key: "gemini", label: "Google AI Studio / Gemini", ok: false, status: "error", detail: error instanceof Error ? error.message : "Gemini 检测失败" };
  }
}

async function checkTelegram(config: AppConfig): Promise<ConfigCheckItem> {
  if (!config.TELEGRAM_BOT_TOKEN) return { key: "telegram", label: "Telegram", ok: false, status: "missing", detail: "缺少 TG 机器人 Token" };
  try {
    const me = await fetchTelegram(config.TELEGRAM_BOT_TOKEN, "getMe");
    if (!me.ok) throw new Error(me.description || "TG 机器人 Token 无效");
    if (!config.TELEGRAM_HANDOFF_CHAT_ID) {
      return { key: "telegram", label: "Telegram", ok: false, status: "waiting", detail: "机器人可用，但尚未绑定接管群。请拉群并发送 /bind" };
    }
    const chat = await fetchTelegram(config.TELEGRAM_BOT_TOKEN, "getChat", { chat_id: config.TELEGRAM_HANDOFF_CHAT_ID });
    if (!chat.ok) throw new Error(chat.description || "TG 群 ID 无效或机器人不在群里");
    const title = typeof chat.result === "object" && chat.result && "title" in chat.result ? String((chat.result as { title?: string }).title || config.TELEGRAM_HANDOFF_CHAT_ID) : config.TELEGRAM_HANDOFF_CHAT_ID;
    return { key: "telegram", label: "Telegram", ok: true, status: "ok", detail: `机器人和接管群可用：${title}` };
  } catch (error) {
    return { key: "telegram", label: "Telegram", ok: false, status: "error", detail: error instanceof Error ? error.message : "Telegram 检测失败" };
  }
}

async function fetchTelegram(botToken: string, method: string, body?: Record<string, unknown>): Promise<{ ok: boolean; description?: string; result?: unknown }> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  return await response.json().catch(() => ({ ok: false, description: response.statusText })) as { ok: boolean; description?: string; result?: unknown };
}

async function setupTelegramWebhook(request: FastifyRequest, reply: FastifyReply, deps: { config: AppConfig; repos: Repositories }, merchantId: string) {
  const merchant = deps.repos.getMerchant(merchantId);
  if (!merchant) return reply.code(404).send({ error: "merchant not found" });
  const cfg = deps.repos.getMerchantConfig(merchantId);
  if (!cfg.telegramBotToken) return reply.code(400).send({ error: "telegram bot token is required" });
  const webhookUrl = `${requestOrigin(request)}/webhooks/telegram/${merchantId}`;
  try {
    await TelegramClient.setWebhook({
      botToken: cfg.telegramBotToken,
      url: webhookUrl,
      secretToken: telegramWebhookSecret(deps.config, merchantId)
    });
    const status = cfg.telegramHandoffChatId ? "bound" : "waiting";
    const updated = deps.repos.updateTelegramBinding(merchantId, { status });
    return { ok: true, webhookUrl, config: maskConfig(updated) };
  } catch (error) {
    deps.repos.updateTelegramBinding(merchantId, { status: "invalid", error: error instanceof Error ? error.message : "telegram webhook setup failed" });
    return reply.code(502).send({ error: error instanceof Error ? error.message : "telegram webhook setup failed" });
  }
}

function bindTelegramUpdate(repos: Repositories, merchantId: string, update: TelegramUpdate) {
  const membership = update.my_chat_member;
  const membershipChat = membership?.chat;
  const membershipStatus = membership?.new_chat_member?.status || "";
  if (membershipChat && isGroupChat(membershipChat)) {
    if (membershipStatus === "left" || membershipStatus === "kicked") {
      const config = repos.updateTelegramBinding(merchantId, {
        chatId: String(membershipChat.id),
        chatTitle: membershipChat.title || "",
        status: "invalid",
        error: "Telegram bot was removed from the handoff group"
      });
      return { ok: true, status: config.telegramHandoffChatStatus, chatId: config.telegramHandoffChatId };
    }
    if (["member", "administrator", "creator"].includes(membershipStatus)) {
      const config = repos.updateTelegramBinding(merchantId, {
        chatId: String(membershipChat.id),
        chatTitle: membershipChat.title || "",
        status: "bound"
      });
      return { ok: true, status: config.telegramHandoffChatStatus, chatId: config.telegramHandoffChatId };
    }
  }

  const messageChat = update.message?.chat;
  if (messageChat && isGroupChat(messageChat)) {
    const config = repos.updateTelegramBinding(merchantId, {
      chatId: String(messageChat.id),
      chatTitle: messageChat.title || "",
      status: "bound"
    });
    return { ok: true, status: config.telegramHandoffChatStatus, chatId: config.telegramHandoffChatId };
  }
  return { ok: true, status: "ignored" };
}

function isGroupChat(chat: TelegramChat): boolean {
  return chat.type === "group" || chat.type === "supergroup";
}

function requestOrigin(request: FastifyRequest): string {
  const proto = String(request.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = request.headers["x-forwarded-host"] || request.headers.host || "localhost";
  return `${proto}://${host}`;
}

function telegramWebhookSecret(config: AppConfig, merchantId: string): string {
  return createHmac("sha256", config.SESSION_SECRET).update(`telegram:${merchantId}`).digest("hex");
}

function verifySecret(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

async function importSamples(request: FastifyRequest, reply: FastifyReply, deps: { repos: Repositories }, merchantId: string) {
  let uploadError = "";
  const file = await request.file().catch((error) => {
    uploadError = error instanceof Error ? error.message : "文件上传失败";
    return undefined;
  });
  if (uploadError) return reply.code(413).send({ error: "文件过大或上传失败", message: "当前单个文件最大支持 100MB，请压缩或拆分后重试。" });
  if (!file) return reply.code(400).send({ error: "file is required" });
  const countryId = deps.repos.defaultCountryId(merchantId);
  const buffer = await file.toBuffer().catch(() => null);
  if (!buffer) return reply.code(413).send({ error: "文件过大或读取失败", message: "当前单个文件最大支持 100MB，请压缩或拆分后重试。" });
  try {
    const samples = await parseTrainingSamples(buffer, file.filename);
    const imported = deps.repos.insertTrainingSamples(samples, merchantId, countryId);
    return { imported, enabled: imported };
  } catch (error) {
    return reply.code(400).send({ error: "invalid training sample file", message: error instanceof Error ? error.message : "unknown parse error" });
  }
}

async function importMaterial(request: FastifyRequest, reply: FastifyReply, deps: { config: AppConfig; repos: Repositories }, merchantId: string) {
  let uploadError = "";
  const file = await request.file().catch((error) => {
    uploadError = error instanceof Error ? error.message : "文件上传失败";
    return undefined;
  });
  if (uploadError) return reply.code(413).send({ error: "文件过大或上传失败", message: "当前单个文件最大支持 100MB，请压缩或拆分后重试。" });
  if (!file) return reply.code(400).send({ error: "file is required" });
  const countryId = deps.repos.defaultCountryId(merchantId);
  const buffer = await file.toBuffer().catch(() => null);
  if (!buffer) return reply.code(413).send({ error: "文件过大或读取失败", message: "当前单个文件最大支持 100MB，请压缩或拆分后重试。" });
  try {
    const merchantConfig = deps.repos.getMerchantConfig(merchantId);
    const parsed = await parseTrainingMaterial({
      buffer,
      filename: file.filename,
      mimeType: file.mimetype,
      googleAiApiKey: merchantConfig.googleAiApiKey || deps.config.GOOGLE_AI_API_KEY,
      googleAiModel: merchantConfig.googleAiModel || deps.config.GOOGLE_AI_MODEL
    });
    const material = deps.repos.createTrainingMaterial({
      merchantId,
      countryId,
      sourceType: parsed.sourceType,
      filename: file.filename,
      mimeType: file.mimetype,
      rawText: parsed.rawText,
      warnings: parsed.warnings
    });

    let sampleCount = 0;
    let knowledgeCount = 0;
    for (const sample of parsed.samples) {
      const created = deps.repos.createTrainingSample(merchantId, sample, countryId);
      sampleCount += 1;
      deps.repos.addTrainingMaterialItem({
        materialId: material.id,
        merchantId,
        countryId,
        kind: "sample",
        sampleId: created.id,
        title: sample.customerMessage.slice(0, 80),
        content: `${sample.customerMessage}\n${sample.standardReply}`,
        intent: sample.intent,
        stage: sample.stage,
        language: sample.language,
        enabled: sample.enabled
      });
    }
    for (const item of parsed.knowledge) {
      const created = deps.repos.createKnowledgeItem(merchantId, { ...item, countryId });
      knowledgeCount += 1;
      deps.repos.addTrainingMaterialItem({
        materialId: material.id,
        merchantId,
        countryId,
        kind: "knowledge",
        knowledgeId: created.id,
        title: item.title,
        content: item.content,
        intent: "unknown",
        stage: "",
        language: item.language,
        enabled: item.enabled
      });
    }

    const finalized = deps.repos.finalizeTrainingMaterial(material.id, merchantId, {
      itemCount: sampleCount + knowledgeCount,
      sampleCount,
      knowledgeCount,
      warnings: parsed.warnings
    });
    return { material: finalized, imported: sampleCount + knowledgeCount, samples: sampleCount, knowledge: knowledgeCount, warnings: finalized.warnings };
  } catch (error) {
    return reply.code(400).send({ error: "invalid training material file", message: error instanceof Error ? error.message : "unknown parse error" });
  }
}

function scopedMerchantId(request: FastifyRequest): string {
  const user = requestUser(request);
  return user.role === "platform_admin" ? "default" : user.merchantId ?? "default";
}

function maskConfig(config: MerchantConfigRecord) {
  const { a2cTokenCacheKey: _cacheKey, a2cAccessToken: _accessToken, a2cTokenExpiresAt: _expiresAt, ...safeConfig } = config;
  return {
    ...safeConfig,
    a2cAppSecret: maskSecret(config.a2cAppSecret),
    openaiApiKey: maskSecret(config.openaiApiKey),
    googleAiApiKey: maskSecret(config.googleAiApiKey),
    telegramBotToken: maskSecret(config.telegramBotToken)
  };
}

function maskSecret(value: string): string {
  if (!value) return "";
  if (value === "CHANGE_ME") return value;
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

function cleanConfigPatch(patch: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === "string" && value.includes("••••")) continue;
    cleaned[key] = value;
  }
  return cleaned;
}

function readMultipartField(fields: unknown, key: string): string {
  if (!fields || typeof fields !== "object") return "";
  const field = (fields as Record<string, unknown>)[key];
  if (!field || typeof field !== "object") return "";
  const value = (field as { value?: unknown }).value;
  return typeof value === "string" ? value : "";
}

function maskUser<T extends { passwordHash?: string }>(user: T): Omit<T, "passwordHash"> {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}

function appConfigForMerchant(config: AppConfig, merchantConfig: MerchantConfigRecord, country?: { platformRegisterUrl?: string; tgRegisterGuideUrl?: string }): AppConfig {
  return {
    ...config,
    A2C_BASE_URL: merchantConfig.a2cBaseUrl || config.A2C_BASE_URL,
    A2C_APP_ID: merchantConfig.a2cAppId || config.A2C_APP_ID,
    A2C_APP_SECRET: merchantConfig.a2cAppSecret || config.A2C_APP_SECRET,
    OPENAI_API_KEY: merchantConfig.openaiApiKey || config.OPENAI_API_KEY,
    OPENAI_MODEL: merchantConfig.openaiModel || config.OPENAI_MODEL,
    GOOGLE_AI_API_KEY: merchantConfig.googleAiApiKey || config.GOOGLE_AI_API_KEY,
    GOOGLE_AI_MODEL: merchantConfig.googleAiModel || config.GOOGLE_AI_MODEL,
    TELEGRAM_BOT_TOKEN: merchantConfig.telegramBotToken || config.TELEGRAM_BOT_TOKEN,
    TELEGRAM_HANDOFF_CHAT_ID: merchantConfig.telegramHandoffChatId || config.TELEGRAM_HANDOFF_CHAT_ID,
    PLATFORM_REGISTER_URL: country?.platformRegisterUrl || merchantConfig.platformRegisterUrl || config.PLATFORM_REGISTER_URL,
    TG_REGISTER_GUIDE_URL: country?.tgRegisterGuideUrl || merchantConfig.tgRegisterGuideUrl || config.TG_REGISTER_GUIDE_URL
  };
}

function a2cAccountAllowed(repos: Repositories, merchantId: string, config: MerchantConfigRecord, apiPhone: string): boolean {
  const enabledAccount = repos.listMerchantA2CAccounts({ merchantId, enabled: true }).some((account) => account.apiPhone === apiPhone);
  if (enabledAccount) return true;
  return config.a2cAccountPhone.split(",").map((item) => item.trim()).filter(Boolean).includes(apiPhone);
}

function auth(config: AppConfig) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.headers["x-api-key"] !== config.INTERNAL_API_KEY) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  };
}
