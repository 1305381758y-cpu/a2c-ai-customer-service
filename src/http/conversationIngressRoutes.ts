import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { Repositories } from "../repositories.js";
import type { ConversationEngine } from "../services/conversationEngine.js";
import { requireInternalApiKey } from "./internalApiKeyAuth.js";

type ConversationIngressDeps = {
  config: AppConfig;
  repos: Repositories;
  conversationEngine: ConversationEngine;
};

export function registerConversationIngressRoutes(app: FastifyInstance, deps: ConversationIngressDeps): void {
  app.post<{ Querystring: { limit?: string } }>("/internal/follow-ups/due", { preHandler: requireInternalApiKey(deps.config) }, async (request) => {
    const limit = request.query.limit ? Number(request.query.limit) : 50;
    return deps.conversationEngine.processDueFollowUps(Number.isFinite(limit) ? limit : 50);
  });

  app.post("/webhooks/a2c", async (request, reply) => {
    if (shouldProcessA2CWebhookAsync()) {
      return reply.code(200).send(deps.conversationEngine.enqueueInboundMessage({ payload: request.body as never }));
    }
    const result = await deps.conversationEngine.handleInboundMessage({ payload: request.body as never });
    return reply.code(200).send(result);
  });

  app.post<{ Params: { merchantId: string } }>("/webhooks/a2c/:merchantId", async (request, reply) => {
    const merchant = deps.repos.getMerchant(request.params.merchantId);
    if (!merchant || merchant.status !== "active") return reply.code(404).send({ error: "merchant not found" });
    if (shouldProcessA2CWebhookAsync()) {
      return reply.code(200).send(deps.conversationEngine.enqueueInboundMessage({ payload: request.body as never, merchantId: merchant.id }));
    }
    const result = await deps.conversationEngine.handleInboundMessage({ payload: request.body as never, merchantId: merchant.id });
    return reply.code(200).send(result);
  });
}

function shouldProcessA2CWebhookAsync(): boolean {
  if (process.env.WEBHOOK_ASYNC_ENABLED === "false") return false;
  if (process.env.WEBHOOK_ASYNC_ENABLED === "true") return true;
  return process.env.NODE_ENV !== "test";
}
