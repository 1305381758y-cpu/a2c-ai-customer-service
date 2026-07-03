import type { FastifyInstance } from "fastify";
import { requireUser } from "../auth.js";
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
import { sendResult } from "./routeResponses.js";

type AdminTrainingRoutesDeps = {
  repos: Repositories;
  adminOnly: ReturnType<typeof requireUser>;
};

export function registerAdminTrainingRoutes(app: FastifyInstance, deps: AdminTrainingRoutesDeps): void {
  app.get<{ Querystring: KnowledgeListQuery }>("/api/admin/knowledge", { preHandler: deps.adminOnly }, async (request) =>
    listKnowledgeItems(deps.repos, request.query)
  );

  app.post<{ Body: Record<string, unknown> }>("/api/admin/knowledge", { preHandler: deps.adminOnly }, async (request, reply) => {
    return sendResult(reply, createKnowledgeItem(deps.repos, String(request.body?.merchantId || "default"), request.body ?? {}));
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/knowledge/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    return sendResult(reply, patchKnowledgeItem(deps.repos, request.params.id, request.body ?? {}));
  });

  app.delete<{ Params: { id: string } }>("/api/admin/knowledge/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    return sendResult(reply, deleteKnowledgeItem(deps.repos, request.params.id));
  });

  app.get<{ Querystring: TrainingSampleListQuery }>("/api/admin/training-samples", { preHandler: deps.adminOnly }, async (request) =>
    listTrainingSamples(deps.repos, request.query)
  );

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/training-samples/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    return sendResult(reply, patchTrainingSample(deps.repos, request.params.id, request.body ?? {}));
  });

  app.delete<{ Params: { id: string } }>("/api/admin/training-samples/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    return sendResult(reply, deleteTrainingSample(deps.repos, request.params.id));
  });

  app.get<{ Querystring: TrainingMaterialListQuery }>("/api/admin/training-materials", { preHandler: deps.adminOnly }, async (request) =>
    listTrainingMaterials(deps.repos, request.query)
  );

  app.get<{ Params: { id: string } }>("/api/admin/training-materials/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    return sendResult(reply, getTrainingMaterialWithItems(deps.repos, request.params.id));
  });

  app.delete<{ Params: { id: string } }>("/api/admin/training-materials/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    return sendResult(reply, deleteTrainingMaterial(deps.repos, request.params.id));
  });
}
