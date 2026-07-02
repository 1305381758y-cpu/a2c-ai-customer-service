import type { FastifyInstance } from "fastify";
import { requireUser } from "../auth.js";
import type { Repositories } from "../repositories.js";

type AdminDashboardRoutesDeps = {
  repos: Repositories;
  adminOnly: ReturnType<typeof requireUser>;
};

export function registerAdminDashboardRoutes(app: FastifyInstance, deps: AdminDashboardRoutesDeps): void {
  app.get("/api/admin/dashboard", { preHandler: deps.adminOnly }, async () => ({
    merchants: deps.repos.listMerchants().length,
    customers: deps.repos.listCustomers({ limit: 500 }).length,
    conversations: deps.repos.listConversations({ limit: 500 }).length,
    handoffs: deps.repos.listConversations({ status: "human_handoff", limit: 500 }).length,
    samples: deps.repos.listTrainingSamples({ enabled: true }).length
  }));
}
