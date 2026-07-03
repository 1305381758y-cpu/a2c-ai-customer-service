import type { FastifyInstance } from "fastify";
import { requireUser, requestUser } from "../auth.js";
import type { Repositories } from "../repositories.js";
import {
  createScriptFlowStep,
  deleteScriptFlow,
  deleteScriptFlowStep,
  duplicateScriptFlowStep,
  enableScriptFlow,
  getScriptFlowDetail,
  listScriptFlows,
  patchScriptFlow,
  patchScriptFlowStep,
  restoreScriptFlowVersion
} from "../services/scriptFlows.js";
import { sendResult } from "./routeResponses.js";
import { importScriptFlow } from "./scriptFlowImport.js";

type AdminScriptFlowRoutesDeps = {
  repos: Repositories;
  adminOnly: ReturnType<typeof requireUser>;
};

export function registerAdminScriptFlowRoutes(app: FastifyInstance, deps: AdminScriptFlowRoutesDeps): void {
  app.get<{ Querystring: { merchantId?: string; countryId?: string; status?: string } }>("/api/admin/script-flows", { preHandler: deps.adminOnly }, async (request) => ({
    ...listScriptFlows(deps.repos, request.query)
  }));

  app.post("/api/admin/script-flows/import", { preHandler: deps.adminOnly }, async (request, reply) => importScriptFlow(request, reply, deps, undefined));

  app.get<{ Params: { id: string } }>("/api/admin/script-flows/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    return sendResult(reply, getScriptFlowDetail(deps.repos, request.params.id));
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/script-flows/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    return sendResult(reply, patchScriptFlow(deps.repos, request.params.id, undefined, request.body ?? {}, requestUser(request).name));
  });

  app.delete<{ Params: { id: string } }>("/api/admin/script-flows/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    return sendResult(reply, deleteScriptFlow(deps.repos, request.params.id));
  });

  app.post<{ Params: { id: string } }>("/api/admin/script-flows/:id/enable", { preHandler: deps.adminOnly }, async (request, reply) => {
    return sendResult(reply, enableScriptFlow(deps.repos, request.params.id, undefined, requestUser(request).name));
  });

  app.post<{ Params: { id: string; versionId: string } }>("/api/admin/script-flows/:id/versions/:versionId/restore", { preHandler: deps.adminOnly }, async (request, reply) => {
    return sendResult(reply, restoreScriptFlowVersion(deps.repos, request.params.id, request.params.versionId, undefined, requestUser(request).name));
  });

  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/script-flows/:id/steps", { preHandler: deps.adminOnly }, async (request, reply) => {
    return sendResult(reply, createScriptFlowStep(deps.repos, request.params.id, undefined, request.body ?? {}, requestUser(request).name));
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/script-flow-steps/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    return sendResult(reply, patchScriptFlowStep(deps.repos, request.params.id, undefined, request.body ?? {}, requestUser(request).name));
  });

  app.post<{ Params: { id: string } }>("/api/admin/script-flow-steps/:id/duplicate", { preHandler: deps.adminOnly }, async (request, reply) => {
    return sendResult(reply, duplicateScriptFlowStep(deps.repos, request.params.id, undefined, requestUser(request).name));
  });

  app.delete<{ Params: { id: string } }>("/api/admin/script-flow-steps/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    return sendResult(reply, deleteScriptFlowStep(deps.repos, request.params.id, undefined, requestUser(request).name));
  });
}
