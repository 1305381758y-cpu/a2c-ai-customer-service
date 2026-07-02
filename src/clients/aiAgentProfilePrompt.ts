import type { MerchantAgentProfileRecord } from "../repositories.js";

export function safeAgentProfile(profile?: MerchantAgentProfileRecord): Record<string, string | boolean> | null {
  if (!profile || !profile.enabled) return null;
  return {
    agentName: profile.agentName,
    roleDefinition: profile.roleDefinition,
    toneStyle: profile.toneStyle,
    coreGoal: profile.coreGoal,
    mustFollow: profile.mustFollow,
    forbidden: profile.forbidden,
    uncertaintyPolicy: profile.uncertaintyPolicy,
    handoffPolicy: profile.handoffPolicy,
    enabled: profile.enabled
  };
}

export function agentProfileBlock(profile?: MerchantAgentProfileRecord): string {
  if (!profile || !profile.enabled) {
    return `
Agent 默认设定：
- 角色：拥有10年开户注册接待经验的客户引导专员。
- 语气：简短、口语化、耐心，像真人客服。
- 边界：不确定内容以页面或人工确认为准。`;
  }
  return `
商户 Agent 设定：
- Agent 名称：${profile.agentName}
- 角色定义：${profile.roleDefinition}
- 语气风格：${profile.toneStyle}
- 核心目标：${profile.coreGoal}
- 必须遵守：${profile.mustFollow}
- 禁止事项：${profile.forbidden}
- 不确定问题口径：${profile.uncertaintyPolicy}
- 转人工条件：${profile.handoffPolicy}`;
}
