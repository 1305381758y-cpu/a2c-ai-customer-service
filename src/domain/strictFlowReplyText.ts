import type { StrictFlowStep } from "./strictFlowTypes.js";

export function joinReplyParts(prefix: string, goal: string, language: string): string {
  const cleanPrefix = prefix.trim();
  const cleanGoal = goal.trim();
  if (!cleanPrefix) return cleanGoal;
  if (!cleanGoal || cleanPrefix.includes(cleanGoal)) return cleanPrefix;
  if (cleanGoal.includes(cleanPrefix)) return cleanGoal;
  return language === "zh" ? `${cleanPrefix}${cleanGoal}` : `${cleanPrefix} ${cleanGoal}`;
}

export function containsNextStepPrompt(content: string, nextStep: StrictFlowStep): boolean {
  if (nextStep === "registration_intent") {
    return /(有空|空闲时间|空閒時間|有时间|是否.*继续|free time|time now|available|tempo livre|tempo agora|continuar o cadastro)/i.test(content);
  }
  if (nextStep === "wait_registration") {
    return /(https?:\/\/|邀请码[:：]|invitation code[:：]|código de convite[:：]|codigo de convite[:：]|注册手机号|注册的手机号码|registered phone|phone number you registered|telefone usado no cadastro|número de telefone usado no cadastro)/i.test(content);
  }
  if (nextStep === "collect_telegram") {
    return /(老师.*Telegram|Telegram 链接|Telegram link|teacher'?s Telegram|link do Telegram da professora|enlace de Telegram de la profesora|500\s*(到|to|a)\s*2800\s*BOB)/i.test(content);
  }
  return false;
}

export function sanitizeCustomerVisibleStrictReply(content: string): string {
  return content
    .replace(/话本里的参考收益是/g, "参考收益一般是")
    .replace(/话本里说/g, "")
    .replace(/收益由话本填写/g, "收益以页面和后续确认为准")
    .replace(/话本里的/g, "")
    .replace(/话本里/g, "")
    .replace(/脚本(?:里|中)?(?:说|写|参考)?/g, "")
    .replace(/模板(?:里|中)?(?:说|写|参考)?/g, "")
    .replace(/按(?:当前)?流程/g, "按当前步骤")
    .replace(/严格流程/g, "当前步骤")
    .replace(/自动客服|机器人|AI|模型/g, "客服")
    .replace(/(?:就)?像\s*(?:微信|WeChat)\s*一样[，,、\s]*/gi, "")
    .replace(/(?:和|跟|与)?\s*(?:微信|WeChat)\s*(?:差不多|类似|一样)[，,、\s]*/gi, "")
    .replace(/(?:类似|像)\s*(?:微信|WeChat)[，,、\s]*/gi, "")
    .replace(/(?:微信|WeChat)/gi, "聊天工具")
    .replace(/[ \t]+/g, " ")
    .replace(/^[，,、。\s]+/gm, "")
    .trim();
}

export function ensureActionableStrictContent(
  content: string,
  nextFlowStep: StrictFlowStep,
  language: string,
  scriptLine: (key: string, language: string) => string
): string {
  const trimmed = content.trim();
  if (!isLowInformationStrictReply(trimmed)) return content;
  if (nextFlowStep === "registration_intent") return joinReplyParts(scriptLine("project_intro", language), scriptLine("bridge_registration_intent", language), language);
  if (nextFlowStep === "wait_registration") return scriptLine("registration_intent", language);
  if (nextFlowStep === "telegram_confirm") return scriptLine("telegram_confirm_question", language);
  if (nextFlowStep === "telegram_download") return scriptLine("telegram_download", language);
  if (nextFlowStep === "collect_telegram") return scriptLine("collect_telegram", language);
  return scriptLine("interest_screening_retry", language);
}

function isLowInformationStrictReply(value: string): boolean {
  const normalized = value.replace(/[。.!?！？,，、\s]/g, "");
  return /^(好的我继续协助您|我继续协助您|OkayIwillcontinuehelpingyouwiththenextstep|Certovoucontinuarajudandovocênopróximopasso)$/i.test(normalized);
}
