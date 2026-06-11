import { existsSync, readFileSync } from "node:fs";
import { createHmac, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { A2CClient } from "./clients/a2c.js";
import { TelegramClient } from "./clients/telegram.js";
import { clearSessionCookie, createSessionToken, hashPassword, requireUser, requestUser, setSessionCookie, toSessionUser, verifyPassword } from "./auth.js";
import { parseTrainingSamples } from "./import/trainingSamples.js";
import { parseTrainingMaterial } from "./import/trainingMaterials.js";
import type { AppConfig } from "./config.js";
import type { MerchantConfigRecord, Repositories } from "./repositories.js";
import type { WebhookProcessor } from "./services/webhookProcessor.js";

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
  app.post("/api/admin/merchants", { preHandler: adminOnly }, async (request) => {
    const body = z.object({ name: z.string().min(1) }).parse(request.body);
    return deps.repos.createMerchant(body.name);
  });
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/merchants/:id", { preHandler: adminOnly }, async (request, reply) => {
    const merchant = deps.repos.patchMerchant(request.params.id, request.body ?? {});
    if (!merchant) return reply.code(404).send({ error: "merchant not found" });
    return merchant;
  });
  app.get<{ Params: { id: string } }>("/api/admin/merchants/:id/config", { preHandler: adminOnly }, async (request) => maskConfig(deps.repos.getMerchantConfig(request.params.id)));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/merchants/:id/config", { preHandler: adminOnly }, async (request) => maskConfig(deps.repos.patchMerchantConfig(request.params.id, cleanConfigPatch(request.body ?? {}))));
  app.get<{ Params: { id: string } }>("/api/admin/merchants/:id/a2c/accounts", { preHandler: adminOnly }, async (request) => ({ rows: deps.repos.listMerchantA2CAccounts({ merchantId: request.params.id }) }));
  app.post<{ Params: { id: string } }>("/api/admin/merchants/:id/a2c/accounts/sync", { preHandler: adminOnly }, async (request, reply) => syncA2CAccounts(request, reply, deps, request.params.id));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/a2c/accounts/:id", { preHandler: adminOnly }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "invalid id" });
    const row = deps.repos.patchMerchantA2CAccount(id, request.body ?? {});
    if (!row) return reply.code(404).send({ error: "a2c account not found" });
    return { row, config: maskConfig(deps.repos.getMerchantConfig(row.merchantId)) };
  });
  app.post<{ Params: { id: string } }>("/api/admin/merchants/:id/telegram/setup-webhook", { preHandler: adminOnly }, async (request, reply) => setupTelegramWebhook(request, reply, deps, request.params.id));

  app.get<{ Querystring: { merchantId?: string } }>("/api/admin/users", { preHandler: adminOnly }, async (request) => ({
    rows: deps.repos.listUsers({ merchantId: request.query.merchantId }).map(maskUser)
  }));
  app.get<{ Querystring: { merchantId?: string; type?: string; enabled?: string } }>("/api/admin/knowledge", { preHandler: adminOnly }, async (request) => ({
    rows: deps.repos.listKnowledgeItems({
      merchantId: request.query.merchantId,
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
  app.get<{ Querystring: { merchantId?: string; language?: string; intent?: string; stage?: string; enabled?: string } }>("/api/admin/training-samples", { preHandler: adminOnly }, async (request) => ({
    rows: deps.repos.listTrainingSamples({
      merchantId: request.query.merchantId,
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
  app.get<{ Querystring: { merchantId?: string; sourceType?: string; status?: string; limit?: string } }>("/api/admin/training-materials", { preHandler: adminOnly }, async (request) => ({
    rows: deps.repos.listTrainingMaterials({
      merchantId: request.query.merchantId,
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
  app.get<{ Querystring: { merchantId?: string; status?: string; handoffStatus?: string; language?: string; limit?: string } }>("/api/admin/conversations", { preHandler: adminOnly }, async (request) => ({
    rows: deps.repos.listConversations({
      merchantId: request.query.merchantId,
      status: request.query.status,
      handoffStatus: request.query.handoffStatus,
      language: request.query.language,
      limit: request.query.limit ? Number(request.query.limit) : undefined
    })
  }));
  app.get<{ Querystring: { merchantId?: string; status?: string; language?: string; limit?: string } }>("/api/admin/customers", { preHandler: adminOnly }, async (request) => ({
    rows: deps.repos.listCustomers({
      merchantId: request.query.merchantId,
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
  app.get("/api/merchant/a2c/accounts", { preHandler: merchantRoles }, async (request) => ({ rows: deps.repos.listMerchantA2CAccounts({ merchantId: scopedMerchantId(request) }) }));
  app.post("/api/merchant/a2c/accounts/sync", { preHandler: merchantAdmins }, async (request, reply) => syncA2CAccounts(request, reply, deps, scopedMerchantId(request)));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/a2c/accounts/:id", { preHandler: merchantAdmins }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "invalid id" });
    const row = deps.repos.patchMerchantA2CAccount(id, request.body ?? {}, scopedMerchantId(request));
    if (!row) return reply.code(404).send({ error: "a2c account not found" });
    return { row, config: maskConfig(deps.repos.getMerchantConfig(row.merchantId)) };
  });
  app.post("/api/merchant/telegram/setup-webhook", { preHandler: merchantAdmins }, async (request, reply) => setupTelegramWebhook(request, reply, deps, scopedMerchantId(request)));
  app.get<{ Querystring: { type?: string; enabled?: string } }>("/api/merchant/knowledge", { preHandler: merchantRoles }, async (request) => ({
    rows: deps.repos.listKnowledgeItems({
      merchantId: scopedMerchantId(request),
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

  app.post("/api/merchant/training-samples/import", { preHandler: merchantRoles }, async (request, reply) => importSamples(request, reply, deps, scopedMerchantId(request)));
  app.post("/api/merchant/training-materials/import", { preHandler: merchantRoles }, async (request, reply) => importMaterial(request, reply, deps, scopedMerchantId(request)));
  app.get<{ Querystring: { sourceType?: string; status?: string; limit?: string } }>("/api/merchant/training-materials", { preHandler: merchantRoles }, async (request) => ({
    rows: deps.repos.listTrainingMaterials({
      merchantId: scopedMerchantId(request),
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
  app.get<{ Querystring: { language?: string; intent?: string; stage?: string; enabled?: string } }>("/api/merchant/training-samples", { preHandler: merchantRoles }, async (request) => ({
    rows: deps.repos.listTrainingSamples({
      merchantId: scopedMerchantId(request),
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

  app.get<{ Querystring: { status?: string; handoffStatus?: string; language?: string; limit?: string } }>("/api/merchant/conversations", { preHandler: merchantRoles }, async (request) => ({
    rows: deps.repos.listConversations({
      merchantId: scopedMerchantId(request),
      status: request.query.status,
      handoffStatus: request.query.handoffStatus,
      language: request.query.language,
      limit: request.query.limit ? Number(request.query.limit) : undefined
    })
  }));
  app.get<{ Querystring: { status?: string; language?: string; limit?: string } }>("/api/merchant/customers", { preHandler: merchantRoles }, async (request) => ({
    rows: deps.repos.listCustomers({
      merchantId: scopedMerchantId(request),
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
    const client = new A2CClient(appConfigForMerchant(deps.config, cfg));
    try {
      const externalId = await client.sendMessage({
        to: conversation.customerPhone,
        senderPhoneNumber: conversation.a2cAccountPhone,
        type: request.body?.type ?? "text",
        content: request.body?.content,
        url: request.body?.url,
        caption: request.body?.caption,
        fileName: request.body?.fileName
      });
      deps.repos.insertMessage({
        conversationId: conversation.id,
        direction: "outbound",
        externalId,
        content: request.body?.content || request.body?.caption || request.body?.url || "",
        msgType: request.body?.type ?? "text",
        language: conversation.language,
        intent: "unknown",
        rawPayload: { manual: true }
      });
      return { externalId };
    } catch (error) {
      return reply.code(502).send({ error: error instanceof Error ? error.message : "send failed" });
    }
  });

  app.post("/internal/training-samples/import", { preHandler: auth(deps.config) }, async (request, reply) => importSamples(request, reply, deps, "default"));
  app.get<{ Querystring: { language?: string; intent?: string; stage?: string; enabled?: string } }>("/internal/training-samples", { preHandler: auth(deps.config) }, async (request) => ({
    rows: deps.repos.listTrainingSamples({
      language: request.query.language,
      intent: request.query.intent,
      stage: request.query.stage,
      enabled: request.query.enabled === undefined ? undefined : request.query.enabled === "true" || request.query.enabled === "1"
    })
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

  app.post("/webhooks/a2c", async (request, reply) => {
    const result = await deps.processor.process(request.body as never);
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

async function syncA2CAccounts(request: FastifyRequest, reply: FastifyReply, deps: { config: AppConfig; repos: Repositories }, merchantId: string) {
  const merchant = deps.repos.getMerchant(merchantId);
  if (!merchant) return reply.code(404).send({ error: "merchant not found" });
  const cfg = deps.repos.getMerchantConfig(merchantId);
  const client = new A2CClient(appConfigForMerchant(deps.config, cfg));
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
  const file = await request.file();
  if (!file) return reply.code(400).send({ error: "file is required" });
  const buffer = await file.toBuffer();
  try {
    const samples = await parseTrainingSamples(buffer, file.filename);
    const imported = deps.repos.insertTrainingSamples(samples, merchantId);
    return { imported, enabled: imported };
  } catch (error) {
    return reply.code(400).send({ error: "invalid training sample file", message: error instanceof Error ? error.message : "unknown parse error" });
  }
}

async function importMaterial(request: FastifyRequest, reply: FastifyReply, deps: { config: AppConfig; repos: Repositories }, merchantId: string) {
  const file = await request.file();
  if (!file) return reply.code(400).send({ error: "file is required" });
  const buffer = await file.toBuffer();
  try {
    const merchantConfig = deps.repos.getMerchantConfig(merchantId);
    const parsed = await parseTrainingMaterial({
      buffer,
      filename: file.filename,
      mimeType: file.mimetype,
      openaiApiKey: merchantConfig.openaiApiKey || deps.config.OPENAI_API_KEY,
      openaiModel: merchantConfig.openaiModel || deps.config.OPENAI_MODEL
    });
    const material = deps.repos.createTrainingMaterial({
      merchantId,
      sourceType: parsed.sourceType,
      filename: file.filename,
      mimeType: file.mimetype,
      rawText: parsed.rawText,
      warnings: parsed.warnings
    });

    let sampleCount = 0;
    let knowledgeCount = 0;
    for (const sample of parsed.samples) {
      const created = deps.repos.createTrainingSample(merchantId, sample);
      sampleCount += 1;
      deps.repos.addTrainingMaterialItem({
        materialId: material.id,
        merchantId,
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
      const created = deps.repos.createKnowledgeItem(merchantId, item);
      knowledgeCount += 1;
      deps.repos.addTrainingMaterialItem({
        materialId: material.id,
        merchantId,
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
  return {
    ...config,
    a2cAppSecret: maskSecret(config.a2cAppSecret),
    openaiApiKey: maskSecret(config.openaiApiKey),
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

function maskUser<T extends { passwordHash?: string }>(user: T): Omit<T, "passwordHash"> {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}

function appConfigForMerchant(config: AppConfig, merchantConfig: MerchantConfigRecord): AppConfig {
  return {
    ...config,
    A2C_BASE_URL: merchantConfig.a2cBaseUrl || config.A2C_BASE_URL,
    A2C_APP_ID: merchantConfig.a2cAppId || config.A2C_APP_ID,
    A2C_APP_SECRET: merchantConfig.a2cAppSecret || config.A2C_APP_SECRET,
    OPENAI_API_KEY: merchantConfig.openaiApiKey || config.OPENAI_API_KEY,
    OPENAI_MODEL: merchantConfig.openaiModel || config.OPENAI_MODEL,
    TELEGRAM_BOT_TOKEN: merchantConfig.telegramBotToken || config.TELEGRAM_BOT_TOKEN,
    TELEGRAM_HANDOFF_CHAT_ID: merchantConfig.telegramHandoffChatId || config.TELEGRAM_HANDOFF_CHAT_ID,
    PLATFORM_REGISTER_URL: merchantConfig.platformRegisterUrl || config.PLATFORM_REGISTER_URL,
    TG_REGISTER_GUIDE_URL: merchantConfig.tgRegisterGuideUrl || config.TG_REGISTER_GUIDE_URL
  };
}

function auth(config: AppConfig) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.headers["x-api-key"] !== config.INTERNAL_API_KEY) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  };
}
