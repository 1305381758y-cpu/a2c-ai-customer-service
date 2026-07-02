import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { requireUser } from "../auth.js";
import { A2CClient } from "../clients/a2c.js";
import { aiProviderLabel, deepseekModel, generateAiText, hasUsableAiKey, minimaxModel, selectedAiProvider } from "../clients/aiProvider.js";
import { TelegramClient } from "../clients/telegram.js";
import type { AppConfig } from "../config.js";
import type { MerchantConfigRecord, Repositories } from "../repositories.js";
import { appConfigForMerchant } from "../services/runtimeConfig.js";
import { registerMerchantCountryRoutes } from "./merchantCountryRoutes.js";
import { scopedMerchantId } from "./routeHelpers.js";

type MerchantSettingsRoutesDeps = {
  config: AppConfig;
  repos: Repositories;
  adminOnly: ReturnType<typeof requireUser>;
  merchantRoles: ReturnType<typeof requireUser>;
  merchantAdmins: ReturnType<typeof requireUser>;
};

export function registerMerchantSettingsRoutes(app: FastifyInstance, deps: MerchantSettingsRoutesDeps): void {
  registerAdminMerchantSettingsRoutes(app, deps);
  registerMerchantOwnSettingsRoutes(app, deps);
  registerMerchantCountryRoutes(app, deps);
}

function registerAdminMerchantSettingsRoutes(app: FastifyInstance, deps: MerchantSettingsRoutesDeps): void {
  app.get<{ Params: { id: string } }>("/api/admin/merchants/:id/config", { preHandler: deps.adminOnly }, async (request) => maskConfig(deps.repos.getMerchantConfig(request.params.id)));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/merchants/:id/config", { preHandler: deps.adminOnly }, async (request) => maskConfig(deps.repos.patchMerchantConfig(request.params.id, cleanConfigPatch(request.body ?? {}))));
  app.get<{ Params: { id: string } }>("/api/admin/merchants/:id/agent-profile", { preHandler: deps.adminOnly }, async (request) => deps.repos.getMerchantAgentProfile(request.params.id));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/merchants/:id/agent-profile", { preHandler: deps.adminOnly }, async (request) => deps.repos.patchMerchantAgentProfile(request.params.id, cleanAgentProfilePatch(request.body ?? {})));
  app.post<{ Params: { id: string } }>("/api/admin/merchants/:id/config/registration-tutorial-image", { preHandler: deps.adminOnly }, async (request, reply) => uploadRegistrationTutorialImage(request, reply, deps, request.params.id));
  app.get<{ Params: { id: string } }>("/api/admin/merchants/:id/config/check", { preHandler: deps.adminOnly }, async (request, reply) => checkMerchantConfig(reply, deps, request.params.id));

  app.get<{ Params: { id: string } }>("/api/admin/merchants/:id/a2c/accounts", { preHandler: deps.adminOnly }, async (request) => ({ rows: deps.repos.listMerchantA2CAccounts({ merchantId: request.params.id }) }));
  app.post<{ Params: { id: string } }>("/api/admin/merchants/:id/a2c/accounts/sync", { preHandler: deps.adminOnly }, async (request, reply) => syncA2CAccounts(request, reply, deps, request.params.id));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/a2c/accounts/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "invalid id" });
    const row = deps.repos.patchMerchantA2CAccount(id, request.body ?? {});
    if (!row) return reply.code(404).send({ error: "a2c account not found" });
    return { row, config: maskConfig(deps.repos.getMerchantConfig(row.merchantId)) };
  });

  app.get<{ Params: { id: string } }>("/api/admin/a2c/accounts/:id/invite-codes", { preHandler: deps.adminOnly }, async (request, reply) => listInviteCodes(request, reply, deps.repos));
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/a2c/accounts/:id/invite-codes", { preHandler: deps.adminOnly }, async (request, reply) => createInviteCode(request, reply, deps.repos));
  app.post<{ Params: { id: string }; Body: { codes?: string; registerUrl?: string } }>("/api/admin/a2c/accounts/:id/invite-codes/import", { preHandler: deps.adminOnly }, async (request, reply) => importInviteCodes(request, reply, deps.repos));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/invite-codes/:id", { preHandler: deps.adminOnly }, async (request, reply) => patchInviteCode(request, reply, deps.repos));
  app.delete<{ Params: { id: string } }>("/api/admin/invite-codes/:id", { preHandler: deps.adminOnly }, async (request, reply) => deleteInviteCode(request, reply, deps.repos));
  app.post<{ Params: { id: string } }>("/api/admin/merchants/:id/telegram/setup-webhook", { preHandler: deps.adminOnly }, async (request, reply) => setupTelegramWebhook(request, reply, deps, request.params.id));
}

