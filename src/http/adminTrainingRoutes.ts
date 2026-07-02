import type { FastifyInstance } from "fastify";
import { requireUser } from "../auth.js";
import type { Repositories } from "../repositories.js";

type AdminTrainingRoutesDeps = {
  repos: Repositories;
  adminOnly: ReturnType<typeof requireUser>;
};

export function registerAdminTrainingRoutes(app: FastifyInstance, deps: AdminTrainingRoutesDeps): void {
  app.get<{ Querystring: { merchantId?: string; countryId?: string; type?: string; enabled?: string } }>("/api/admin/knowledge", { preHandler: deps.adminOnly }, async (request) => ({
    rows: deps.repos.listKnowledgeItems({
      merchantId: request.query.merchantId,
      countryId: request.query.countryId,
      type: request.query.type,
      enabled: request.query.enabled === undefined ? undefined : request.query.enabled === "true" || request.query.enabled === "1"
    })
  }));

  app.post<{ Body: Record<string, unknown> }>("/api/admin/knowledge", { preHandler: deps.adminOnly }, async (request, reply) => {
    try {
      return deps.repos.createKnowledgeItem(String(request.body?.merchantId || "default"), request.body ?? {});
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "invalid knowledge item" });
    }
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/knowledge/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    const row = deps.repos.patchKnowledgeItem(Number(request.params.id), request.body ?? {});
    if (!row) return reply.code(404).send({ error: "knowledge item not found" });
    return row;
  });

  app.delete<{ Params: { id: string } }>("/api/admin/knowledge/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    const ok = deps.repos.deleteKnowledgeItem(Number(request.params.id));
    if (!ok) return reply.code(404).send({ error: "knowledge item not found" });
    return { ok: true };
  });

  app.get<{ Querystring: { merchantId?: string; countryId?: string; language?: string; intent?: string; stage?: string; enabled?: string } }>("/api/admin/training-samples", { preHandler: deps.adminOnly }, async (request) => ({
    rows: deps.repos.listTrainingSamples({
      merchantId: request.query.merchantId,
      countryId: request.query.countryId,
      language: request.query.language,
      intent: request.query.intent,
      stage: request.query.stage,
      enabled: request.query.enabled === undefined ? undefined : request.query.enabled === "true" || request.query.enabled === "1"
    })
  }));

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/training-samples/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    const row = deps.repos.patchTrainingSample(Number(request.params.id), request.body ?? {});
    if (!row) return reply.code(404).send({ error: "sample not found" });
    return row;
  });

  app.delete<{ Params: { id: string } }>("/api/admin/training-samples/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    const ok = deps.repos.deleteTrainingSample(Number(request.params.id));
    if (!ok) return reply.code(404).send({ error: "sample not found" });
    return { ok: true };
  });

  app.get<{ Querystring: { merchantId?: string; countryId?: string; sourceType?: string; status?: string; limit?: string } }>("/api/admin/training-materials", { preHandler: deps.adminOnly }, async (request) => ({
    rows: deps.repos.listTrainingMaterials({
      merchantId: request.query.merchantId,
      countryId: request.query.countryId,
      sourceType: request.query.sourceType,
      status: request.query.status,
      limit: request.query.limit ? Number(request.query.limit) : undefined
    })
  }));

  app.get<{ Params: { id: string } }>("/api/admin/training-materials/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    const id = Number(request.params.id);
    const material = deps.repos.getTrainingMaterial(id);
    if (!material) return reply.code(404).send({ error: "material not found" });
    return { material, items: deps.repos.listTrainingMaterialItems(id) };
  });

  app.delete<{ Params: { id: string } }>("/api/admin/training-materials/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    const ok = deps.repos.deleteTrainingMaterial(Number(request.params.id));
    if (!ok) return reply.code(404).send({ error: "material not found" });
    return { ok: true };
  });
}
