import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { requireUser } from "../auth.js";
import type { AppConfig } from "../config.js";
import type { Repositories } from "../repositories.js";
import { buildMerchantDashboard } from "../services/merchantDashboard.js";
import {
  getMaskedMerchantConfig,
  getMerchantAgentProfile,
  maskConfig,
  patchMaskedMerchantConfig,
  patchMerchantAgentProfile
} from "../services/merchantSettings.js";
import { registerMerchantA2CAccountRoutes } from "./merchantA2CAccountRoutes.js";
import { registerMerchantConfigCheckRoutes } from "./merchantConfigCheckRoutes.js";
import { registerMerchantCountryRoutes } from "./merchantCountryRoutes.js";
import { registerMerchantInviteCodeRoutes } from "./merchantInviteCodeRoutes.js";
import { registerMerchantRegistrationTutorialRoutes } from "./merchantRegistrationTutorialRoutes.js";
import { registerMerchantTelegramRoutes } from "./merchantTelegramRoutes.js";
import { scopedMerchantId } from "./routeHelpers.js";
import { sendResult } from "./routeResponses.js";

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
  app.get<{ Params: { id: string } }>("/api/admin/merchants/:id/config", { preHandler: deps.adminOnly }, async (request) =>
    getMaskedMerchantConfig(deps.repos, request.params.id)
  );
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/merchants/:id/config", { preHandler: deps.adminOnly }, async (request, reply) =>
    sendResult(reply, patchMaskedMerchantConfig(deps.repos, request.params.id, request.body ?? {}))
  );
  app.get<{ Params: { id: string } }>("/api/admin/merchants/:id/agent-profile", { preHandler: deps.adminOnly }, async (request) =>
    getMerchantAgentProfile(deps.repos, request.params.id)
  );
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/merchants/:id/agent-profile", { preHandler: deps.adminOnly }, async (request) =>
    patchMerchantAgentProfile(deps.repos, request.params.id, request.body ?? {})
  );
}

function registerMerchantOwnSettingsRoutes(app: FastifyInstance, deps: MerchantSettingsRoutesDeps): void {
  app.get<{ Querystring: { startAt?: string; endAt?: string; timeZone?: string } }>("/api/merchant/dashboard", { preHandler: deps.merchantRoles }, async (request) => buildMerchantDashboard(deps.repos, scopedMerchantId(request), request.query));

  app.get("/api/merchant/config", { preHandler: deps.merchantRoles }, async (request) =>
    getMaskedMerchantConfig(deps.repos, scopedMerchantId(request))
  );
  app.patch<{ Body: Record<string, unknown> }>("/api/merchant/config", { preHandler: deps.merchantAdmins }, async (request, reply) =>
    sendResult(reply, patchMaskedMerchantConfig(deps.repos, scopedMerchantId(request), request.body ?? {}))
  );
  app.get("/api/merchant/agent-profile", { preHandler: deps.merchantRoles }, async (request) =>
    getMerchantAgentProfile(deps.repos, scopedMerchantId(request))
  );
  app.patch<{ Body: Record<string, unknown> }>("/api/merchant/agent-profile", { preHandler: deps.merchantAdmins }, async (request) =>
    patchMerchantAgentProfile(deps.repos, scopedMerchantId(request), request.body ?? {})
  );
}

export function registerStaticFrontendRoute(app: FastifyInstance): void {
  app.get("/*", async (_request, reply) => {
    const indexPath = join(process.cwd(), "dist", "public", "index.html");
    if (existsSync(indexPath)) return reply.type("text/html; charset=utf-8").send(readFileSync(indexPath, "utf8"));
    return reply.type("text/html; charset=utf-8").send("<h1>A2C 智能客服</h1><p>服务已在线运行</p>");
  });
}
