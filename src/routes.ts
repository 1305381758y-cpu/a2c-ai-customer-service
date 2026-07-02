import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHmac, timingSafeEqual } from "node:crypto";
import { dirname, extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { A2CClient } from "./clients/a2c.js";
import { aiProviderLabel, deepseekModel, generateAiText, hasUsableAiKey, minimaxModel, selectedAiProvider } from "./clients/aiProvider.js";
import { TelegramClient } from "./clients/telegram.js";
import { hashPassword, requireUser, requestUser } from "./auth.js";
import type { AppConfig } from "./config.js";
import type { MerchantConfigRecord, Repositories } from "./repositories.js";
import type { ConversationEngine } from "./services/conversationEngine.js";
import { generateConversationReview } from "./services/conversationReview.js";
import { appConfigForMerchant } from "./services/runtimeConfig.js";
import { translateForCustomer, translateForOperator } from "./services/translation.js";
import { registerConversationIngressRoutes } from "./http/conversationIngressRoutes.js";
import { requireInternalApiKey as auth } from "./http/internalApiKeyAuth.js";
import { registerAdminUserRoutes } from "./http/adminUserRoutes.js";
import { maskUser } from "./http/routeHelpers.js";
import { registerAuthRoutes } from "./http/authRoutes.js";
import { registerAdminDashboardRoutes } from "./http/adminDashboardRoutes.js";
import { registerAdminTrainingRoutes } from "./http/adminTrainingRoutes.js";
import { registerAdminScriptFlowRoutes } from "./http/adminScriptFlowRoutes.js";
import { registerMerchantScriptFlowRoutes } from "./http/merchantScriptFlowRoutes.js";
import { scopedMerchantId } from "./http/routeHelpers.js";
import { registerMerchantTrainingRoutes } from "./http/merchantTrainingRoutes.js";
import { importSamples } from "./http/trainingImports.js";
import { registerAdminConversationRoutes } from "./http/adminConversationRoutes.js";
import { normalizeConversationExportQuery, sendConversationExport, type ConversationExportQuery } from "./http/conversationExport.js";

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
  app.get<{ Params: { id: string } }>("/api/admin/merchants/:id/config", { preHandler: adminOnly }, async (request) => maskConfig(deps.repos.getMerchantConfig(request.params.id)));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/merchants/:id/config", { preHandler: adminOnly }, async (request) => maskConfig(deps.repos.patchMerchantConfig(request.params.id, cleanConfigPatch(request.body ?? {}))));
  app.get<{ Params: { id: string } }>("/api/admin/merchants/:id/agent-profile", { preHandler: adminOnly }, async (request) => deps.repos.getMerchantAgentProfile(request.params.id));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/merchants/:id/agent-profile", { preHandler: adminOnly }, async (request) => deps.repos.patchMerchantAgentProfile(request.params.id, cleanAgentProfilePatch(request.body ?? {})));
  app.post<{ Params: { id: string } }>("/api/admin/merchants/:id/config/registration-tutorial-image", { preHandler: adminOnly }, async (request, reply) => uploadRegistrationTutorialImage(request, reply, deps, request.params.id));
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

  registerAdminUserRoutes(app, { repos: deps.repos, adminOnly });
  registerAdminTrainingRoutes(app, { repos: deps.repos, adminOnly });
  registerAdminScriptFlowRoutes(app, { repos: deps.repos, adminOnly });
  registerAdminConversationRoutes(app, { config: deps.config, repos: deps.repos, adminOnly });
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
  app.get("/api/merchant/agent-profile", { preHandler: merchantRoles }, async (request) => deps.repos.getMerchantAgentProfile(scopedMerchantId(request)));
  app.patch<{ Body: Record<string, unknown> }>("/api/merchant/agent-profile", { preHandler: merchantAdmins }, async (request) => deps.repos.patchMerchantAgentProfile(scopedMerchantId(request), cleanAgentProfilePatch(request.body ?? {})));
  app.post("/api/merchant/config/registration-tutorial-image", { preHandler: merchantAdmins }, async (request, reply) => uploadRegistrationTutorialImage(request, reply, deps, scopedMerchantId(request)));
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
  registerMerchantTrainingRoutes(app, { config: deps.config, repos: deps.repos, merchantRoles, merchantAdmins });
  registerMerchantScriptFlowRoutes(app, { repos: deps.repos, merchantRoles, merchantAdmins });

  app.get<{ Querystring: { countryId?: string; status?: string; handoffStatus?: string; language?: string; a2cAccountPhone?: string; customerPhone?: string; limit?: string } }>("/api/merchant/conversations", { preHandler: merchantRoles }, async (request) => ({
    rows: deps.repos.listConversations({
      merchantId: scopedMerchantId(request),
      countryId: request.query.countryId,
      status: request.query.status,
      handoffStatus: request.query.handoffStatus,
      language: request.query.language,
      a2cAccountPhone: request.query.a2cAccountPhone,
      customerPhone: request.query.customerPhone,
      limit: request.query.limit ? Number(request.query.limit) : undefined
    })
  }));
  app.get<{ Querystring: ConversationExportQuery }>("/api/merchant/conversations/export", { preHandler: merchantRoles }, async (request, reply) => {
    const rows = deps.repos.exportConversationMessages({
      ...normalizeConversationExportQuery(request.query),
      merchantId: scopedMerchantId(request)
    });
    return sendConversationExport(reply, rows, request.query.format, "merchant-conversations");
  });
  app.get<{ Querystring: { countryId?: string; status?: string; language?: string; limit?: string } }>("/api/merchant/customers", { preHandler: merchantRoles }, async (request) => ({
    rows: deps.repos.listCustomers({
      merchantId: scopedMerchantId(request),
      countryId: request.query.countryId,
      status: request.query.status,
      language: request.query.language,
      limit: request.query.limit ? Number(request.query.limit) : undefined
    })
  }));
  app.get<{ Querystring: { countryId?: string; status?: string; suggestedIntent?: string; limit?: string } }>("/api/merchant/intent-learning", { preHandler: merchantRoles }, async (request) => ({
    rows: deps.repos.listIntentLearningEvents({
      merchantId: scopedMerchantId(request),
      countryId: request.query.countryId,
      status: request.query.status,
      suggestedIntent: request.query.suggestedIntent,
      limit: request.query.limit ? Number(request.query.limit) : undefined
    })
  }));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/intent-learning/:id", { preHandler: merchantAdmins }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "invalid id" });
    const row = deps.repos.patchIntentLearningEvent(id, request.body ?? {}, scopedMerchantId(request));
    if (!row) return reply.code(404).send({ error: "intent learning event not found" });
    return row;
  });
  app.delete<{ Params: { customerKey: string } }>("/api/merchant/customers/:customerKey", { preHandler: merchantAdmins }, async (request, reply) => {
    const result = deps.repos.deleteCustomer(scopedMerchantId(request), decodeURIComponent(request.params.customerKey));
    if (!result.deleted) return reply.code(404).send({ error: "customer not found" });
    return { ok: true, ...result };
  });
  app.post<{ Body: { customerPhone?: string; a2cAccountPhone?: string; nickname?: string; content?: string; msgType?: string; url?: string; caption?: string; fileName?: string } }>("/api/merchant/training-simulator/messages", { preHandler: merchantRoles }, async (request, reply) => {
    const merchantId = scopedMerchantId(request);
    const body = z.object({
      customerPhone: z.string().trim().min(1).optional(),
      a2cAccountPhone: z.string().trim().min(1).optional(),
      nickname: z.string().trim().optional(),
      content: z.string().optional(),
      msgType: z.enum(["text", "image", "video", "audio", "document"]).optional(),
      url: z.string().optional(),
      caption: z.string().optional(),
      fileName: z.string().optional()
    }).parse(request.body ?? {});
    const config = deps.repos.getMerchantConfig(merchantId);
    const accounts = deps.repos.listMerchantA2CAccounts({ merchantId, enabled: true });
    const configuredAccount = config.a2cAccountPhone.split(",").map((item) => item.trim()).find(Boolean);
    const a2cAccountPhone = body.a2cAccountPhone || accounts[0]?.apiPhone || configuredAccount || "simulation-a2c";
    const customerPhone = body.customerPhone || `sim-customer-${Date.now()}`;
    const msgType = body.msgType || (body.url ? "image" : "text");
    const content = body.content || body.caption || "";
    if (msgType === "text" && !content.trim()) return reply.code(400).send({ error: "请输入客户消息" });
    if (msgType !== "text" && !body.url && !content.trim()) return reply.code(400).send({ error: "请输入媒体链接或说明" });
    const now = Math.floor(Date.now() / 1000);
    const messageId = `sim_in:${merchantId}:${customerPhone}:${Date.now()}:${randomUUID().slice(0, 8)}`;
    const result = await deps.conversationEngine.simulateInboundMessage({
      merchantId,
      payload: {
        id: `sim:${messageId}`,
        timestamp: now,
        type: "CUSTOMER_MESSAGE",
        data: {
          messageId,
          content,
          from: customerPhone,
          to: a2cAccountPhone,
          msgType,
          timestamp: now,
          nickname: body.nickname || "模拟客户",
          url: body.url,
          caption: body.caption,
          fileName: body.fileName
        }
      }
    });
    const conversation = result.conversationId ? deps.repos.getConversation(result.conversationId) : undefined;
    return {
      ...result,
      conversation,
      rows: result.conversationId ? deps.repos.listConversationMessages(result.conversationId, 80) : []
    };
  });
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
  app.post<{ Body: { a2cAccountPhone?: string } }>("/api/merchant/conversations/read-all", { preHandler: merchantRoles }, async (request) => {
    return deps.repos.markConversationsRead(scopedMerchantId(request), {
      a2cAccountPhone: String(request.body?.a2cAccountPhone || "").trim() || undefined
    });
  });
  app.post<{ Params: { id: string }; Body: { pinned?: boolean } }>("/api/merchant/conversations/:id/pin", { preHandler: merchantRoles }, async (request, reply) => {
    const row = deps.repos.pinConversation(request.params.id, scopedMerchantId(request), Boolean(request.body?.pinned));
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
  app.get<{ Params: { id: string } }>("/api/merchant/conversations/:id/review", { preHandler: merchantRoles }, async (request, reply) => {
    const conversation = deps.repos.getConversation(request.params.id);
    if (!conversation || conversation.merchantId !== scopedMerchantId(request)) return reply.code(404).send({ error: "conversation not found" });
    return deps.repos.getConversationReview(request.params.id, conversation.merchantId) ?? { review: null, items: [] };
  });
  app.post<{ Params: { id: string } }>("/api/merchant/conversations/:id/review", { preHandler: merchantRoles }, async (request, reply) => {
    const conversation = deps.repos.getConversation(request.params.id);
    if (!conversation || conversation.merchantId !== scopedMerchantId(request)) return reply.code(404).send({ error: "conversation not found" });
    const cfg = deps.repos.getMerchantConfig(conversation.merchantId);
    const runtimeConfig = appConfigForMerchant(deps.config, cfg, deps.repos.getMerchantCountry(conversation.countryId));
    return generateConversationReview(deps.repos, runtimeConfig, conversation.id);
  });
  app.post<{ Params: { id: string }; Body: { itemId?: number; itemIds?: number[] } }>("/api/merchant/conversations/:id/review/apply", { preHandler: merchantAdmins }, async (request, reply) => {
    const conversation = deps.repos.getConversation(request.params.id);
    const merchantId = scopedMerchantId(request);
    if (!conversation || conversation.merchantId !== merchantId) return reply.code(404).send({ error: "conversation not found" });
    const itemIds = Array.isArray(request.body?.itemIds) ? request.body.itemIds : request.body?.itemId ? [request.body.itemId] : [];
    if (!itemIds.length) return reply.code(400).send({ error: "itemId required" });
    const rows = itemIds.map((id) => deps.repos.applyConversationReviewItem(Number(id), merchantId)).filter(Boolean);
    return { rows };
  });
  app.patch<{ Params: { conversationId: string }; Body: { handoffStatus?: "pending" | "processing" | "done" } }>("/api/merchant/handoffs/:conversationId", { preHandler: merchantRoles }, async (request, reply) => {
    const status = request.body?.handoffStatus;
    if (status !== "pending" && status !== "processing" && status !== "done") return reply.code(400).send({ error: "invalid handoffStatus" });
    const row = deps.repos.updateHandoffStatus(request.params.conversationId, scopedMerchantId(request), status);
    if (!row) return reply.code(404).send({ error: "conversation not found" });
    if (status === "done") {
      const cfg = deps.repos.getMerchantConfig(row.merchantId);
      await generateConversationReview(deps.repos, appConfigForMerchant(deps.config, cfg, deps.repos.getMerchantCountry(row.countryId)), row.id).catch((error) => app.log.warn({ err: error }, "conversation review generation failed"));
    }
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
          replyMode: "manual",
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
          replyMode: "manual",
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
    const message = error instanceof Error ? error.message : "A2C accounts sync failed";
    const existingRows = localA2CAccountsForRateLimitFallback(deps.repos, merchantId, cfg);
    if (existingRows.length && isA2CRateLimitMessage(message)) {
      return {
        imported: 0,
        rows: existingRows,
        config: maskConfig(deps.repos.getMerchantConfig(merchantId)),
        stale: true,
        warning: "A2C 当前限制认证请求，已继续使用本地保存的客服账号。请 10 分钟后再刷新账号。"
      };
    }
    return reply.code(502).send({ error: message });
  }
}

function localA2CAccountsForRateLimitFallback(repos: Repositories, merchantId: string, cfg: MerchantConfigRecord) {
  const rows = repos.listMerchantA2CAccounts({ merchantId });
  if (rows.length) return rows;
  const configuredAccounts = cfg.a2cAccountPhone
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((apiPhone) => ({ apiPhone }));
  if (!configuredAccounts.length) return rows;
  return repos.syncMerchantA2CAccounts(merchantId, configuredAccounts);
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

  checks.push(await checkA2C(runtimeConfig, deps.repos, merchantId));
  checks.push(await checkAiProvider(runtimeConfig));
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

async function checkA2C(config: AppConfig, repos: Repositories, merchantId: string): Promise<ConfigCheckItem> {
  if (!config.A2C_APP_ID || !config.A2C_APP_SECRET) {
    return { key: "a2c", label: "A2C", ok: false, status: "missing", detail: "缺少 A2C App ID 或密钥" };
  }
  const client = new A2CClient(config, repos.a2cTokenStore(merchantId));
  try {
    const accounts = await client.listAccounts();
    const rows = repos.syncMerchantA2CAccounts(merchantId, accounts);
    const enabledCount = rows.filter((account) => account.enabled).length;
    return {
      key: "a2c",
      label: "A2C",
      ok: true,
      status: "ok",
      detail: `已实时请求 A2C，认证正常；拉取到 ${rows.length} 个客服账号，其中 ${enabledCount} 个启用。`
    };
  } catch (error) {
    const localAccounts = repos.listMerchantA2CAccounts({ merchantId, enabled: true });
    const suffix = localAccounts.length ? ` 本地仍保存 ${localAccounts.length} 个启用客服账号，可继续用于已有收发；但实时检测未通过。` : "";
    return {
      key: "a2c",
      label: "A2C",
      ok: false,
      status: "error",
      detail: `${error instanceof Error ? error.message : "A2C 实时检测失败"}${suffix}`
    };
  }
}

function isA2CRateLimitMessage(message: string): boolean {
  return /(visit too frequently|too frequent|rate limit|too many requests|请求.*频繁|访问.*频繁|稍后再试|频繁)/i.test(message);
}

async function checkAiProvider(config: AppConfig): Promise<ConfigCheckItem> {
  if (!hasUsableAiKey(config)) return { key: "ai", label: "AI供应商", ok: false, status: "missing", detail: `缺少 ${aiProviderLabel(config)} Key，客户消息会降级使用样本/默认话术` };
  try {
    await generateAiText(config, "Reply with OK only.");
    const provider = selectedAiProvider(config);
    const model = provider === "minimax" ? minimaxModel(config) : provider === "deepseek" ? deepseekModel(config) : config.GOOGLE_AI_MODEL;
    return { key: "ai", label: "AI供应商", ok: true, status: "ok", detail: `${aiProviderLabel(config)} 可用，当前模型 ${model}；客户消息会优先调用 AI 回复` };
  } catch (error) {
    return { key: "ai", label: "AI供应商", ok: false, status: "error", detail: error instanceof Error ? error.message : "AI供应商检测失败" };
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

async function uploadRegistrationTutorialImage(request: FastifyRequest, reply: FastifyReply, deps: { config: AppConfig; repos: Repositories }, merchantId: string) {
  let uploadError = "";
  const file = await request.file().catch((error) => {
    uploadError = error instanceof Error ? error.message : "图片上传失败";
    return undefined;
  });
  if (uploadError) return reply.code(413).send({ error: "图片过大或上传失败", message: "注册教程图片上传失败，请压缩后重试。" });
  if (!file) return reply.code(400).send({ error: "请上传注册教程图片" });
  if (!isAllowedTutorialImage(file.filename, file.mimetype)) {
    return reply.code(400).send({ error: "只支持图片文件", message: "请上传 PNG、JPG、JPEG、WEBP 或 GIF 图片。" });
  }
  const buffer = await file.toBuffer().catch(() => null);
  if (!buffer) return reply.code(413).send({ error: "图片过大或读取失败", message: "注册教程图片读取失败，请压缩后重试。" });
  const ext = tutorialImageExtension(file.filename, file.mimetype);
  const uploadDir = registrationUploadDir(deps.config);
  mkdirSync(uploadDir, { recursive: true });
  const filename = `${merchantId.replace(/[^a-zA-Z0-9_-]/g, "_")}-${Date.now()}-${randomUUID()}${ext}`;
  writeFileSync(join(uploadDir, filename), buffer);
  const imageUrl = `${requestOrigin(request)}/uploads/${encodeURIComponent(filename)}`;
  const config = deps.repos.patchMerchantConfig(merchantId, { registrationTutorialImageUrl: imageUrl });
  return { ok: true, imageUrl, config: maskConfig(config) };
}

function registrationUploadDir(config: AppConfig): string {
  return config.DATABASE_URL === ":memory:" ? join(process.cwd(), "data", "uploads") : join(dirname(resolve(config.DATABASE_URL)), "uploads");
}

function isAllowedTutorialImage(filename: string, mimeType = ""): boolean {
  const mime = mimeType.toLowerCase();
  const name = filename.toLowerCase();
  return /^(image\/)(png|jpe?g|webp|gif)$/.test(mime) || /\.(png|jpe?g|webp|gif)$/i.test(name);
}

function tutorialImageExtension(filename: string, mimeType = ""): string {
  const ext = extname(filename).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext)) return ext;
  const mime = mimeType.toLowerCase();
  if (mime.includes("png")) return ".png";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("gif")) return ".gif";
  return ".jpg";
}

function maskConfig(config: MerchantConfigRecord) {
  const { a2cTokenCacheKey: _cacheKey, a2cAccessToken: _accessToken, a2cTokenExpiresAt: _expiresAt, ...safeConfig } = config;
  return {
    ...safeConfig,
    a2cAppSecret: maskSecret(config.a2cAppSecret),
    openaiApiKey: maskSecret(config.openaiApiKey),
    minimaxApiKey: maskSecret(config.minimaxApiKey),
    deepseekApiKey: maskSecret(config.deepseekApiKey),
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

function cleanAgentProfilePatch(patch: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set([
    "agentName",
    "roleDefinition",
    "toneStyle",
    "coreGoal",
    "mustFollow",
    "forbidden",
    "uncertaintyPolicy",
    "handoffPolicy",
    "enabled"
  ]);
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key)) continue;
    cleaned[key] = key === "enabled" ? Boolean(value) : String(value ?? "").trim();
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

function a2cAccountAllowed(repos: Repositories, merchantId: string, config: MerchantConfigRecord, apiPhone: string): boolean {
  const enabledAccount = repos.listMerchantA2CAccounts({ merchantId, enabled: true }).some((account) => account.apiPhone === apiPhone);
  if (enabledAccount) return true;
  return config.a2cAccountPhone.split(",").map((item) => item.trim()).filter(Boolean).includes(apiPhone);
}
