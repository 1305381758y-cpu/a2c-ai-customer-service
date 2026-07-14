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
  duplicateAvoided: boolean;
  variantApplied: boolean;
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
      languageGuard,
      duplicateAvoided: false,
      variantApplied: false
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
      languageGuard,
      duplicateAvoided: false,
      variantApplied: false
    };
  }

  // An enabled merchant script is an approved customer-facing script. Keep
  // its wording and order intact; only the language guard may translate it to
  // the customer's configured language. Do not naturalize, paraphrase, or
  // rotate repeated wording inside a configured script.
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
        error: "启用话本后保留节点标准话术"
      },
      languageGuard,
      duplicateAvoided: false,
      variantApplied: false
    };
  }

  // A registration package is operational content, not conversational copy.
  // Keep the merchant's configured link, invite code, and step order intact;
  // rewriting this block can silently remove required registration steps.
  if (input.scriptFlow?.flow.active && input.strictReply.needsInviteCode) {
    const languageGuard = await ensureReplyCustomerLanguage(input.runtimeConfig, {
      reply: input.strictReply.reply,
      targetLanguage: input.strictReply.language,
      flowStep: input.strictReply.nextFlowStep,
      allowLinkOrInvite: true
    });
    return {
      reply: languageGuard.reply,
      naturalized: {
        reply: input.strictReply.reply,
        used: false,
        error: "注册链接、邀请码和步骤保留话本原文"
      },
      languageGuard,
      duplicateAvoided: false,
      variantApplied: false
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
    agentProfile: input.agentProfile,
    forceNaturalize: false,
    avoidReplies: recentOutboundReplies(input.history)
  });

  const safeNaturalizedReply = sanitizeStrictNaturalizedReply(naturalized.reply, input.strictReply.reply);
  const duplicate = isNearDuplicateOfRecentReply(safeNaturalizedReply.reply, input.history);
  const distinctReply = duplicate
    ? makeDistinctReply(safeNaturalizedReply.reply, input.strictReply.language)
    : safeNaturalizedReply.reply;
  const languageGuard = await ensureReplyCustomerLanguage(input.runtimeConfig, {
    reply: distinctReply,
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
    languageGuard,
    duplicateAvoided: duplicate,
    variantApplied: duplicate && distinctReply !== safeNaturalizedReply.reply
  };
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

function recentOutboundReplies(history: Array<{ direction: string; content: string }>): string[] {
  return history.filter((item) => item.direction === "outbound").slice(-5).map((item) => item.content).filter(Boolean);
}

function isNearDuplicateOfRecentReply(reply: string, history: Array<{ direction: string; content: string }>): boolean {
  const normalized = normalizeReply(reply);
  if (!normalized) return false;
  return recentOutboundReplies(history).some((previous) => {
    const prior = normalizeReply(previous);
    if (!prior) return false;
    if (prior === normalized) return true;
    const left = new Set(prior.split(" "));
    const right = new Set(normalized.split(" "));
    const overlap = [...left].filter((token) => right.has(token)).length;
    const union = new Set([...left, ...right]).size;
    return union > 0 && overlap / union >= 0.9;
  });
}

function normalizeReply(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "链接")
    .replace(/\d+/g, "数字")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function makeDistinctReply(reply: string, language: string): string {
  if (language === "es") {
    return reply
      .replace(/^de acuerdo[,.]?/i, "Perfecto,")
      .replace(/por favor/gi, "cuando pueda")
      .replace(/envíeme/gi, "mándeme")
      .replace(/dígame/gi, "cuénteme");
  }
  if (language === "pt-BR") {
    return reply
      .replace(/^certo[,.]?/i, "Perfeito,")
      .replace(/por favor/gi, "quando puder")
      .replace(/envie/gi, "me mande");
  }
  if (language === "en") {
    return reply
      .replace(/^okay[,.]?/i, "Alright,")
      .replace(/^ok[,.]?/i, "Got it,")
      .replace(/please/gi, "when you can");
  }
  const changed = reply
    .replace(/^好的[，,]?/, "没问题，")
    .replace(/^好的[，,]?/, "明白了，")
    .replace(/请告知我/, "完成后告诉我")
    .replace(/请将/, "记得把");
  return changed === reply ? `${reply}\n我这边等您继续。` : changed;
}
