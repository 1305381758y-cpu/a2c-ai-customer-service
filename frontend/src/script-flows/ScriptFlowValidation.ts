import type { ScriptFlowStep } from "../types.js";

export function validateScriptFlowDraft(steps: ScriptFlowStep[]): string[] {
  const enabledSteps = steps
    .filter((step) => step.enabled)
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0));
  if (!enabledSteps.length) return ["至少需要 1 个启用节点"];

  const codes = new Set(enabledSteps.map((step) => step.flowCode?.trim()).filter(Boolean));
  const flowSteps = new Set(enabledSteps.map((step) => step.flowStep?.trim()).filter(Boolean));
  const warnings: string[] = [];
  const seenCodes = new Set<string>();

  for (const step of enabledSteps) {
    const code = step.flowCode?.trim();
    if (code && seenCodes.has(code)) warnings.push(`流程编号重复：${code}`);
    if (code) seenCodes.add(code);

    const name = step.flowName || step.flowCode || "未命名节点";
    if (!step.standardReply?.trim()) warnings.push(`${name} 缺少客服标准话术`);
    if ((step.sendLink || step.sendInvite) && !(step.sendLink && step.sendInvite)) warnings.push(`${name} 发注册信息时需要同时开启链接和邀请码`);
    if (step.sendLink && !scriptTextIncludes(step.standardReply, ["{{REGISTER_URL}}", "{{INVITE_DISPLAY}}"])) warnings.push(`${name} 缺少注册链接变量`);
    if (step.sendInvite && !scriptTextIncludes(step.standardReply, ["{{INVITE_CODE}}", "{{INVITE_DISPLAY}}"])) warnings.push(`${name} 缺少邀请码变量`);
    if (step.flowStep === "collect_telegram" && !scriptTextIncludes(step.standardReply, ["{{TG_LINK}}", "{{TELEGRAM_LINK}}"])) warnings.push(`${name} 缺少老师TG链接变量`);
    if (step.nextFlowCode && !codes.has(step.nextFlowCode.trim())) warnings.push(`${name} 的下一流程编号不存在`);
    if (step.nextFlowStep && !flowSteps.has(step.nextFlowStep.trim())) warnings.push(`${name} 的下一系统步骤不存在`);
  }

  return [...new Set(warnings)];
}

function scriptTextIncludes(text: string, values: string[]): boolean {
  return values.some((value) => text.includes(value));
}
