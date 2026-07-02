import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { hashPassword } from "../auth.js";
import type { AppConfig } from "../config.js";
import type { Repositories } from "../repositories.js";
import { importSamples } from "./trainingImports.js";
import { requireInternalApiKey as auth } from "./internalApiKeyAuth.js";
import { maskUser } from "./routeHelpers.js";

type InternalMaintenanceRoutesDeps = {
  config: AppConfig;
  repos: Repositories;
};

export function registerInternalMaintenanceRoutes(app: FastifyInstance, deps: InternalMaintenanceRoutesDeps): void {
  app.post("/internal/training-samples/import", { preHandler: auth(deps.config) }, async (request, reply) => importSamples(request, reply, deps, "default"));

  app.post<{ Body: { email?: string; password?: string; name?: string } }>("/internal/admin/reset-password", { preHandler: auth(deps.config) }, async (request) => {
    const body = z.object({
      email: z.string().email().default(deps.config.DEFAULT_ADMIN_EMAIL),
      password: z.string().min(8).default(deps.config.DEFAULT_ADMIN_PASSWORD),
      name: z.string().min(1).optional()
    }).parse(request.body ?? {});
    const user = deps.repos.resetPlatformAdmin({
      email: body.email,
      passwordHash: hashPassword(body.password),
      name: body.name
    });
    return maskUser(user);
  });

  app.post<{ Body: { confirm?: string } }>("/internal/admin/clear-learning-data", { preHandler: auth(deps.config) }, async (request, reply) => {
    const body = z.object({ confirm: z.string() }).parse(request.body ?? {});
    if (body.confirm !== "CLEAR_LEARNING_AND_CUSTOMERS") {
      return reply.code(400).send({ error: "invalid confirmation" });
    }
    return {
      ok: true,
      ...deps.repos.clearLearningAndCustomerData()
    };
  });

  app.get<{ Querystring: { language?: string; intent?: string; stage?: string; enabled?: string } }>("/internal/training-samples", { preHandler: auth(deps.config) }, async (request) => ({
    rows: deps.repos.listTrainingSamples({
      language: request.query.language,
      intent: request.query.intent,
      stage: request.query.stage,
      enabled: request.query.enabled === undefined ? undefined : request.query.enabled === "true" || request.query.enabled === "1"
    })
  }));

  app.delete("/internal/training-samples", { preHandler: auth(deps.config) }, async () => ({
    ok: true,
    ...deps.repos.deleteAllTrainingSamples()
  }));

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/internal/training-samples/:id", { preHandler: auth(deps.config) }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "invalid id" });
    const row = deps.repos.patchTrainingSample(id, request.body ?? {});
    if (!row) return reply.code(404).send({ error: "sample not found" });
    return row;
  });

  app.get<{ Querystring: { status?: string; language?: string; limit?: string } }>("/internal/conversations", { preHandler: auth(deps.config) }, async (request) => ({
    rows: deps.repos.listConversations({
      status: request.query.status,
      language: request.query.language,
      limit: request.query.limit ? Number(request.query.limit) : undefined
    })
  }));

  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>("/internal/conversations/:id/messages", { preHandler: auth(deps.config) }, async (request, reply) => {
    const conversation = deps.repos.getConversation(request.params.id);
    if (!conversation) return reply.code(404).send({ error: "conversation not found" });
    return { conversation, rows: deps.repos.listConversationMessages(request.params.id, request.query.limit ? Number(request.query.limit) : 50) };
  });
}
