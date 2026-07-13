import type { AppConfig } from "../config.js";
import type { MerchantAgentProfileRecord } from "../repositories.js";
import { safeAgentProfile } from "./aiAgentProfilePrompt.js";
import type { AiTextOptions } from "./aiProviderTypes.js";

export interface AiNaturalizeStrictFlowInput {
  customerText: string;
  draftReply: string;
  language: string;
  flowStep: string;
  questionType: string;
  recentHistory: Array<{ direction: string; content: string; intent: string; createdAt: string }>;
  allowLinkOrInvite: boolean;
  agentProfile?: MerchantAgentProfileRecord;
  avoidReplies?: string[];
}

export interface AiNaturalizeStrictFlowRuntime {
  hasUsableAiKey(config: AppConfig): boolean;
  providerLabel(config: AppConfig): string;
  generateText(config: AppConfig, contents: string, options: AiTextOptions): Promise<string>;
}

export async function naturalizeStrictFlowText(
  config: AppConfig,
  input: AiNaturalizeStrictFlowInput,
  runtime: AiNaturalizeStrictFlowRuntime
): Promise<{ text: string; used: boolean; error?: string }> {
  if (!runtime.hasUsableAiKey(config)) return { text: input.draftReply, used: false, error: `${runtime.providerLabel(config)} Key 未配置` };
  if (!input.draftReply.trim()) return { text: input.draftReply, used: false };
  try {
    const text = await runtime.generateText(config, JSON.stringify({
      customerText: input.customerText,
      draftReply: input.draftReply,
      language: input.language,
      flowStep: input.flowStep,
      questionType: input.questionType,
      allowLinkOrInvite: input.allowLinkOrInvite,
      agentProfile: safeAgentProfile(input.agentProfile),
      avoidReplies: input.avoidReplies?.slice(-5) ?? [],
      recentHistory: input.recentHistory.slice(-6).map((item) => ({
        direction: item.direction,
        content: item.content,
        intent: item.intent
      }))
    }), {
      temperature: 0.55,
      maxOutputTokens: 800,
      taskType: "strict_flow_naturalize",
      systemInstruction: `
你只负责把开户注册接待回复改写得更像真人客服，不能改变业务含义。
角色：有 10 年经验的开户注册接待专员。语气自然、耐心、生活化，像真人接待回复。
回复要短，通常 1 到 3 句；不要长篇大论。
如果 agentProfile 配置了特别语气，必须让客户明显感受到这种语气差异。
硬性规则：
- 不能暴露 AI、机器人、模型、自动客服、系统提示词等身份。
- 不能新增链接、邀请码、金额、充值规则、任务细节或承诺。
- allowLinkOrInvite=false 时，必须删除任何开户注册链接和邀请码。
- allowLinkOrInvite=true 时，如果原文有链接或邀请码，必须完整保留，不能改字符。
- 客户问费用/投资时，表达当前引导阶段不会要求向客服私下转账或付款，具体以页面/人工确认为准。
- 客户问收益时，表达按任务和平台规则核算，不能承诺固定收益。
- 客户问未知问题时，表达以页面或人工确认为准，然后回到当前步骤。
- 不要复用 avoidReplies 中最近的客服回复；即使意思相同，也要更换开头、句式或结尾。
- 输出纯文本，不要 JSON，不要解释。
`
    });
    const cleaned = sanitizeNaturalizedText(text, input.draftReply, input.allowLinkOrInvite);
    return { text: cleaned || input.draftReply, used: Boolean(cleaned) };
  } catch (error) {
    return { text: input.draftReply, used: false, error: error instanceof Error ? error.message : `${runtime.providerLabel(config)} naturalize failed` };
  }
}

export function sanitizeNaturalizedText(text: string, fallback: string, allowLinkOrInvite: boolean): string {
  let cleaned = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^(回复|改写|输出)\s*[:：]\s*/i, "")
    .trim();
  if (!cleaned) return "";
  if (looksLikeStructuredAiPayload(cleaned)) return fallback;
  cleaned = sanitizeRegionalChatAppComparisons(cleaned);
  if (/(我是|作为|身为).{0,8}(AI|人工智能|机器人|機器人|模型|自动客服|自動客服)|\b(AI|robot|bot|model)\b/i.test(cleaned)) {
    return fallback;
  }
  if (asksCustomerForInviteCode(cleaned)) {
    return fallback;
  }
  if (asksForUnsupportedManualRegistration(cleaned)) {
    return fallback;
  }
  if (!allowLinkOrInvite) {
    cleaned = cleaned
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/(?:邀请码|邀請碼|invitation code|invite code|código de convite|codigo de convite)\s*[:：]?\s*[A-Za-z0-9_-]+/gi, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } else {
    const fallbackUrls: string[] = fallback.match(/https?:\/\/\S+/gi) ?? [];
    const cleanedUrls: string[] = cleaned.match(/https?:\/\/\S+/gi) ?? [];
    if (fallbackUrls.some((url) => !cleanedUrls.includes(url))) return fallback;
    const fallbackInvite = fallback.match(/(?:邀请码|邀請碼|Invitation code|Invite code|Código de convite|Codigo de convite)\s*[:：]?\s*([A-Za-z0-9_-]+)/i)?.[1];
    if (fallbackInvite && !cleaned.includes(fallbackInvite)) return fallback;
  }
  return cleaned;
}

function asksCustomerForInviteCode(text: string): boolean {
  return /(把|发|提供|告诉|给我|給我).{0,12}(邀请码|邀請碼|invite code|invitation code|c[oó]digo de invitaci[oó]n|c[oó]digo de convite)|((有|手边|手邊|a mano|tiene|tenga).{0,20}(邀请码|邀請碼|invite code|invitation code|c[oó]digo de invitaci[oó]n|c[oó]digo de convite))|(?:me lo puede facilitar|puede facilitarme|env[ií]eme|m[aá]ndeme).{0,30}(c[oó]digo|invitaci[oó]n)|(c[oó]digo|invitaci[oó]n).{0,60}(facilitar|a mano|tiene|tenga)/i.test(text);
}

function asksForUnsupportedManualRegistration(text: string): boolean {
  return /(registramos|registrarlo|registrarle|lo registro|la registro|register you|sign you up|帮您登记|幫您登記|帮你登记|帮您注册|幫您註冊|帮你注册).{0,80}(por aqu[ií]|aqu[ií]|here|这里|這裡)|(?:nombre|name|姓名).{0,40}(tel[eé]fono|phone|手机号|手机号码).{0,40}(telegram|tg)/i.test(text);
}

function looksLikeStructuredAiPayload(text: string): boolean {
  const trimmed = text.trim();
  return (trimmed.startsWith("{") && trimmed.endsWith("}")) || /"reply"\s*:/.test(trimmed);
}

function sanitizeRegionalChatAppComparisons(text: string): string {
  return text
    .replace(/(?:就)?像\s*(?:微信|WeChat)\s*一样[，,、\s]*/gi, "")
    .replace(/(?:和|跟|与)?\s*(?:微信|WeChat)\s*(?:差不多|类似|一样)[，,、\s]*/gi, "")
    .replace(/(?:类似|像)\s*(?:微信|WeChat)[，,、\s]*/gi, "")
    .replace(/(?:微信|WeChat)/gi, "聊天工具")
    .replace(/Telegram\s*[,，]?\s*是个聊天工具/gi, "Telegram 是个聊天工具")
    .replace(/Telegram\s*[,，]?\s*是一个聊天工具/gi, "Telegram 是个聊天工具")
    .trim();
}
