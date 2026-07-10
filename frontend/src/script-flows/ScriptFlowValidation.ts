import type { ScriptFlowStep } from "../types.js";

export type ScriptFlowValidationIssue = {
  message: string;
  stepId?: number;
};

export function validateScriptFlowDraft(steps: ScriptFlowStep[]): string[] {
  return validateScriptFlowIssues(steps).map((issue) => issue.message);
}

export function validateScriptFlowIssues(steps: ScriptFlowStep[]): ScriptFlowValidationIssue[] {
  const enabledSteps = steps
    .filter((step) => step.enabled)
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0));
  if (!enabledSteps.length) return [{ message: "至少需要 1 个启用节点" }];

  const codes = new Set(enabledSteps.map((step) => step.flowCode?.trim()).filter(Boolean));
  const flowSteps = new Set(enabledSteps.map((step) => step.flowStep?.trim()).filter(Boolean));
  const warnings: ScriptFlowValidationIssue[] = [];
  const seenCodes = new Set<string>();

  for (const step of enabledSteps) {
    const code = step.flowCode?.trim();
    if (code && seenCodes.has(code)) warnings.push({ message: `流程编号重复：${code}`, stepId: step.id });
    if (code) seenCodes.add(code);

    const name = step.flowName || step.flowCode || "未命名节点";
    if (!code) warnings.push({ message: `${name} 缺少流程编号`, stepId: step.id });
    if (!step.flowName?.trim()) warnings.push({ message: `${name} 缺少流程名称`, stepId: step.id });
    if (!step.standardReply?.trim()) warnings.push({ message: `${name} 缺少客服标准话术`, stepId: step.id });
    if ((step.sendLink || step.sendInvite) && !(step.sendLink && step.sendInvite)) warnings.push({ message: `${name} 发注册信息时需要同时开启链接和邀请码`, stepId: step.id });
    if (step.sendLink && !scriptTextIncludes(step.standardReply, ["{{REGISTER_URL}}", "{{INVITE_DISPLAY}}"])) warnings.push({ message: `${name} 缺少注册链接变量`, stepId: step.id });
    if (step.sendInvite && !scriptTextIncludes(step.standardReply, ["{{INVITE_CODE}}", "{{INVITE_DISPLAY}}"])) warnings.push({ message: `${name} 缺少邀请码变量`, stepId: step.id });
    if (step.flowStep === "collect_telegram" && !scriptTextIncludes(step.standardReply, ["{{TG_LINK}}", "{{TELEGRAM_LINK}}"])) warnings.push({ message: `${name} 缺少老师TG链接变量`, stepId: step.id });
    if (step.nextFlowCode && !codes.has(step.nextFlowCode.trim())) warnings.push({ message: `${name} 的下一流程编号不存在`, stepId: step.id });
    if (step.nextFlowStep && !flowSteps.has(step.nextFlowStep.trim())) warnings.push({ message: `${name} 的下一系统步骤不存在`, stepId: step.id });
  }

  return warnings.filter((issue, index) => warnings.findIndex((candidate) => candidate.message === issue.message) === index);
}

function scriptTextIncludes(text: string, values: string[]): boolean {
  return values.some((value) => text.includes(value));
}
