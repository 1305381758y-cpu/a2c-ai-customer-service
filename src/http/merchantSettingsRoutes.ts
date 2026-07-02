import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { requireUser } from "../auth.js";
import type { AppConfig } from "../config.js";
import type { MerchantConfigRecord, Repositories } from "../repositories.js";
import { registerMerchantA2CAccountRoutes } from "./merchantA2CAccountRoutes.js";
import { registerMerchantConfigCheckRoutes } from "./merchantConfigCheckRoutes.js";
import { registerMerchantCountryRoutes } from "./merchantCountryRoutes.js";
import { registerMerchantInviteCodeRoutes } from "./merchantInviteCodeRoutes.js";
import { registerMerchantTelegramRoutes } from "./merchantTelegramRoutes.js";
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
  registerMerchantConfigCheckRoutes(app, deps);
  registerMerchantCountryRoutes(app, deps);
  registerMerchantInviteCodeRoutes(app, deps);
  registerMerchantA2CAccountRoutes(app, { ...deps, maskConfig });
  registerMerchantTelegramRoutes(app, { ...deps, maskConfig });
}

function registerAdminMerchantSettingsRoutes(app: FastifyInstance, deps: MerchantSettingsRoutesDeps): void {
  app.get<{ Params: { id: string } }>("/api/admin/merchants/:id/config", { preHandler: deps.adminOnly }, async (request) => maskConfig(deps.repos.getMerchantConfig(request.params.id)));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/merchants/:id/config", { preHandler: deps.adminOnly }, async (request) => maskConfig(deps.repos.patchMerchantConfig(request.params.id, cleanConfigPatch(request.body ?? {}))));
  app.get<{ Params: { id: string } }>("/api/admin/merchants/:id/agent-profile", { preHandler: deps.adminOnly }, async (request) => deps.repos.getMerchantAgentProfile(request.params.id));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/merchants/:id/agent-profile", { preHandler: deps.adminOnly }, async (request) => deps.repos.patchMerchantAgentProfile(request.params.id, cleanAgentProfilePatch(request.body ?? {})));
  app.post<{ Params: { id: string } }>("/api/admin/merchants/:id/config/registration-tutorial-image", { preHandler: deps.adminOnly }, async (request, reply) => uploadRegistrationTutorialImage(request, reply, deps, request.params.id));
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
}

function requestOrigin(request: FastifyRequest): string {
  const proto = String(request.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = request.headers["x-forwarded-host"] || request.headers.host || "localhost";
  return `${proto}://${host}`;
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

export function registerStaticFrontendRoute(app: FastifyInstance): void {
  app.get("/*", async (_request, reply) => {
    const indexPath = join(process.cwd(), "dist", "public", "index.html");
    if (existsSync(indexPath)) return reply.type("text/html; charset=utf-8").send(readFileSync(indexPath, "utf8"));
    return reply.type("text/html; charset=utf-8").send("<h1>A2C AI 自动客服</h1><p>服务已在线运行</p>");
  });
}
