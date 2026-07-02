import type { FastifyInstance } from "fastify";
import { requireUser, requestUser } from "../auth.js";
import type { Repositories } from "../repositories.js";
import { importScriptFlow } from "./scriptFlowImport.js";

type AdminScriptFlowRoutesDeps = {
  repos: Repositories;
  adminOnly: ReturnType<typeof requireUser>;
};

export function registerAdminScriptFlowRoutes(app: FastifyInstance, deps: AdminScriptFlowRoutesDeps): void {
  app.get<{ Querystring: { merchantId?: string; countryId?: string; status?: string } }>("/api/admin/script-flows", { preHandler: deps.adminOnly }, async (request) => ({
    rows: deps.repos.listScriptFlows({
      merchantId: request.query.merchantId,
      countryId: request.query.countryId,
      status: request.query.status
    })
  }));

  app.post("/api/admin/script-flows/import", { preHandler: deps.adminOnly }, async (request, reply) => importScriptFlow(request, reply, deps, undefined));

  app.get<{ Params: { id: string } }>("/api/admin/script-flows/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    const row = deps.repos.getScriptFlow(Number(request.params.id));
    if (!row) return reply.code(404).send({ error: "script flow not found" });
    return { ...row, versions: deps.repos.listScriptFlowVersions(Number(request.params.id)) };
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/script-flows/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    const row = deps.repos.patchScriptFlow(Number(request.params.id), undefined, request.body ?? {}, requestUser(request).name);
    if (!row) return reply.code(404).send({ error: "script flow not found" });
    return row;
  });

  app.delete<{ Params: { id: string } }>("/api/admin/script-flows/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    try {
      const ok = deps.repos.deleteScriptFlow(Number(request.params.id));
      if (!ok) return reply.code(404).send({ error: "script flow not found" });
      return { ok: true };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "delete failed" });
    }
  });

  app.post<{ Params: { id: string } }>("/api/admin/script-flows/:id/enable", { preHandler: deps.adminOnly }, async (request, reply) => {
    const row = deps.repos.enableScriptFlow(Number(request.params.id), undefined, requestUser(request).name);
    if (!row) return reply.code(404).send({ error: "script flow not found" });
    return row;
  });

  app.post<{ Params: { id: string; versionId: string } }>("/api/admin/script-flows/:id/versions/:versionId/restore", { preHandler: deps.adminOnly }, async (request, reply) => {
    const row = deps.repos.restoreScriptFlowVersion(Number(request.params.id), Number(request.params.versionId), undefined, requestUser(request).name);
    if (!row) return reply.code(404).send({ error: "script flow version not found" });
    return row;
  });

  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/script-flows/:id/steps", { preHandler: deps.adminOnly }, async (request, reply) => {
    try {
      const row = deps.repos.createScriptFlowStep(Number(request.params.id), undefined, request.body ?? {}, requestUser(request).name);
      if (!row) return reply.code(404).send({ error: "script flow not found" });
      return row;
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "invalid step" });
    }
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/script-flow-steps/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    const row = deps.repos.patchScriptFlowStep(Number(request.params.id), undefined, request.body ?? {}, requestUser(request).name);
    if (!row) return reply.code(404).send({ error: "script flow step not found" });
    return row;
  });

  app.post<{ Params: { id: string } }>("/api/admin/script-flow-steps/:id/duplicate", { preHandler: deps.adminOnly }, async (request, reply) => {
    const row = deps.repos.duplicateScriptFlowStep(Number(request.params.id), undefined, requestUser(request).name);
    if (!row) return reply.code(404).send({ error: "script flow step not found" });
    return row;
  });

  app.delete<{ Params: { id: string } }>("/api/admin/script-flow-steps/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    try {
      const ok = deps.repos.deleteScriptFlowStep(Number(request.params.id), undefined, requestUser(request).name);
      if (!ok) return reply.code(404).send({ error: "script flow step not found" });
      return { ok: true };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "delete failed" });
    }
  });
}
