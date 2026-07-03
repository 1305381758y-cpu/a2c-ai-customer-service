import type { FastifyInstance } from "fastify";
import type { requireUser } from "../auth.js";
import type { Repositories } from "../repositories.js";
import { createMerchantCountry, listMerchantCountries, patchMerchantCountry } from "../services/merchantCountries.js";
import { sendResult } from "./routeResponses.js";
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
  app.get<{ Params: { id: string } }>("/api/admin/merchants/:id/countries", { preHandler: deps.adminOnly }, async (request) => (
    listMerchantCountries(deps.repos, request.params.id)
  ));
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/merchants/:id/countries", { preHandler: deps.adminOnly }, async (request, reply) => (
    sendResult(reply, createMerchantCountry(deps.repos, request.params.id, request.body ?? {}))
  ));
  app.patch<{ Params: { id: string; countryId: string }; Body: Record<string, unknown> }>("/api/admin/merchants/:id/countries/:countryId", { preHandler: deps.adminOnly }, async (request, reply) => {
    return sendResult(reply, patchMerchantCountry(deps.repos, request.params.id, request.params.countryId, request.body ?? {}));
  });
}

function registerMerchantOwnCountryRoutes(app: FastifyInstance, deps: MerchantCountryRoutesDeps): void {
  app.get("/api/merchant/countries", { preHandler: deps.merchantRoles }, async (request) => (
    listMerchantCountries(deps.repos, scopedMerchantId(request))
  ));
  app.post<{ Body: Record<string, unknown> }>("/api/merchant/countries", { preHandler: deps.merchantAdmins }, async (request, reply) => (
    sendResult(reply, createMerchantCountry(deps.repos, scopedMerchantId(request), request.body ?? {}))
  ));
  app.patch<{ Params: { countryId: string }; Body: Record<string, unknown> }>("/api/merchant/countries/:countryId", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    return sendResult(reply, patchMerchantCountry(deps.repos, scopedMerchantId(request), request.params.countryId, request.body ?? {}));
  });
}
