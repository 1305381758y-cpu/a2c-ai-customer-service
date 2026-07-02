import type { FastifyInstance } from "fastify";
import { requireUser, requestUser } from "../auth.js";
import type { Repositories } from "../repositories.js";
import { scopedMerchantId } from "./routeHelpers.js";
import { importScriptFlow } from "./scriptFlowImport.js";

type MerchantScriptFlowRoutesDeps = {
  repos: Repositories;
  merchantRoles: ReturnType<typeof requireUser>;
  merchantAdmins: ReturnType<typeof requireUser>;
};

export function registerMerchantScriptFlowRoutes(app: FastifyInstance, deps: MerchantScriptFlowRoutesDeps): void {
  app.get<{ Querystring: { countryId?: string; status?: string } }>("/api/merchant/script-flows", { preHandler: deps.merchantRoles }, async (request) => ({
    rows: deps.repos.listScriptFlows({
      merchantId: scopedMerchantId(request),
      countryId: request.query.countryId,
      status: request.query.status
    })
  }));

  app.post("/api/merchant/script-flows/import", { preHandler: deps.merchantAdmins }, async (request, reply) => importScriptFlow(request, reply, deps, scopedMerchantId(request)));

  app.get<{ Params: { id: string } }>("/api/merchant/script-flows/:id", { preHandler: deps.merchantRoles }, async (request, reply) => {
    const row = deps.repos.getScriptFlow(Number(request.params.id), scopedMerchantId(request));
    if (!row) return reply.code(404).send({ error: "script flow not found" });
    return { ...row, versions: deps.repos.listScriptFlowVersions(Number(request.params.id), scopedMerchantId(request)) };
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/script-flows/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    const row = deps.repos.patchScriptFlow(Number(request.params.id), scopedMerchantId(request), request.body ?? {}, requestUser(request).name);
    if (!row) return reply.code(404).send({ error: "script flow not found" });
    return row;
  });

  app.delete<{ Params: { id: string } }>("/api/merchant/script-flows/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    try {
      const ok = deps.repos.deleteScriptFlow(Number(request.params.id), scopedMerchantId(request));
      if (!ok) return reply.code(404).send({ error: "script flow not found" });
      return { ok: true };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "delete failed" });
    }
  });

  app.post<{ Params: { id: string } }>("/api/merchant/script-flows/:id/enable", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    const row = deps.repos.enableScriptFlow(Number(request.params.id), scopedMerchantId(request), requestUser(request).name);
    if (!row) return reply.code(404).send({ error: "script flow not found" });
    deps.repos.patchMerchantConfig(scopedMerchantId(request), { strictScriptFlowEnabled: true });
    return row;
  });

  app.post<{ Params: { id: string; versionId: string } }>("/api/merchant/script-flows/:id/versions/:versionId/restore", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    const row = deps.repos.restoreScriptFlowVersion(Number(request.params.id), Number(request.params.versionId), scopedMerchantId(request), requestUser(request).name);
    if (!row) return reply.code(404).send({ error: "script flow version not found" });
    return row;
  });

  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/script-flows/:id/steps", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    try {
      const row = deps.repos.createScriptFlowStep(Number(request.params.id), scopedMerchantId(request), request.body ?? {}, requestUser(request).name);
      if (!row) return reply.code(404).send({ error: "script flow not found" });
      return row;
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "invalid step" });
    }
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/script-flow-steps/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    const row = deps.repos.patchScriptFlowStep(Number(request.params.id), scopedMerchantId(request), request.body ?? {}, requestUser(request).name);
    if (!row) return reply.code(404).send({ error: "script flow step not found" });
    return row;
  });

  app.post<{ Params: { id: string } }>("/api/merchant/script-flow-steps/:id/duplicate", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    const row = deps.repos.duplicateScriptFlowStep(Number(request.params.id), scopedMerchantId(request), requestUser(request).name);
    if (!row) return reply.code(404).send({ error: "script flow step not found" });
    return row;
  });

  app.delete<{ Params: { id: string } }>("/api/merchant/script-flow-steps/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    try {
      const ok = deps.repos.deleteScriptFlowStep(Number(request.params.id), scopedMerchantId(request), requestUser(request).name);
      if (!ok) return reply.code(404).send({ error: "script flow step not found" });
      return { ok: true };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "delete failed" });
    }
  });
}
