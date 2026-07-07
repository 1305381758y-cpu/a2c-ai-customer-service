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
  if (input.scriptFlow?.flow.active) {
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

  const languageGuard = await ensureReplyCustomerLanguage(input.runtimeConfig, {
    reply: naturalized.reply,
    targetLanguage: input.strictReply.language,
    flowStep: input.strictReply.nextFlowStep,
    allowLinkOrInvite: input.strictReply.needsInviteCode
  });

  return {
    reply: languageGuard.reply,
    naturalized,
    languageGuard
  };
}
