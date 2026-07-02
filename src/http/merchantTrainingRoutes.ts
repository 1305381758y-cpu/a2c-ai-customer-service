import type { FastifyInstance } from "fastify";
import { requireUser } from "../auth.js";
import type { AppConfig } from "../config.js";
import type { Repositories } from "../repositories.js";
import { scopedMerchantId } from "./routeHelpers.js";
import { importMaterial, importSamples } from "./trainingImports.js";

type MerchantTrainingRoutesDeps = {
  config: AppConfig;
  repos: Repositories;
  merchantRoles: ReturnType<typeof requireUser>;
  merchantAdmins: ReturnType<typeof requireUser>;
};

export function registerMerchantTrainingRoutes(app: FastifyInstance, deps: MerchantTrainingRoutesDeps): void {
  app.get<{ Querystring: { countryId?: string; type?: string; enabled?: string } }>("/api/merchant/knowledge", { preHandler: deps.merchantRoles }, async (request) => ({
    rows: deps.repos.listKnowledgeItems({
      merchantId: scopedMerchantId(request),
      countryId: request.query.countryId,
      type: request.query.type,
      enabled: request.query.enabled === undefined ? undefined : request.query.enabled === "true" || request.query.enabled === "1"
    })
  }));

  app.post<{ Body: Record<string, unknown> }>("/api/merchant/knowledge", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    try {
      return deps.repos.createKnowledgeItem(scopedMerchantId(request), request.body ?? {});
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "invalid knowledge item" });
    }
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/knowledge/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    const row = deps.repos.patchKnowledgeItem(Number(request.params.id), request.body ?? {}, scopedMerchantId(request));
    if (!row) return reply.code(404).send({ error: "knowledge item not found" });
    return row;
  });

  app.delete<{ Params: { id: string } }>("/api/merchant/knowledge/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    const ok = deps.repos.deleteKnowledgeItem(Number(request.params.id), scopedMerchantId(request));
    if (!ok) return reply.code(404).send({ error: "knowledge item not found" });
    return { ok: true };
  });

  app.post("/api/merchant/training-samples/import", { preHandler: deps.merchantRoles }, async (request, reply) => importSamples(request, reply, deps, scopedMerchantId(request)));

  app.post("/api/merchant/training-materials/import", { preHandler: deps.merchantRoles }, async (request, reply) => importMaterial(request, reply, deps, scopedMerchantId(request)));

  app.get<{ Querystring: { countryId?: string; sourceType?: string; status?: string; limit?: string } }>("/api/merchant/training-materials", { preHandler: deps.merchantRoles }, async (request) => ({
    rows: deps.repos.listTrainingMaterials({
      merchantId: scopedMerchantId(request),
      countryId: request.query.countryId,
      sourceType: request.query.sourceType,
      status: request.query.status,
      limit: request.query.limit ? Number(request.query.limit) : undefined
    })
  }));

  app.get<{ Params: { id: string } }>("/api/merchant/training-materials/:id", { preHandler: deps.merchantRoles }, async (request, reply) => {
    const id = Number(request.params.id);
    const merchantId = scopedMerchantId(request);
    const material = deps.repos.getTrainingMaterial(id, merchantId);
    if (!material) return reply.code(404).send({ error: "material not found" });
    return { material, items: deps.repos.listTrainingMaterialItems(id, merchantId) };
  });

  app.delete<{ Params: { id: string } }>("/api/merchant/training-materials/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    const ok = deps.repos.deleteTrainingMaterial(Number(request.params.id), scopedMerchantId(request));
    if (!ok) return reply.code(404).send({ error: "material not found" });
    return { ok: true };
  });

  app.get<{ Querystring: { countryId?: string; language?: string; intent?: string; stage?: string; enabled?: string } }>("/api/merchant/training-samples", { preHandler: deps.merchantRoles }, async (request) => ({
    rows: deps.repos.listTrainingSamples({
      merchantId: scopedMerchantId(request),
      countryId: request.query.countryId,
      language: request.query.language,
      intent: request.query.intent,
      stage: request.query.stage,
      enabled: request.query.enabled === undefined ? undefined : request.query.enabled === "true" || request.query.enabled === "1"
    })
  }));

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/training-samples/:id", { preHandler: deps.merchantRoles }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "invalid id" });
    const row = deps.repos.patchTrainingSample(id, request.body ?? {}, scopedMerchantId(request));
    if (!row) return reply.code(404).send({ error: "sample not found" });
    return row;
  });

  app.delete<{ Params: { id: string } }>("/api/merchant/training-samples/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "invalid id" });
    const ok = deps.repos.deleteTrainingSample(id, scopedMerchantId(request));
    if (!ok) return reply.code(404).send({ error: "sample not found" });
    return { ok: true };
  });
}
