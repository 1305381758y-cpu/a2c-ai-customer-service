import type { AppConfig } from "../config.js";
import type { StrictFlowReply } from "../domain/strictFlow.js";
import type { MerchantAgentProfileRecord, ScriptFlowRuntime } from "../repositories.js";
import type { AiTasks } from "./aiTasks.js";
import { ensureReplyCustomerLanguage, naturalizeStrictReply, type LanguageGuardResult } from "./replyLanguage.js";

export interface StrictFlowReplyTextRefinementResult {
  reply: string;
  naturalized: {
    reply: string;
    used: boolean;
    error?: string;
  };
  languageGuard: LanguageGuardResult;
}

export async function refineStrictFlowReplyText(input: {
  ai: AiTasks;
  runtimeConfig: AppConfig;
  strictReply: StrictFlowReply;
  customerText: string;
  history: Array<{ direction: string; content: string; intent: string; createdAt: string }>;
  agentProfile: MerchantAgentProfileRecord;
  scriptFlow?: ScriptFlowRuntime;
}): Promise<StrictFlowReplyTextRefinementResult> {
  if (input.strictReply.fallback && input.strictReply.needsInviteCode) {
    const languageGuard = await ensureReplyCustomerLanguage(input.runtimeConfig, {
      reply: input.strictReply.reply,
      targetLanguage: input.strictReply.language,
      flowStep: input.strictReply.nextFlowStep,
      allowLinkOrInvite: false
    });
    return {
      reply: languageGuard.reply,
      naturalized: {
        reply: input.strictReply.reply,
        used: false,
        error: "邀请码未分配时跳过口语化改写"
      },
      languageGuard
    };
  }

  if (input.strictReply.nextFlowStep === "human_handoff") {
    const languageGuard = await ensureReplyCustomerLanguage(input.runtimeConfig, {
      reply: input.strictReply.reply,
      targetLanguage: input.strictReply.language,
      flowStep: input.strictReply.nextFlowStep,
      allowLinkOrInvite: false
    });
    return {
      reply: languageGuard.reply,
      naturalized: {
        reply: input.strictReply.reply,
        used: false,
        error: "接管提示保留固定话术"
      },
      languageGuard
    };
  }

  if (input.scriptFlow?.flow.active && shouldPreserveScriptFlowNodeText(input.strictReply)) {
    const languageGuard = await ensureReplyCustomerLanguage(input.runtimeConfig, {
      reply: input.strictReply.reply,
      targetLanguage: input.strictReply.language,
      flowStep: input.strictReply.nextFlowStep,
      allowLinkOrInvite: input.strictReply.needsInviteCode
    });
    return {
      reply: languageGuard.reply,
      naturalized: {
        reply: input.strictReply.reply,
        used: false,
        error: "已启用商户话本流程，保留节点原话术"
      },
      languageGuard
    };
  }

  const naturalized = await naturalizeStrictReply(input.ai, input.runtimeConfig, {
    customerText: input.customerText,
    draftReply: input.strictReply.reply,
    language: input.strictReply.language,
    flowStep: input.strictReply.nextFlowStep,
    questionType: input.strictReply.controlledQuestionType || "none",
    history: input.history,
    allowLinkOrInvite: input.strictReply.needsInviteCode,
    agentProfile: input.agentProfile
  });

  const safeNaturalizedReply = sanitizeStrictNaturalizedReply(naturalized.reply, input.strictReply.reply);
  const languageGuard = await ensureReplyCustomerLanguage(input.runtimeConfig, {
    reply: safeNaturalizedReply.reply,
    targetLanguage: input.strictReply.language,
    flowStep: input.strictReply.nextFlowStep,
    allowLinkOrInvite: input.strictReply.needsInviteCode
  });

  return {
    reply: languageGuard.reply,
    naturalized: safeNaturalizedReply.rejected ? {
      reply: input.strictReply.reply,
      used: false,
      error: "口语化改写越过流程边界，已回退"
    } : naturalized,
    languageGuard
  };
}

function shouldPreserveScriptFlowNodeText(strictReply: StrictFlowReply): boolean {
  const questionType = strictReply.controlledQuestionType || "none";
  if (strictReply.controlledQuestionFallback) return false;
  return questionType === "none";
}

function sanitizeStrictNaturalizedReply(reply: string, fallback: string): { reply: string; rejected: boolean } {
  if (asksForUnsupportedManualRegistration(reply)) {
    return { reply: fallback, rejected: true };
  }
  return { reply, rejected: false };
}

function asksForUnsupportedManualRegistration(text: string): boolean {
  return /(registramos|registrarlo|registrarle|lo registro|la registro|register you|sign you up|帮您登记|幫您登記|帮你登记|帮您注册|幫您註冊|帮你注册).{0,80}(por aqu[ií]|aqu[ií]|here|这里|這裡)|(?:nombre|name|姓名).{0,40}(tel[eé]fono|phone|手机号|手机号码).{0,40}(telegram|tg)/i.test(text);
}
