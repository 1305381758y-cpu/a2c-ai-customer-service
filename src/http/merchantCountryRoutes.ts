import type { FastifyInstance } from "fastify";
import type { requireUser } from "../auth.js";
import type { Repositories } from "../repositories.js";
import { scopedMerchantId } from "./routeHelpers.js";

type MerchantCountryRoutesDeps = {
  repos: Repositories;
  adminOnly: ReturnType<typeof requireUser>;
  merchantRoles: ReturnType<typeof requireUser>;
  merchantAdmins: ReturnType<typeof requireUser>;
};

export function registerMerchantCountryRoutes(app: FastifyInstance, deps: MerchantCountryRoutesDeps): void {
  registerAdminCountryRoutes(app, deps);
  registerMerchantOwnCountryRoutes(app, deps);
}

function registerAdminCountryRoutes(app: FastifyInstance, deps: MerchantCountryRoutesDeps): void {
  app.get<{ Params: { id: string } }>("/api/admin/merchants/:id/countries", { preHandler: deps.adminOnly }, async (request) => ({
    rows: deps.repos.listMerchantCountries(request.params.id)
  }));
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/merchants/:id/countries", { preHandler: deps.adminOnly }, async (request, reply) => {
    try {
      return deps.repos.createMerchantCountry(request.params.id, request.body ?? {});
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "invalid country" });
    }
  });
  app.patch<{ Params: { id: string; countryId: string }; Body: Record<string, unknown> }>("/api/admin/merchants/:id/countries/:countryId", { preHandler: deps.adminOnly }, async (request, reply) => {
    const row = deps.repos.patchMerchantCountry(request.params.countryId, request.params.id, request.body ?? {});
    if (!row) return reply.code(404).send({ error: "country not found" });
    return row;
  });
}

function registerMerchantOwnCountryRoutes(app: FastifyInstance, deps: MerchantCountryRoutesDeps): void {
  app.get("/api/merchant/countries", { preHandler: deps.merchantRoles }, async (request) => ({
    rows: deps.repos.listMerchantCountries(scopedMerchantId(request))
  }));
  app.post<{ Body: Record<string, unknown> }>("/api/merchant/countries", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    try {
      return deps.repos.createMerchantCountry(scopedMerchantId(request), request.body ?? {});
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "invalid country" });
    }
  });
  app.patch<{ Params: { countryId: string }; Body: Record<string, unknown> }>("/api/merchant/countries/:countryId", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    const row = deps.repos.patchMerchantCountry(request.params.countryId, scopedMerchantId(request), request.body ?? {});
    if (!row) return reply.code(404).send({ error: "country not found" });
    return row;
  });
}
