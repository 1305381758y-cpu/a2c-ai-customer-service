import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { requireUser } from "../auth.js";
import type { AppConfig } from "../config.js";
import type { Repositories } from "../repositories.js";
import { buildMerchantDashboard } from "../services/merchantDashboard.js";
import {
  getMaskedMerchantConfig,
  getMerchantVisibleConfig,
  getMerchantAgentProfile,
  listMerchantAgentProfileVersions,
  listMerchantConfigVersions,
  maskConfig,
  patchMaskedMerchantConfig,
  patchMerchantVisibleConfig,
  patchMerchantAgentProfile,
  restoreMerchantAgentProfileVersion,
  restoreMerchantConfigVersion,
  restoreMerchantVisibleConfigVersion
} from "../services/merchantSettings.js";
import { registerMerchantA2CAccountRoutes } from "./merchantA2CAccountRoutes.js";
import { registerMerchantConfigCheckRoutes } from "./merchantConfigCheckRoutes.js";
import { registerMerchantCountryRoutes } from "./merchantCountryRoutes.js";
import { registerMerchantInviteCodeRoutes } from "./merchantInviteCodeRoutes.js";
import { registerMerchantRegistrationTutorialRoutes } from "./merchantRegistrationTutorialRoutes.js";
import { registerMerchantTelegramRoutes } from "./merchantTelegramRoutes.js";
import { scopedMerchantId } from "./routeHelpers.js";
import { sendResult } from "./routeResponses.js";
import { requestUser } from "../auth.js";

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
    sendResult(reply, patchMaskedMerchantConfig(deps.repos, request.params.id, request.body ?? {}, requestUser(request).name))
  );
  app.get<{ Params: { id: string } }>("/api/admin/merchants/:id/config/versions", { preHandler: deps.adminOnly }, async (request) =>
    listMerchantConfigVersions(deps.repos, request.params.id)
  );
  app.post<{ Params: { id: string; versionId: string } }>("/api/admin/merchants/:id/config/versions/:versionId/restore", { preHandler: deps.adminOnly }, async (request, reply) =>
    sendResult(reply, restoreMerchantConfigVersion(deps.repos, request.params.id, request.params.versionId, requestUser(request).name))
  );
  app.get<{ Params: { id: string } }>("/api/admin/merchants/:id/agent-profile", { preHandler: deps.adminOnly }, async (request) =>
    getMerchantAgentProfile(deps.repos, request.params.id)
  );
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/merchants/:id/agent-profile", { preHandler: deps.adminOnly }, async (request) =>
    patchMerchantAgentProfile(deps.repos, request.params.id, request.body ?? {}, requestUser(request).name)
  );
  app.get<{ Params: { id: string } }>("/api/admin/merchants/:id/agent-profile/versions", { preHandler: deps.adminOnly }, async (request) =>
    listMerchantAgentProfileVersions(deps.repos, request.params.id)
  );
  app.post<{ Params: { id: string; versionId: string } }>("/api/admin/merchants/:id/agent-profile/versions/:versionId/restore", { preHandler: deps.adminOnly }, async (request, reply) => {
    const restored = restoreMerchantAgentProfileVersion(deps.repos, request.params.id, request.params.versionId, requestUser(request).name);
    return restored ? restored : reply.code(404).send({ error: "智能体配置版本不存在" });
  });
}

function registerMerchantOwnSettingsRoutes(app: FastifyInstance, deps: MerchantSettingsRoutesDeps): void {
  app.get<{ Querystring: { startAt?: string; endAt?: string; timeZone?: string } }>("/api/merchant/dashboard", { preHandler: deps.merchantRoles }, async (request) => buildMerchantDashboard(deps.repos, scopedMerchantId(request), request.query));

  app.get("/api/merchant/config", { preHandler: deps.merchantRoles }, async (request) =>
    getMerchantVisibleConfig(deps.repos, scopedMerchantId(request))
  );
  app.patch<{ Body: Record<string, unknown> }>("/api/merchant/config", { preHandler: deps.merchantAdmins }, async (request, reply) =>
    sendResult(reply, patchMerchantVisibleConfig(deps.repos, scopedMerchantId(request), request.body ?? {}, requestUser(request).name))
  );
  app.get("/api/merchant/config/versions", { preHandler: deps.merchantRoles }, async (request) =>
    listMerchantConfigVersions(deps.repos, scopedMerchantId(request))
  );
  app.post<{ Params: { versionId: string } }>("/api/merchant/config/versions/:versionId/restore", { preHandler: deps.merchantAdmins }, async (request, reply) =>
    sendResult(reply, restoreMerchantVisibleConfigVersion(deps.repos, scopedMerchantId(request), request.params.versionId, requestUser(request).name))
  );
  app.get("/api/merchant/agent-profile", { preHandler: deps.merchantRoles }, async (request) =>
    getMerchantAgentProfile(deps.repos, scopedMerchantId(request))
  );
  app.patch<{ Body: Record<string, unknown> }>("/api/merchant/agent-profile", { preHandler: deps.merchantAdmins }, async (request) =>
    patchMerchantAgentProfile(deps.repos, scopedMerchantId(request), request.body ?? {}, requestUser(request).name)
  );
  app.get("/api/merchant/agent-profile/versions", { preHandler: deps.merchantRoles }, async (request) =>
    listMerchantAgentProfileVersions(deps.repos, scopedMerchantId(request))
  );
  app.post<{ Params: { versionId: string } }>("/api/merchant/agent-profile/versions/:versionId/restore", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    const restored = restoreMerchantAgentProfileVersion(deps.repos, scopedMerchantId(request), request.params.versionId, requestUser(request).name);
    return restored ? restored : reply.code(404).send({ error: "智能体配置版本不存在" });
  });
}

export function registerStaticFrontendRoute(app: FastifyInstance): void {
  app.get("/*", async (_request, reply) => {
    const indexPath = join(process.cwd(), "dist", "public", "index.html");
    if (existsSync(indexPath)) return reply.type("text/html; charset=utf-8").send(readFileSync(indexPath, "utf8"));
    return reply.type("text/html; charset=utf-8").send("<h1>智能客服</h1><p>服务已在线运行</p>");
  });
}
