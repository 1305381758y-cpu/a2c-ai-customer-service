import type { FastifyInstance, FastifyReply } from "fastify";
import type { requireUser } from "../auth.js";
import type { AppConfig } from "../config.js";
import type { MerchantConfigRecord, Repositories } from "../repositories.js";
import {
  listMerchantA2CAccounts,
  patchMerchantA2CAccount,
  syncMerchantA2CAccountsFromRemote
} from "../services/merchantA2CAccounts.js";
import { scopedMerchantId } from "./routeHelpers.js";

type MerchantA2CAccountRoutesDeps = {
  config: AppConfig;
  repos: Repositories;
  adminOnly: ReturnType<typeof requireUser>;
  merchantRoles: ReturnType<typeof requireUser>;
  merchantAdmins: ReturnType<typeof requireUser>;
  maskConfig: (config: MerchantConfigRecord) => Record<string, unknown>;
};

export function registerMerchantA2CAccountRoutes(app: FastifyInstance, deps: MerchantA2CAccountRoutesDeps): void {
  registerAdminA2CAccountRoutes(app, deps);
  registerMerchantOwnA2CAccountRoutes(app, deps);
}

function registerAdminA2CAccountRoutes(app: FastifyInstance, deps: MerchantA2CAccountRoutesDeps): void {
  app.get<{ Params: { id: string } }>("/api/admin/merchants/:id/a2c/accounts", { preHandler: deps.adminOnly }, async (request) =>
    listMerchantA2CAccounts(deps.repos, request.params.id)
  );
  app.post<{ Params: { id: string } }>("/api/admin/merchants/:id/a2c/accounts/sync", { preHandler: deps.adminOnly }, async (request, reply) =>
    sendResult(reply, await syncMerchantA2CAccountsFromRemote(deps.repos, deps.config, request.params.id, deps.maskConfig))
  );
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/a2c/accounts/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    return sendResult(reply, patchMerchantA2CAccount(deps.repos, request.params.id, request.body ?? {}, { maskConfig: deps.maskConfig }));
  });
}

function registerMerchantOwnA2CAccountRoutes(app: FastifyInstance, deps: MerchantA2CAccountRoutesDeps): void {
  app.get("/api/merchant/a2c/accounts", { preHandler: deps.merchantRoles }, async (request) =>
    listMerchantA2CAccounts(deps.repos, scopedMerchantId(request))
  );
  app.post("/api/merchant/a2c/accounts/sync", { preHandler: deps.merchantAdmins }, async (request, reply) =>
    sendResult(reply, await syncMerchantA2CAccountsFromRemote(deps.repos, deps.config, scopedMerchantId(request), deps.maskConfig))
  );
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/a2c/accounts/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    return sendResult(
      reply,
      patchMerchantA2CAccount(deps.repos, request.params.id, request.body ?? {}, {
        merchantId: scopedMerchantId(request),
        maskConfig: deps.maskConfig
      })
    );
  });
}

function sendResult<T>(
  reply: FastifyReply,
  result: { ok: true; value: T } | { ok: false; statusCode: 400 | 404 | 502; error: string }
): T | FastifyReply {
  if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
  return result.value;
}
