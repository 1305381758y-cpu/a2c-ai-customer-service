import { A2CClient } from "../clients/a2c.js";
import type { AppConfig } from "../config.js";
import type { MerchantA2CAccountRecord, MerchantConfigRecord, Repositories } from "../repositories.js";
import { appConfigForMerchant } from "./runtimeConfig.js";

type MerchantA2CAccountResult<T> =
  | { ok: true; value: T }
  | { ok: false; statusCode: 400 | 404 | 502; error: string };

export function listMerchantA2CAccounts(
  repos: Repositories,
  merchantId: string
): { rows: MerchantA2CAccountRecord[] } {
  return { rows: repos.listMerchantA2CAccounts({ merchantId }) };
}

export function patchMerchantA2CAccount(
  repos: Repositories,
  accountIdParam: string,
  patch: Record<string, unknown>,
  options: {
    merchantId?: string;
    maskConfig: (config: MerchantConfigRecord) => Record<string, unknown>;
  }
): MerchantA2CAccountResult<{ row: MerchantA2CAccountRecord; config: Record<string, unknown> }> {
  const id = Number(accountIdParam);
  if (!Number.isInteger(id)) return { ok: false, statusCode: 400, error: "invalid id" };
  const row = repos.patchMerchantA2CAccount(id, patch, options.merchantId);
  if (!row) return { ok: false, statusCode: 404, error: "a2c account not found" };
  return {
    ok: true,
    value: {
      row,
      config: options.maskConfig(repos.getMerchantConfig(row.merchantId))
    }
  };
}

export async function syncMerchantA2CAccountsFromRemote(
  repos: Repositories,
  baseConfig: AppConfig,
  merchantId: string,
  maskConfig: (config: MerchantConfigRecord) => Record<string, unknown>
): Promise<MerchantA2CAccountResult<SyncMerchantA2CAccountsValue>> {
  const merchant = repos.getMerchant(merchantId);
  if (!merchant) return { ok: false, statusCode: 404, error: "merchant not found" };

  const cfg = repos.getMerchantConfig(merchantId);
  const client = new A2CClient(appConfigForMerchant(baseConfig, cfg), repos.a2cTokenStore(merchantId));
  try {
    const accounts = await client.listAccounts();
    const rows = repos.syncMerchantA2CAccounts(merchantId, accounts);
    return {
      ok: true,
      value: {
        imported: rows.length,
        rows,
        config: maskConfig(repos.getMerchantConfig(merchantId))
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "A2C accounts sync failed";
    const existingRows = localA2CAccountsForRateLimitFallback(repos, merchantId, cfg);
    if (existingRows.length && isA2CRateLimitMessage(message)) {
      return {
        ok: true,
        value: {
          imported: 0,
          rows: existingRows,
          config: maskConfig(repos.getMerchantConfig(merchantId)),
          stale: true,
          warning: "A2C 当前限制认证请求，已继续使用本地保存的客服账号。请 10 分钟后再刷新账号。"
        }
      };
    }
    return { ok: false, statusCode: 502, error: message };
  }
}

type SyncMerchantA2CAccountsValue = {
  imported: number;
  rows: MerchantA2CAccountRecord[];
  config: Record<string, unknown>;
  stale?: boolean;
  warning?: string;
};

function localA2CAccountsForRateLimitFallback(
  repos: Repositories,
  merchantId: string,
  cfg: MerchantConfigRecord
): MerchantA2CAccountRecord[] {
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
