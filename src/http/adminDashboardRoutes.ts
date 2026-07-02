import type { FastifyInstance } from "fastify";
import { requireUser } from "../auth.js";
import type { Repositories } from "../repositories.js";
import { buildAdminDashboard } from "../services/adminDashboard.js";

type AdminDashboardRoutesDeps = {
  repos: Repositories;
  adminOnly: ReturnType<typeof requireUser>;
};

export function registerAdminDashboardRoutes(app: FastifyInstance, deps: AdminDashboardRoutesDeps): void {
  app.get("/api/admin/dashboard", { preHandler: deps.adminOnly }, async () => buildAdminDashboard(deps.repos));
}
