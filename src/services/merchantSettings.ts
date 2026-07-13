import type { MerchantAgentProfileRecord, MerchantConfigRecord, Repositories } from "../repositories.js";
import { validateScriptFlowForEnable } from "./scriptFlows.js";

type MerchantConfigPatchResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; statusCode: 400; error: string };

export function getMaskedMerchantConfig(repos: Repositories, merchantId: string): Record<string, unknown> {
  return maskConfig(repos.getMerchantConfig(merchantId));
}

export function getMerchantVisibleConfig(repos: Repositories, merchantId: string): Record<string, unknown> {
  return stripAiConfig(maskConfig(repos.getMerchantConfig(merchantId)));
}

export function patchMaskedMerchantConfig(
  repos: Repositories,
  merchantId: string,
  patch: Record<string, unknown>,
  userName = "系统"
): MerchantConfigPatchResult {
  const cleaned = cleanConfigPatch(patch);
  if (isEnablingStrictScriptFlow(cleaned)) {
    const activeFlows = repos.listScriptFlows({ merchantId, status: "active" }).filter((flow) => flow.active);
    const activeFlow = activeFlows[0] ? repos.getScriptFlow(activeFlows[0].id, merchantId) : undefined;
    if (!activeFlow) {
      return { ok: false, statusCode: 400, error: "开启话本流程前，请先在“话本流程”页面启用一个有效流程。" };
    }
    const validationErrors = validateScriptFlowForEnable(activeFlow);
    if (validationErrors.length) {
      return { ok: false, statusCode: 400, error: `当前启用话本存在问题：${validationErrors.join("；")}` };
    }
  }
  const saved = repos.patchMerchantConfig(merchantId, cleaned);
  const changedKeys = Object.keys(cleaned);
  if (changedKeys.length) repos.recordMerchantConfigVersion(merchantId, changedKeys, userName);
  return { ok: true, value: maskConfig(saved) };
}

export function patchMerchantVisibleConfig(repos: Repositories, merchantId: string, patch: Record<string, unknown>, userName = "系统"): MerchantConfigPatchResult {
  return patchMaskedMerchantConfig(repos, merchantId, stripMerchantEditableConfig(patch), userName);
}

export function listMerchantConfigVersions(repos: Repositories, merchantId: string): { rows: ReturnType<Repositories["listMerchantConfigVersions"]> } {
  return { rows: repos.listMerchantConfigVersions(merchantId) };
}

export function restoreMerchantConfigVersion(repos: Repositories, merchantId: string, versionId: string, userName: string): MerchantConfigPatchResult {
  const restored = repos.restoreMerchantConfigVersion(merchantId, Number(versionId), userName);
  if (!restored) return { ok: false, statusCode: 400, error: "配置版本不存在或不属于当前商户" };
  return { ok: true, value: maskConfig(restored) };
}

export function restoreMerchantVisibleConfigVersion(repos: Repositories, merchantId: string, versionId: string, userName: string): MerchantConfigPatchResult {
  const current = repos.getMerchantConfig(merchantId);
  const restored = repos.restoreMerchantConfigVersion(merchantId, Number(versionId), userName);
  if (!restored) return { ok: false, statusCode: 400, error: "配置版本不存在或不属于当前商户" };
  const preserved = repos.patchMerchantConfig(merchantId, {
    aiProvider: current.aiProvider,
    minimaxApiKey: current.minimaxApiKey,
    minimaxModel: current.minimaxModel,
    deepseekApiKey: current.deepseekApiKey,
    deepseekModel: current.deepseekModel,
    googleAiApiKey: current.googleAiApiKey,
    googleAiModel: current.googleAiModel
  });
  return { ok: true, value: stripAiConfig(maskConfig(preserved)) };
}

export function getMerchantAgentProfile(repos: Repositories, merchantId: string): MerchantAgentProfileRecord {
  return repos.getMerchantAgentProfile(merchantId);
}

export function patchMerchantAgentProfile(
  repos: Repositories,
  merchantId: string,
  patch: Record<string, unknown>,
  userName = "系统"
): MerchantAgentProfileRecord {
  const cleaned = cleanAgentProfilePatch(patch);
  const saved = repos.patchMerchantAgentProfile(merchantId, cleaned);
  const changedKeys = Object.keys(cleaned);
  if (changedKeys.length) repos.recordMerchantAgentProfileVersion(merchantId, changedKeys, userName);
  return saved;
}

export function listMerchantAgentProfileVersions(repos: Repositories, merchantId: string): { rows: ReturnType<Repositories["listMerchantAgentProfileVersions"]> } {
  return { rows: repos.listMerchantAgentProfileVersions(merchantId) };
}

export function restoreMerchantAgentProfileVersion(repos: Repositories, merchantId: string, versionId: string, userName: string): MerchantAgentProfileRecord | undefined {
  return repos.restoreMerchantAgentProfileVersion(merchantId, Number(versionId), userName);
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

function isEnablingStrictScriptFlow(patch: Record<string, unknown>): boolean {
  if (!Object.hasOwn(patch, "strictScriptFlowEnabled")) return false;
  const value = patch.strictScriptFlowEnabled;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true" || value === "1" || value === "on";
  return false;
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

function stripAiConfig(value: Record<string, unknown>): Record<string, unknown> {
  const result = { ...value };
  for (const key of ["openaiApiKey", "openaiModel", "aiProvider", "minimaxApiKey", "minimaxModel", "deepseekApiKey", "deepseekModel", "googleAiApiKey", "googleAiModel"]) delete result[key];
  return result;
}

function stripMerchantEditableConfig(value: Record<string, unknown>): Record<string, unknown> {
  const result = stripAiConfig(value);
  for (const key of ["sessionPrice", "balance", "balanceCurrency"]) delete result[key];
  return result;
}
