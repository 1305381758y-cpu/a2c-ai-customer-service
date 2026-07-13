import type { FastifyInstance } from "fastify";
import type { requireUser } from "../auth.js";
import type { Repositories } from "../repositories.js";
import { getAdminAiCallStats, type AiCallStatsQuery } from "../services/aiCallStats.js";

type AiCallStatsRoutesDeps = {
  repos: Repositories;
  adminOnly: ReturnType<typeof requireUser>;
};

export function registerAiCallStatsRoutes(app: FastifyInstance, deps: AiCallStatsRoutesDeps): void {
  app.get<{ Querystring: AiCallStatsQuery }>("/api/admin/ai-calls/stats", { preHandler: deps.adminOnly }, async (request) =>
    getAdminAiCallStats(deps.repos, request.query)
  );
}
