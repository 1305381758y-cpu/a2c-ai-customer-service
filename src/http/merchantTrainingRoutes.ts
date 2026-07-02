import type { FastifyInstance, FastifyReply } from "fastify";
import { requireUser } from "../auth.js";
import type { AppConfig } from "../config.js";
import type { Repositories } from "../repositories.js";
import {
  createKnowledgeItem,
  deleteKnowledgeItem,
  deleteTrainingMaterial,
  deleteTrainingSample,
  getTrainingMaterialWithItems,
  listKnowledgeItems,
  listTrainingMaterials,
  listTrainingSamples,
  patchKnowledgeItem,
  patchTrainingSample,
  type KnowledgeListQuery,
  type TrainingMaterialListQuery,
  type TrainingSampleListQuery
} from "../services/trainingContent.js";
import { scopedMerchantId } from "./routeHelpers.js";
import { importMaterial, importSamples } from "./trainingImports.js";

type MerchantTrainingRoutesDeps = {
  config: AppConfig;
  repos: Repositories;
  merchantRoles: ReturnType<typeof requireUser>;
  merchantAdmins: ReturnType<typeof requireUser>;
};

export function registerMerchantTrainingRoutes(app: FastifyInstance, deps: MerchantTrainingRoutesDeps): void {
  app.get<{ Querystring: Omit<KnowledgeListQuery, "merchantId"> }>("/api/merchant/knowledge", { preHandler: deps.merchantRoles }, async (request) =>
    listKnowledgeItems(deps.repos, { ...request.query, merchantId: scopedMerchantId(request) })
  );

  app.post<{ Body: Record<string, unknown> }>("/api/merchant/knowledge", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    return sendResult(reply, createKnowledgeItem(deps.repos, scopedMerchantId(request), request.body ?? {}));
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/knowledge/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    return sendResult(reply, patchKnowledgeItem(deps.repos, request.params.id, request.body ?? {}, scopedMerchantId(request)));
  });

  app.delete<{ Params: { id: string } }>("/api/merchant/knowledge/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    return sendResult(reply, deleteKnowledgeItem(deps.repos, request.params.id, scopedMerchantId(request)));
  });

  app.post("/api/merchant/training-samples/import", { preHandler: deps.merchantRoles }, async (request, reply) => importSamples(request, reply, deps, scopedMerchantId(request)));

  app.post("/api/merchant/training-materials/import", { preHandler: deps.merchantRoles }, async (request, reply) => importMaterial(request, reply, deps, scopedMerchantId(request)));

  app.get<{ Querystring: Omit<TrainingMaterialListQuery, "merchantId"> }>("/api/merchant/training-materials", { preHandler: deps.merchantRoles }, async (request) =>
    listTrainingMaterials(deps.repos, { ...request.query, merchantId: scopedMerchantId(request) })
  );

  app.get<{ Params: { id: string } }>("/api/merchant/training-materials/:id", { preHandler: deps.merchantRoles }, async (request, reply) => {
    return sendResult(reply, getTrainingMaterialWithItems(deps.repos, request.params.id, scopedMerchantId(request)));
  });

  app.delete<{ Params: { id: string } }>("/api/merchant/training-materials/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    return sendResult(reply, deleteTrainingMaterial(deps.repos, request.params.id, scopedMerchantId(request)));
  });

  app.get<{ Querystring: Omit<TrainingSampleListQuery, "merchantId"> }>("/api/merchant/training-samples", { preHandler: deps.merchantRoles }, async (request) =>
    listTrainingSamples(deps.repos, { ...request.query, merchantId: scopedMerchantId(request) })
  );

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/training-samples/:id", { preHandler: deps.merchantRoles }, async (request, reply) => {
    return sendResult(reply, patchTrainingSample(deps.repos, request.params.id, request.body ?? {}, scopedMerchantId(request)));
  });

  app.delete<{ Params: { id: string } }>("/api/merchant/training-samples/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    return sendResult(reply, deleteTrainingSample(deps.repos, request.params.id, scopedMerchantId(request)));
  });
}

function sendResult<T>(
  reply: FastifyReply,
  result: { ok: true; value: T } | { ok: false; statusCode: 400 | 404; error: string }
): T | FastifyReply {
  if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
  return result.value;
}
