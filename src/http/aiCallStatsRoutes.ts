import type { FastifyInstance } from "fastify";
import type { requireUser } from "../auth.js";
import type { Repositories } from "../repositories.js";
import { getAdminAiCallStats, getMerchantAiCallStats, type AiCallStatsQuery } from "../services/aiCallStats.js";
import { scopedMerchantId } from "./routeHelpers.js";

type AiCallStatsRoutesDeps = {
  repos: Repositories;
  adminOnly: ReturnType<typeof requireUser>;
  merchantRoles: ReturnType<typeof requireUser>;
};

export function registerAiCallStatsRoutes(app: FastifyInstance, deps: AiCallStatsRoutesDeps): void {
  app.get<{ Querystring: AiCallStatsQuery }>("/api/merchant/ai-calls/stats", { preHandler: deps.merchantRoles }, async (request) =>
    getMerchantAiCallStats(deps.repos, scopedMerchantId(request), request.query)
  );

  app.get<{ Querystring: AiCallStatsQuery }>("/api/admin/ai-calls/stats", { preHandler: deps.adminOnly }, async (request) =>
    getAdminAiCallStats(deps.repos, request.query)
  );
}
