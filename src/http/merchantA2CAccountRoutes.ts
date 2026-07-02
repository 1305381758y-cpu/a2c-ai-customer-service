import type { FastifyInstance, FastifyReply } from "fastify";
import type { requireUser } from "../auth.js";
import { A2CClient } from "../clients/a2c.js";
import type { AppConfig } from "../config.js";
import type { MerchantConfigRecord, Repositories } from "../repositories.js";
import { appConfigForMerchant } from "../services/runtimeConfig.js";
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
  app.get<{ Params: { id: string } }>("/api/admin/merchants/:id/a2c/accounts", { preHandler: deps.adminOnly }, async (request) => ({
    rows: deps.repos.listMerchantA2CAccounts({ merchantId: request.params.id })
  }));
  app.post<{ Params: { id: string } }>("/api/admin/merchants/:id/a2c/accounts/sync", { preHandler: deps.adminOnly }, async (request, reply) => syncA2CAccounts(reply, deps, request.params.id));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/admin/a2c/accounts/:id", { preHandler: deps.adminOnly }, async (request, reply) => {
    const id = parseA2CAccountId(request.params.id, reply);
    if (id === undefined) return;
    const row = deps.repos.patchMerchantA2CAccount(id, request.body ?? {});
    if (!row) return reply.code(404).send({ error: "a2c account not found" });
    return { row, config: deps.maskConfig(deps.repos.getMerchantConfig(row.merchantId)) };
  });
}

function registerMerchantOwnA2CAccountRoutes(app: FastifyInstance, deps: MerchantA2CAccountRoutesDeps): void {
  app.get("/api/merchant/a2c/accounts", { preHandler: deps.merchantRoles }, async (request) => ({
    rows: deps.repos.listMerchantA2CAccounts({ merchantId: scopedMerchantId(request) })
  }));
  app.post("/api/merchant/a2c/accounts/sync", { preHandler: deps.merchantAdmins }, async (request, reply) => syncA2CAccounts(reply, deps, scopedMerchantId(request)));
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/a2c/accounts/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    const id = parseA2CAccountId(request.params.id, reply);
    if (id === undefined) return;
    const row = deps.repos.patchMerchantA2CAccount(id, request.body ?? {}, scopedMerchantId(request));
    if (!row) return reply.code(404).send({ error: "a2c account not found" });
    return { row, config: deps.maskConfig(deps.repos.getMerchantConfig(row.merchantId)) };
  });
}

async function syncA2CAccounts(reply: FastifyReply, deps: Pick<MerchantA2CAccountRoutesDeps, "config" | "repos" | "maskConfig">, merchantId: string) {
  const merchant = deps.repos.getMerchant(merchantId);
  if (!merchant) return reply.code(404).send({ error: "merchant not found" });
  const cfg = deps.repos.getMerchantConfig(merchantId);
  const client = new A2CClient(appConfigForMerchant(deps.config, cfg), deps.repos.a2cTokenStore(merchantId));
  try {
    const accounts = await client.listAccounts();
    const rows = deps.repos.syncMerchantA2CAccounts(merchantId, accounts);
    return {
      imported: rows.length,
      rows,
      config: deps.maskConfig(deps.repos.getMerchantConfig(merchantId))
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "A2C accounts sync failed";
    const existingRows = localA2CAccountsForRateLimitFallback(deps.repos, merchantId, cfg);
    if (existingRows.length && isA2CRateLimitMessage(message)) {
      return {
        imported: 0,
        rows: existingRows,
        config: deps.maskConfig(deps.repos.getMerchantConfig(merchantId)),
        stale: true,
        warning: "A2C 当前限制认证请求，已继续使用本地保存的客服账号。请 10 分钟后再刷新账号。"
      };
    }
    return reply.code(502).send({ error: message });
  }
}

function parseA2CAccountId(value: string, reply: FastifyReply): number | undefined {
  const id = Number(value);
  if (!Number.isInteger(id)) {
    reply.code(400).send({ error: "invalid id" });
    return undefined;
  }
  return id;
}

function localA2CAccountsForRateLimitFallback(repos: Repositories, merchantId: string, cfg: MerchantConfigRecord) {
  const rows = repos.listMerchantA2CAccounts({ merchantId });
  if (rows.length) return rows;
  const configuredAccounts = cfg.a2cAccountPhone
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((apiPhone) => ({ apiPhone }));
  if (!configuredAccounts.length) return rows;
  return repos.syncMerchantA2CAccounts(merchantId, configuredAccounts);
}

function isA2CRateLimitMessage(message: string): boolean {
  return /(visit too frequently|too frequent|rate limit|too many requests|请求.*频繁|访问.*频繁|稍后再试|频繁)/i.test(message);
}
