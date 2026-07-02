import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { requireUser } from "../auth.js";
import type { AppConfig } from "../config.js";
import type { MerchantConfigRecord, Repositories } from "../repositories.js";
import { buildMerchantDashboard } from "../services/merchantDashboard.js";
import { registerMerchantA2CAccountRoutes } from "./merchantA2CAccountRoutes.js";
import { registerMerchantConfigCheckRoutes } from "./merchantConfigCheckRoutes.js";
import { registerMerchantCountryRoutes } from "./merchantCountryRoutes.js";
import { registerMerchantInviteCodeRoutes } from "./merchantInviteCodeRoutes.js";
import { registerMerchantRegistrationTutorialRoutes } from "./merchantRegistrationTutorialRoutes.js";
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
  registerMerchantRegistrationTutorialRoutes(app, { ...deps, maskConfig });
  registerMerchantA2CAccountRoutes(app, { ...deps, maskConfig });
  registerMerchantTelegramRoutes(app, { ...deps, maskConfig });
}

function registerAdminMerchantSettingsRoutes(app: FastifyInstance, deps: MerchantSettingsRoutesDeps): void {
  app.get<{ Params: { id: string } }>("/api/admin/merchants/:id/config", { preHandler: deps.adminOnly }, async (request) => maskConfig(deps.repos.getMerchantConfig(request.params.id)));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/merchants/:id/config", { preHandler: deps.adminOnly }, async (request) => maskConfig(deps.repos.patchMerchantConfig(request.params.id, cleanConfigPatch(request.body ?? {}))));
  app.get<{ Params: { id: string } }>("/api/admin/merchants/:id/agent-profile", { preHandler: deps.adminOnly }, async (request) => deps.repos.getMerchantAgentProfile(request.params.id));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/merchants/:id/agent-profile", { preHandler: deps.adminOnly }, async (request) => deps.repos.patchMerchantAgentProfile(request.params.id, cleanAgentProfilePatch(request.body ?? {})));
}

function registerMerchantOwnSettingsRoutes(app: FastifyInstance, deps: MerchantSettingsRoutesDeps): void {
  app.get("/api/merchant/dashboard", { preHandler: deps.merchantRoles }, async (request) => buildMerchantDashboard(deps.repos, scopedMerchantId(request)));

  app.get("/api/merchant/config", { preHandler: deps.merchantRoles }, async (request) => maskConfig(deps.repos.getMerchantConfig(scopedMerchantId(request))));
  app.patch<{ Body: Record<string, unknown> }>("/api/merchant/config", { preHandler: deps.merchantAdmins }, async (request) => maskConfig(deps.repos.patchMerchantConfig(scopedMerchantId(request), cleanConfigPatch(request.body ?? {}))));
  app.get("/api/merchant/agent-profile", { preHandler: deps.merchantRoles }, async (request) => deps.repos.getMerchantAgentProfile(scopedMerchantId(request)));
  app.patch<{ Body: Record<string, unknown> }>("/api/merchant/agent-profile", { preHandler: deps.merchantAdmins }, async (request) => deps.repos.patchMerchantAgentProfile(scopedMerchantId(request), cleanAgentProfilePatch(request.body ?? {})));
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
