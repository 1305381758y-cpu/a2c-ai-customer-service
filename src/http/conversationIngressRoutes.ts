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
    const result = await deps.conversationEngine.receiveInboundMessage({ payload: request.body as never });
    return reply.code(200).send(result);
  });

  app.get<{ Params: { merchantId: string } }>("/webhooks/a2c/:merchantId", async (request, reply) => {
    const merchant = deps.repos.getMerchant(request.params.merchantId);
    if (!merchant || merchant.status !== "active") return reply.code(404).send({ code: 1, message: "merchant not found" });
    const configuredToken = deps.repos.getMerchantConfig(merchant.id).a2cWebhookVerifyToken;
    const receivedToken = String(request.headers["x-verify-token"] || "");
    if (!configuredToken || receivedToken !== configuredToken) {
      return reply.code(401).send({ code: 1, message: "verify token invalid", data: { verifyToken: receivedToken } });
    }
    return reply.type("application/json").send({ code: 0, message: "success", data: { verifyToken: receivedToken } });
  });

  app.post<{ Params: { merchantId: string } }>("/webhooks/a2c/:merchantId", async (request, reply) => {
    const merchant = deps.repos.getMerchant(request.params.merchantId);
    if (!merchant || merchant.status !== "active") return reply.code(404).send({ error: "merchant not found" });
    const result = await deps.conversationEngine.receiveInboundMessage({ payload: request.body as never, merchantId: merchant.id });
    return reply.code(200).send(result);
  });
}
