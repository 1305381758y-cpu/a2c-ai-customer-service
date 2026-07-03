import type { Repositories, ScriptFlowRecord, ScriptFlowRuntime, ScriptFlowStepRecord, ScriptFlowVersionRecord } from "../repositories.js";

export type ScriptFlowListQuery = {
  merchantId?: string;
  countryId?: string;
  status?: string;
};

export type ScriptFlowResult<T> =
  | { ok: true; value: T }
  | { ok: false; statusCode: 400 | 404; error: string };

export function listScriptFlows(repos: Repositories, query: ScriptFlowListQuery, merchantId?: string): { rows: ScriptFlowRecord[] } {
  return {
    rows: repos.listScriptFlows({
      merchantId: merchantId ?? query.merchantId,
      countryId: query.countryId,
      status: query.status
    })
  };
}

export function getScriptFlowDetail(
  repos: Repositories,
  id: string,
  merchantId?: string
): ScriptFlowResult<ScriptFlowRuntime & { versions: ScriptFlowVersionRecord[] }> {
  const flowId = Number(id);
  const row = repos.getScriptFlow(flowId, merchantId);
  if (!row) return notFound("script flow not found");
  return { ok: true, value: { ...row, versions: repos.listScriptFlowVersions(flowId, merchantId) } };
}

export function patchScriptFlow(repos: Repositories, id: string, merchantId: string | undefined, patch: Record<string, unknown>, userName: string): ScriptFlowResult<ScriptFlowRuntime> {
  const row = repos.patchScriptFlow(Number(id), merchantId, patch, userName);
  if (!row) return notFound("script flow not found");
  return { ok: true, value: row };
}

export function deleteScriptFlow(repos: Repositories, id: string, merchantId?: string): ScriptFlowResult<{ ok: true }> {
  try {
    const ok = repos.deleteScriptFlow(Number(id), merchantId);
    if (!ok) return notFound("script flow not found");
    return { ok: true, value: { ok: true } };
  } catch (error) {
    return badRequest(error, "delete failed");
  }
}

export function enableScriptFlow(
  repos: Repositories,
  id: string,
  merchantId: string | undefined,
  userName: string,
  options: { enableStrictFlowConfig?: boolean } = {}
): ScriptFlowResult<ScriptFlowRuntime> {
  const row = repos.enableScriptFlow(Number(id), merchantId, userName);
  if (!row) return notFound("script flow not found");
  if (options.enableStrictFlowConfig) repos.patchMerchantConfig(row.flow.merchantId, { strictScriptFlowEnabled: true });
  return { ok: true, value: row };
}

export function restoreScriptFlowVersion(
  repos: Repositories,
  flowId: string,
  versionId: string,
  merchantId: string | undefined,
  userName: string
): ScriptFlowResult<ScriptFlowRuntime> {
  const row = repos.restoreScriptFlowVersion(Number(flowId), Number(versionId), merchantId, userName);
  if (!row) return notFound("script flow version not found");
  return { ok: true, value: row };
}

export function createScriptFlowStep(
  repos: Repositories,
  flowId: string,
  merchantId: string | undefined,
  input: Record<string, unknown>,
  userName: string
): ScriptFlowResult<ScriptFlowStepRecord> {
  try {
    const row = repos.createScriptFlowStep(Number(flowId), merchantId, input, userName);
    if (!row) return notFound("script flow not found");
    return { ok: true, value: row };
  } catch (error) {
    return badRequest(error, "invalid step");
  }
}

export function patchScriptFlowStep(repos: Repositories, id: string, merchantId: string | undefined, patch: Record<string, unknown>, userName: string): ScriptFlowResult<ScriptFlowStepRecord> {
  const row = repos.patchScriptFlowStep(Number(id), merchantId, patch, userName);
  if (!row) return notFound("script flow step not found");
  return { ok: true, value: row };
}

export function duplicateScriptFlowStep(repos: Repositories, id: string, merchantId: string | undefined, userName: string): ScriptFlowResult<ScriptFlowStepRecord> {
  const row = repos.duplicateScriptFlowStep(Number(id), merchantId, userName);
  if (!row) return notFound("script flow step not found");
  return { ok: true, value: row };
}

export function deleteScriptFlowStep(repos: Repositories, id: string, merchantId: string | undefined, userName: string): ScriptFlowResult<{ ok: true }> {
  try {
    const ok = repos.deleteScriptFlowStep(Number(id), merchantId, userName);
    if (!ok) return notFound("script flow step not found");
    return { ok: true, value: { ok: true } };
  } catch (error) {
    return badRequest(error, "delete failed");
  }
}

function notFound(error: string): ScriptFlowResult<never> {
  return { ok: false, statusCode: 404, error };
}

function badRequest(cause: unknown, fallback: string): ScriptFlowResult<never> {
  return { ok: false, statusCode: 400, error: cause instanceof Error ? cause.message : fallback };
}
