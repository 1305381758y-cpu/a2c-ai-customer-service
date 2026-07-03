import type { FastifyInstance, FastifyReply } from "fastify";
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
  restoreScriptFlowVersion,
  type ScriptFlowResult
} from "../services/scriptFlows.js";
import { scopedMerchantId } from "./routeHelpers.js";
import { importScriptFlow } from "./scriptFlowImport.js";

type MerchantScriptFlowRoutesDeps = {
  repos: Repositories;
  merchantRoles: ReturnType<typeof requireUser>;
  merchantAdmins: ReturnType<typeof requireUser>;
};

export function registerMerchantScriptFlowRoutes(app: FastifyInstance, deps: MerchantScriptFlowRoutesDeps): void {
  app.get<{ Querystring: { countryId?: string; status?: string } }>("/api/merchant/script-flows", { preHandler: deps.merchantRoles }, async (request) => ({
    ...listScriptFlows(deps.repos, request.query, scopedMerchantId(request))
  }));

  app.post("/api/merchant/script-flows/import", { preHandler: deps.merchantAdmins }, async (request, reply) => importScriptFlow(request, reply, deps, scopedMerchantId(request)));

  app.get<{ Params: { id: string } }>("/api/merchant/script-flows/:id", { preHandler: deps.merchantRoles }, async (request, reply) => {
    return sendResult(reply, getScriptFlowDetail(deps.repos, request.params.id, scopedMerchantId(request)));
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/script-flows/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    return sendResult(reply, patchScriptFlow(deps.repos, request.params.id, scopedMerchantId(request), request.body ?? {}, requestUser(request).name));
  });

  app.delete<{ Params: { id: string } }>("/api/merchant/script-flows/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    return sendResult(reply, deleteScriptFlow(deps.repos, request.params.id, scopedMerchantId(request)));
  });

  app.post<{ Params: { id: string } }>("/api/merchant/script-flows/:id/enable", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    return sendResult(reply, enableScriptFlow(deps.repos, request.params.id, scopedMerchantId(request), requestUser(request).name, { enableStrictFlowConfig: true }));
  });

  app.post<{ Params: { id: string; versionId: string } }>("/api/merchant/script-flows/:id/versions/:versionId/restore", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    return sendResult(reply, restoreScriptFlowVersion(deps.repos, request.params.id, request.params.versionId, scopedMerchantId(request), requestUser(request).name));
  });

  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/script-flows/:id/steps", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    return sendResult(reply, createScriptFlowStep(deps.repos, request.params.id, scopedMerchantId(request), request.body ?? {}, requestUser(request).name));
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/script-flow-steps/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    return sendResult(reply, patchScriptFlowStep(deps.repos, request.params.id, scopedMerchantId(request), request.body ?? {}, requestUser(request).name));
  });

  app.post<{ Params: { id: string } }>("/api/merchant/script-flow-steps/:id/duplicate", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    return sendResult(reply, duplicateScriptFlowStep(deps.repos, request.params.id, scopedMerchantId(request), requestUser(request).name));
  });

  app.delete<{ Params: { id: string } }>("/api/merchant/script-flow-steps/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    return sendResult(reply, deleteScriptFlowStep(deps.repos, request.params.id, scopedMerchantId(request), requestUser(request).name));
  });
}

function sendResult<T>(reply: FastifyReply, result: ScriptFlowResult<T>) {
  if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
  return result.value;
}
