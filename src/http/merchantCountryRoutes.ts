import type { FastifyInstance } from "fastify";
import type { requireUser } from "../auth.js";
import type { Repositories } from "../repositories.js";
import { createMerchantCountry, listAllMerchantCountries, listMerchantCountries, patchMerchantCountry } from "../services/merchantCountries.js";
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
  app.get("/api/admin/countries", { preHandler: deps.adminOnly }, async () => (
    listAllMerchantCountries(deps.repos)
  ));
  app.get<{ Params: { id: string } }>("/api/admin/merchants/:id/countries", { preHandler: deps.adminOnly }, async (request) => (
    listMerchantCountries(deps.repos, request.params.id)
  ));
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/merchants/:id/countries", { preHandler: deps.adminOnly }, async (request, reply) => (
    sendResult(reply, createMerchantCountry(deps.repos, request.params.id, request.body ?? {}))
  ));
  app.patch<{ Params: { id: string; countryId: string }; Body: Record<string, unknown> }>("/api/admin/merchants/:id/countries/:countryId", { preHandler: deps.adminOnly }, async (request, reply) => {
    return sendResult(reply, patchMerchantCountry(deps.repos, request.params.id, request.params.countryId, request.body ?? {}));
  });
  app.get<{ Params: { id: string }; Querystring: { countryId?: string } }>("/api/admin/merchants/:id/teacher-tg-links", { preHandler: deps.adminOnly }, async (request) => ({
    rows: deps.repos.listTeacherTgLinks(request.params.id, request.query.countryId || "")
  }));
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/merchants/:id/teacher-tg-links", { preHandler: deps.adminOnly }, async (request) => (
    deps.repos.createTeacherTgLink(request.params.id, String(request.body?.countryId || ""), request.body ?? {})
  ));
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/merchants/:id/teacher-tg-links/import", { preHandler: deps.adminOnly }, async (request) => (
    deps.repos.importTeacherTgLinks(request.params.id, String(request.body?.countryId || ""), request.body ?? {})
  ));
  app.patch<{ Params: { id: string; linkId: string }; Body: Record<string, unknown> }>("/api/admin/merchants/:id/teacher-tg-links/:linkId", { preHandler: deps.adminOnly }, async (request) => (
    deps.repos.patchTeacherTgLink(Number(request.params.linkId), request.params.id, request.body ?? {})
  ));
  app.delete<{ Params: { id: string; linkId: string } }>("/api/admin/merchants/:id/teacher-tg-links/:linkId", { preHandler: deps.adminOnly }, async (request) => (
    { deleted: deps.repos.deleteTeacherTgLink(Number(request.params.linkId), request.params.id) }
  ));
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
  app.get<{ Querystring: { countryId?: string } }>("/api/merchant/teacher-tg-links", { preHandler: deps.merchantRoles }, async (request) => ({
    rows: deps.repos.listTeacherTgLinks(scopedMerchantId(request), request.query.countryId || "")
  }));
  app.post<{ Body: Record<string, unknown> }>("/api/merchant/teacher-tg-links", { preHandler: deps.merchantAdmins }, async (request) => (
    deps.repos.createTeacherTgLink(scopedMerchantId(request), String(request.body?.countryId || ""), request.body ?? {})
  ));
  app.post<{ Body: Record<string, unknown> }>("/api/merchant/teacher-tg-links/import", { preHandler: deps.merchantAdmins }, async (request) => (
    deps.repos.importTeacherTgLinks(scopedMerchantId(request), String(request.body?.countryId || ""), request.body ?? {})
  ));
  app.patch<{ Params: { linkId: string }; Body: Record<string, unknown> }>("/api/merchant/teacher-tg-links/:linkId", { preHandler: deps.merchantAdmins }, async (request) => (
    deps.repos.patchTeacherTgLink(Number(request.params.linkId), scopedMerchantId(request), request.body ?? {})
  ));
  app.delete<{ Params: { linkId: string } }>("/api/merchant/teacher-tg-links/:linkId", { preHandler: deps.merchantAdmins }, async (request) => (
    { deleted: deps.repos.deleteTeacherTgLink(Number(request.params.linkId), scopedMerchantId(request)) }
  ));
}