function registerMerchantOwnSettingsRoutes(app: FastifyInstance, deps: MerchantSettingsRoutesDeps): void {
  app.get("/api/merchant/dashboard", { preHandler: deps.merchantRoles }, async (request) => {
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

  app.get("/api/merchant/config", { preHandler: deps.merchantRoles }, async (request) => maskConfig(deps.repos.getMerchantConfig(scopedMerchantId(request))));
  app.patch<{ Body: Record<string, unknown> }>("/api/merchant/config", { preHandler: deps.merchantAdmins }, async (request) => maskConfig(deps.repos.patchMerchantConfig(scopedMerchantId(request), cleanConfigPatch(request.body ?? {}))));
  app.get("/api/merchant/agent-profile", { preHandler: deps.merchantRoles }, async (request) => deps.repos.getMerchantAgentProfile(scopedMerchantId(request)));
  app.patch<{ Body: Record<string, unknown> }>("/api/merchant/agent-profile", { preHandler: deps.merchantAdmins }, async (request) => deps.repos.patchMerchantAgentProfile(scopedMerchantId(request), cleanAgentProfilePatch(request.body ?? {})));
  app.post("/api/merchant/config/registration-tutorial-image", { preHandler: deps.merchantAdmins }, async (request, reply) => uploadRegistrationTutorialImage(request, reply, deps, scopedMerchantId(request)));
  app.get("/api/merchant/config/check", { preHandler: deps.merchantRoles }, async (request, reply) => checkMerchantConfig(reply, deps, scopedMerchantId(request)));

  app.get("/api/merchant/a2c/accounts", { preHandler: deps.merchantRoles }, async (request) => ({ rows: deps.repos.listMerchantA2CAccounts({ merchantId: scopedMerchantId(request) }) }));
  app.post("/api/merchant/a2c/accounts/sync", { preHandler: deps.merchantAdmins }, async (request, reply) => syncA2CAccounts(request, reply, deps, scopedMerchantId(request)));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/a2c/accounts/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "invalid id" });
    const row = deps.repos.patchMerchantA2CAccount(id, request.body ?? {}, scopedMerchantId(request));
    if (!row) return reply.code(404).send({ error: "a2c account not found" });
    return { row, config: maskConfig(deps.repos.getMerchantConfig(row.merchantId)) };
  });

  app.get<{ Params: { id: string } }>("/api/merchant/a2c/accounts/:id/invite-codes", { preHandler: deps.merchantRoles }, async (request, reply) => listInviteCodes(request, reply, deps.repos, scopedMerchantId(request)));
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/a2c/accounts/:id/invite-codes", { preHandler: deps.merchantAdmins }, async (request, reply) => createInviteCode(request, reply, deps.repos, scopedMerchantId(request)));
  app.post<{ Params: { id: string }; Body: { codes?: string; registerUrl?: string } }>("/api/merchant/a2c/accounts/:id/invite-codes/import", { preHandler: deps.merchantAdmins }, async (request, reply) => importInviteCodes(request, reply, deps.repos, scopedMerchantId(request)));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/invite-codes/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => patchInviteCode(request, reply, deps.repos, scopedMerchantId(request)));
  app.delete<{ Params: { id: string } }>("/api/merchant/invite-codes/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => deleteInviteCode(request, reply, deps.repos, scopedMerchantId(request)));
  app.post("/api/merchant/telegram/setup-webhook", { preHandler: deps.merchantAdmins }, async (request, reply) => setupTelegramWebhook(request, reply, deps, scopedMerchantId(request)));
}

export function registerTelegramWebhookRoutes(app: FastifyInstance, deps: { config: AppConfig; repos: Repositories }): void {
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
}

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

export function registerStaticFrontendRoute(app: FastifyInstance): void {
  app.get("/*", async (_request, reply) => {
    const indexPath = join(process.cwd(), "dist", "public", "index.html");
    if (existsSync(indexPath)) return reply.type("text/html; charset=utf-8").send(readFileSync(indexPath, "utf8"));
    return reply.type("text/html; charset=utf-8").send("<h1>A2C AI 自动客服</h1><p>服务已在线运行</p>");
  });
}
