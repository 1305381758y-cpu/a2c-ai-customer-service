import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { parseTrainingSamples } from "./import/trainingSamples.js";
import type { AppConfig } from "./config.js";
import type { Repositories } from "./repositories.js";
import type { WebhookProcessor } from "./services/webhookProcessor.js";

export function registerRoutes(app: FastifyInstance, deps: { config: AppConfig; repos: Repositories; processor: WebhookProcessor }): void {
  app.get("/", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>A2C AI 自动客服</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; color: #17202a; background: #f7f8fb; }
      main { max-width: 760px; margin: 0 auto; padding: 56px 20px; }
      section { background: #fff; border: 1px solid #e6e8ef; border-radius: 8px; padding: 28px; box-shadow: 0 12px 30px rgba(20, 30, 50, .06); }
      h1 { margin: 0 0 10px; font-size: 28px; }
      p { line-height: 1.65; }
      code { display: block; padding: 12px; background: #f1f3f7; border-radius: 6px; overflow-wrap: anywhere; }
      .ok { color: #087443; font-weight: 700; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>A2C AI 自动客服</h1>
        <p class="ok">服务已在线运行</p>
        <p>A2C Webhook 地址：</p>
        <code>https://a2c-ai-customer-service.onrender.com/webhooks/a2c</code>
        <p>健康检查：</p>
        <code>https://a2c-ai-customer-service.onrender.com/health</code>
      </section>
    </main>
  </body>
</html>`);
  });

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
