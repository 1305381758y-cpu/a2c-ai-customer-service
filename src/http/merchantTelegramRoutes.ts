import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { requireUser } from "../auth.js";
import type { AppConfig } from "../config.js";
import type { MerchantConfigRecord, Repositories } from "../repositories.js";
import {
  handleTelegramWebhookUpdate,
  setupTelegramWebhook as setupTelegramWebhookBinding,
  type TelegramSetupResult,
  type TelegramUpdate,
  type TelegramWebhookResult
} from "../services/telegramBinding.js";
import { scopedMerchantId } from "./routeHelpers.js";

type MerchantTelegramRoutesDeps = {
  config: AppConfig;
  repos: Repositories;
  adminOnly: ReturnType<typeof requireUser>;
  merchantAdmins: ReturnType<typeof requireUser>;
  maskConfig: (config: MerchantConfigRecord) => Record<string, unknown>;
};

export function registerMerchantTelegramRoutes(app: FastifyInstance, deps: MerchantTelegramRoutesDeps): void {
  app.post<{ Params: { id: string } }>("/api/admin/merchants/:id/telegram/setup-webhook", { preHandler: deps.adminOnly }, async (request, reply) => setupTelegramWebhook(request, reply, deps, request.params.id));
  app.post("/api/merchant/telegram/setup-webhook", { preHandler: deps.merchantAdmins }, async (request, reply) => setupTelegramWebhook(request, reply, deps, scopedMerchantId(request)));
}

export function registerTelegramWebhookRoutes(app: FastifyInstance, deps: { config: AppConfig; repos: Repositories }): void {
  app.post<{ Params: { merchantId: string }; Body: TelegramUpdate }>("/webhooks/telegram/:merchantId", async (request, reply) => {
    const result = handleTelegramWebhookUpdate(deps.repos, deps.config, request.params.merchantId, String(request.headers["x-telegram-bot-api-secret-token"] || ""), request.body);
    return sendWebhookResult(reply, result);
  });
}

async function setupTelegramWebhook(request: FastifyRequest, reply: FastifyReply, deps: MerchantTelegramRoutesDeps, merchantId: string) {
  return sendSetupResult(reply, await setupTelegramWebhookBinding(deps.repos, deps.config, deps.maskConfig, merchantId, requestOrigin(request)));
}

function requestOrigin(request: FastifyRequest): string {
  const proto = String(request.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = request.headers["x-forwarded-host"] || request.headers.host || "localhost";
  return `${proto}://${host}`;
}

function sendSetupResult(reply: FastifyReply, result: TelegramSetupResult) {
  if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
  return result.value;
}

function sendWebhookResult(reply: FastifyReply, result: TelegramWebhookResult) {
  if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
  return reply.code(200).send(result.value);
}
