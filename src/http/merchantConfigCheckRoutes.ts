import type { FastifyInstance, FastifyReply } from "fastify";
import type { requireUser } from "../auth.js";
import type { AppConfig } from "../config.js";
import type { Repositories } from "../repositories.js";
import { checkMerchantConfig, type MerchantConfigCheckResult } from "../services/configChecks.js";
import { scopedMerchantId } from "./routeHelpers.js";

type MerchantConfigCheckRoutesDeps = {
  config: AppConfig;
  repos: Repositories;
  adminOnly: ReturnType<typeof requireUser>;
  merchantRoles: ReturnType<typeof requireUser>;
};

export function registerMerchantConfigCheckRoutes(app: FastifyInstance, deps: MerchantConfigCheckRoutesDeps): void {
  app.get<{ Params: { id: string } }>("/api/admin/merchants/:id/config/check", { preHandler: deps.adminOnly }, async (request, reply) => sendConfigCheck(reply, await checkMerchantConfig(deps.repos, deps.config, request.params.id)));
  app.get("/api/merchant/config/check", { preHandler: deps.merchantRoles }, async (request, reply) => sendConfigCheck(reply, await checkMerchantConfig(deps.repos, deps.config, scopedMerchantId(request))));
}

function sendConfigCheck(reply: FastifyReply, result: MerchantConfigCheckResult) {
  if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
  return result.value;
}
