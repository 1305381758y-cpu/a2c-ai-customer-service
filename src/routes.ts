import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { parseTrainingSamples } from "./import/trainingSamples.js";
import type { AppConfig } from "./config.js";
import type { Repositories } from "./repositories.js";
import type { WebhookProcessor } from "./services/webhookProcessor.js";

export function registerRoutes(app: FastifyInstance, deps: { config: AppConfig; repos: Repositories; processor: WebhookProcessor }): void {
  app.get("/health", async () => ({ ok: true }));

  app.post("/internal/training-samples/import", { preHandler: auth(deps.config) }, async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.code(400).send({ error: "file is required" });
    const buffer = await file.toBuffer();
    let samples;
    try {
      samples = await parseTrainingSamples(buffer, file.filename);
    } catch (error) {
      return reply.code(400).send({
        error: "invalid training sample file",
        message: error instanceof Error ? error.message : "unknown parse error"
      });
    }
    const imported = deps.repos.insertTrainingSamples(samples);
    return { imported, enabled: imported };
  });

  app.get<{
    Querystring: { language?: string; intent?: string; stage?: string; enabled?: string };
  }>("/internal/training-samples", { preHandler: auth(deps.config) }, async (request) => {
    return {
      rows: deps.repos.listTrainingSamples({
        language: request.query.language,
        intent: request.query.intent,
        stage: request.query.stage,
        enabled: request.query.enabled === undefined ? undefined : request.query.enabled === "true" || request.query.enabled === "1"
      })
    };
  });

  app.patch<{
    Params: { id: string };
    Body: Record<string, unknown>;
  }>("/internal/training-samples/:id", { preHandler: auth(deps.config) }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "invalid id" });
    const row = deps.repos.patchTrainingSample(id, request.body ?? {});
    if (!row) return reply.code(404).send({ error: "sample not found" });
    return row;
  });

  app.get<{
    Querystring: { status?: string; language?: string; limit?: string };
  }>("/internal/conversations", { preHandler: auth(deps.config) }, async (request) => {
    return {
      rows: deps.repos.listConversations({
        status: request.query.status,
        language: request.query.language,
        limit: request.query.limit ? Number(request.query.limit) : undefined
      })
    };
  });

  app.get<{
    Params: { id: string };
    Querystring: { limit?: string };
  }>("/internal/conversations/:id/messages", { preHandler: auth(deps.config) }, async (request, reply) => {
    const conversation = deps.repos.getConversation(request.params.id);
    if (!conversation) return reply.code(404).send({ error: "conversation not found" });
    return {
      conversation,
      rows: deps.repos.listConversationMessages(
        request.params.id,
        request.query.limit ? Number(request.query.limit) : 50
      )
    };
  });

  app.post("/webhooks/a2c", async (request, reply) => {
    const result = await deps.processor.process(request.body as never);
    return reply.code(200).send(result);
  });
}

function auth(config: AppConfig) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.headers["x-api-key"] !== config.INTERNAL_API_KEY) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  };
}
