import type { Repositories, ScriptFlowRecord, ScriptFlowRuntime, ScriptFlowStepRecord, ScriptFlowVersionRecord } from "../repositories.js";
import { builtInStrictScriptFlowSteps, labelScriptStep } from "./scriptFlowBuiltIns.js";

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

export function createBuiltInStrictScriptFlow(
  repos: Repositories,
  merchantId: string | undefined,
  input: { merchantId?: string; countryId?: string; name?: string },
  userName: string
): ScriptFlowResult<ScriptFlowRuntime> {
  const targetMerchantId = merchantId ?? input.merchantId;
  if (!targetMerchantId) return { ok: false, statusCode: 400, error: "请选择商户" };
  try {
    const flow = repos.createScriptFlow(targetMerchantId, {
      name: input.name?.trim() || "严格业务流程",
      countryId: input.countryId,
      sourceFilename: "系统内置",
      steps: builtInStrictScriptFlowSteps(),
      createdBy: userName || "系统"
    });
    return { ok: true, value: flow };
  } catch (error) {
    return badRequest(error, "create built-in script flow failed");
  }
}

export function patchScriptFlow(repos: Repositories, id: string, merchantId: string | undefined, patch: Record<string, unknown>, userName: string): ScriptFlowResult<ScriptFlowRuntime> {
  const activatingViaStatus = String(patch.status || "").toLowerCase() === "active";
  if (activatingViaStatus) {
    const current = repos.getScriptFlow(Number(id), merchantId);
    if (!current) return notFound("script flow not found");
    const validationErrors = validateScriptFlowForEnable(current);
    if (validationErrors.length) return { ok: false, statusCode: 400, error: `话本流程暂不能启用：${validationErrors.join("；")}` };
  }
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
  const current = repos.getScriptFlow(Number(id), merchantId);
  if (!current) return notFound("script flow not found");
  const validationErrors = validateScriptFlowForEnable(current);
  if (validationErrors.length) return { ok: false, statusCode: 400, error: `话本流程暂不能启用：${validationErrors.join("；")}` };
  const row = repos.enableScriptFlow(Number(id), merchantId, userName);
  if (!row) return notFound("script flow not found");
  if (options.enableStrictFlowConfig) repos.patchMerchantConfig(row.flow.merchantId, { strictScriptFlowEnabled: true });
  return { ok: true, value: row };
}

export function validateScriptFlowForEnable(flow: ScriptFlowRuntime): string[] {
  const enabledSteps = flow.steps.filter((step) => step.enabled).sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id);
  const errors: string[] = [];
  if (!enabledSteps.length) return ["至少需要 1 个启用节点"];

  const flowCodes = new Set(enabledSteps.map((step) => step.flowCode.trim()).filter(Boolean));
  const flowSteps = new Set(enabledSteps.map((step) => step.flowStep.trim()).filter(Boolean));
  const duplicateCodes = duplicates(enabledSteps.map((step) => step.flowCode.trim()).filter(Boolean));
  if (duplicateCodes.length) errors.push(`流程编号重复：${duplicateCodes.join("、")}`);

  for (const step of enabledSteps) {
    const name = step.flowName || step.flowCode || `节点 ${step.id}`;
    if (!step.flowCode.trim()) errors.push(`${name} 缺少流程编号`);
    if (!step.flowName.trim()) errors.push(`${name} 缺少流程名称`);
    if (!step.standardReply.trim()) errors.push(`${name} 缺少客服标准话术`);
    if ((step.sendLink || step.sendInvite) && !(step.sendLink && step.sendInvite)) {
      errors.push(`${name} 发送注册信息时需要同时开启注册链接和邀请码`);
    }
    if (step.sendLink && !containsAny(step.standardReply, ["{{REGISTER_URL}}", "{{INVITE_DISPLAY}}"])) {
      errors.push(`${name} 已开启发链接，但话术里缺少 {{REGISTER_URL}} 或 {{INVITE_DISPLAY}}`);
    }
    if (step.sendInvite && !containsAny(step.standardReply, ["{{INVITE_CODE}}", "{{INVITE_DISPLAY}}"])) {
      errors.push(`${name} 已开启发邀请码，但话术里缺少 {{INVITE_CODE}} 或 {{INVITE_DISPLAY}}`);
    }
    if (step.flowStep === "collect_telegram" && !containsAny(step.standardReply, ["{{TG_LINK}}", "{{TELEGRAM_LINK}}"])) {
      errors.push(`${name} 是发送TG链接节点，话术里需要包含 {{TG_LINK}}`);
    }
    if (step.nextFlowCode && !flowCodes.has(step.nextFlowCode.trim())) {
      errors.push(`${name} 的下一流程编号“${step.nextFlowCode}”不存在`);
    }
    if (step.nextFlowStep && !flowSteps.has(step.nextFlowStep.trim())) {
      errors.push(`${name} 的下一系统步骤 ${labelScriptStep(step.nextFlowStep)} 不存在`);
    }
  }

  return [...new Set(errors)].slice(0, 8);
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

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

function containsAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}
