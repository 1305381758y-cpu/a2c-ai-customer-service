import type { MerchantAgentProfileRecord, MerchantConfigRecord, Repositories } from "../repositories.js";

export function getMaskedMerchantConfig(repos: Repositories, merchantId: string): Record<string, unknown> {
  return maskConfig(repos.getMerchantConfig(merchantId));
}

export function patchMaskedMerchantConfig(
  repos: Repositories,
  merchantId: string,
  patch: Record<string, unknown>
): Record<string, unknown> {
  return maskConfig(repos.patchMerchantConfig(merchantId, cleanConfigPatch(patch)));
}

export function getMerchantAgentProfile(repos: Repositories, merchantId: string): MerchantAgentProfileRecord {
  return repos.getMerchantAgentProfile(merchantId);
}

export function patchMerchantAgentProfile(
  repos: Repositories,
  merchantId: string,
  patch: Record<string, unknown>
): MerchantAgentProfileRecord {
  return repos.patchMerchantAgentProfile(merchantId, cleanAgentProfilePatch(patch));
}

export function maskConfig(config: MerchantConfigRecord): Record<string, unknown> {
  const { a2cTokenCacheKey: _cacheKey, a2cAccessToken: _accessToken, a2cTokenExpiresAt: _expiresAt, a2cAuthBlockedUntil: _blockedUntil, ...safeConfig } = config;
  return {
    ...safeConfig,
    a2cAppSecret: maskSecret(config.a2cAppSecret),
    openaiApiKey: maskSecret(config.openaiApiKey),
    minimaxApiKey: maskSecret(config.minimaxApiKey),
    deepseekApiKey: maskSecret(config.deepseekApiKey),
    googleAiApiKey: maskSecret(config.googleAiApiKey),
    telegramBotToken: maskSecret(config.telegramBotToken)
  };
}

function maskSecret(value: string): string {
  if (!value) return "";
  if (value === "CHANGE_ME") return value;
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

function cleanConfigPatch(patch: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === "string" && value.includes("••••")) continue;
    cleaned[key] = value;
  }
  return cleaned;
}

function cleanAgentProfilePatch(patch: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set([
    "agentName",
    "roleDefinition",
    "toneStyle",
    "coreGoal",
    "mustFollow",
    "forbidden",
    "uncertaintyPolicy",
    "handoffPolicy",
    "enabled"
  ]);
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key)) continue;
    cleaned[key] = key === "enabled" ? Boolean(value) : String(value ?? "").trim();
  }
  return cleaned;
}
