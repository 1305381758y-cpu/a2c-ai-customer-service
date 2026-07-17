import type { AppConfig } from "../config.js";
import type { StrictFlowReply } from "../domain/strictFlow.js";
import type { MerchantAgentProfileRecord, ScriptFlowRuntime } from "../repositories.js";
import type { AiTasks } from "./aiTasks.js";
import { ensureReplyCustomerLanguage, naturalizeStrictReply, type LanguageGuardResult } from "./replyLanguage.js";
import { applyControlledQuestionStyle } from "./strictFlowControlledQuestionStyle.js";

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
  if (input.strictReply.replyPurpose === "await_customer_question") {
    const languageGuard = await ensureReplyCustomerLanguage(input.runtimeConfig, {
      reply: input.strictReply.reply,
      targetLanguage: input.strictReply.language,
      flowStep: input.strictReply.nextFlowStep,
      allowLinkOrInvite: false,
      fallbackReply: input.strictReply.reply
    });
    return {
      reply: languageGuard.reply,
      naturalized: {
        reply: input.strictReply.reply,
        used: false,
        error: "等待客户提出问题时保留受控话术"
      },
      languageGuard,
      duplicateAvoided: false,
      variantApplied: false
    };
  }

  if (input.strictReply.flowHoldReason) {
    const languageGuard = await ensureReplyCustomerLanguage(input.runtimeConfig, {
      reply: input.strictReply.reply,
      targetLanguage: input.strictReply.language,
      flowStep: input.strictReply.nextFlowStep,
      allowLinkOrInvite: false,
      fallbackReply: input.strictReply.reply
    });
    return {
      reply: languageGuard.reply,
      naturalized: {
        reply: input.strictReply.reply,
        used: false,
        error: "流程暂停或拒绝状态保留固定话术"
      },
      languageGuard,
      duplicateAvoided: false,
      variantApplied: false
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

  // An enabled merchant script owns ordinary node wording. A customer
  // question inside that node is different: keep the configured flow goal,
  // but allow the controlled answer prefix to be expressed naturally so the
  // same concern is not answered with the same sentence every time.
  if (input.scriptFlow?.flow.active) {
    if (input.strictReply.controlledQuestionType && input.strictReply.controlledQuestionType !== "none" && !input.strictReply.needsInviteCode) {
      const naturalized = await naturalizeStrictReply(input.ai, input.runtimeConfig, {
        customerText: input.customerText,
        draftReply: input.strictReply.reply,
        language: input.strictReply.language,
        flowStep: input.strictReply.nextFlowStep,
        questionType: input.strictReply.controlledQuestionType,
        history: input.history,
        allowLinkOrInvite: input.strictReply.needsInviteCode,
        agentProfile: input.agentProfile,
        forceNaturalize: true,
        avoidReplies: recentOutboundReplies(input.history)
      });
      const safeNaturalizedReply = sanitizeStrictNaturalizedReply(naturalized.reply, input.strictReply.reply);
      const languageGuard = await ensureReplyCustomerLanguage(input.runtimeConfig, {
        reply: safeNaturalizedReply.reply,
        targetLanguage: input.strictReply.language,
        flowStep: input.strictReply.nextFlowStep,
        allowLinkOrInvite: input.strictReply.needsInviteCode,
        fallbackReply: input.strictReply.replyPurpose === "answer_customer_question"
          ? input.strictReply.reply
          : undefined
      });
      const boundarySafeReply = enforceCustomerQuestionBoundary(
        languageGuard.reply,
        input.strictReply.reply,
        input.strictReply.replyPurpose
      );
      const styled = applyControlledQuestionStyle({
        reply: boundarySafeReply,
        language: input.strictReply.language,
        questionType: input.strictReply.controlledQuestionType,
        customerText: input.customerText,
        history: input.history
      });
      const duplicate = isNearDuplicateOfRecentReply(styled.reply, input.history);
      const distinctReply = duplicate
        ? makeDistinctReply(styled.reply, input.strictReply.language, input.history)
        : styled.reply;
      return {
        reply: distinctReply,
        naturalized: safeNaturalizedReply.rejected ? {
          reply: input.strictReply.reply,
          used: false,
          error: "口语化改写越过流程边界，已回退"
        } : naturalized,
        languageGuard: { ...languageGuard, reply: distinctReply },
        duplicateAvoided: duplicate || styled.occurrence > 1,
        variantApplied: styled.openerChanged || (duplicate && distinctReply !== styled.reply)
      };
    }
    const languageGuard = await ensureReplyCustomerLanguage(input.runtimeConfig, {
      reply: input.strictReply.reply,
      targetLanguage: input.strictReply.language,
      flowStep: input.strictReply.nextFlowStep,
      allowLinkOrInvite: input.strictReply.needsInviteCode
    });
    const duplicate = !input.strictReply.needsInviteCode && isNearDuplicateOfRecentReply(languageGuard.reply, input.history);
    const distinctReply = duplicate
      ? makeDistinctReply(languageGuard.reply, input.strictReply.language, input.history)
      : languageGuard.reply;
    return {
      reply: distinctReply,
      naturalized: {
        reply: input.strictReply.reply,
        used: false,
        error: "启用话本后保留节点标准话术"
      },
      languageGuard: { ...languageGuard, reply: distinctReply },
      duplicateAvoided: duplicate,
      variantApplied: duplicate && distinctReply !== languageGuard.reply
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
  const guarded = await ensureReplyCustomerLanguage(input.runtimeConfig, {
    reply: safeNaturalizedReply.reply,
    targetLanguage: input.strictReply.language,
    flowStep: input.strictReply.nextFlowStep,
    allowLinkOrInvite: input.strictReply.needsInviteCode,
    fallbackReply: input.strictReply.replyPurpose === "answer_customer_question"
      ? input.strictReply.reply
      : undefined
  });
  const boundarySafeReply = enforceCustomerQuestionBoundary(
    guarded.reply,
    input.strictReply.reply,
    input.strictReply.replyPurpose
  );
  const styled = input.strictReply.controlledQuestionType && input.strictReply.controlledQuestionType !== "none"
    ? applyControlledQuestionStyle({
      reply: boundarySafeReply,
      language: input.strictReply.language,
      questionType: input.strictReply.controlledQuestionType,
      customerText: input.customerText,
      history: input.history
    })
    : { reply: guarded.reply, occurrence: 1, openerChanged: false };
  const duplicate = isNearDuplicateOfRecentReply(styled.reply, input.history);
  const distinctReply = duplicate
    ? makeDistinctReply(styled.reply, input.strictReply.language, input.history)
    : styled.reply;

  return {
    reply: distinctReply,
    naturalized: safeNaturalizedReply.rejected ? {
      reply: input.strictReply.reply,
      used: false,
      error: "口语化改写越过流程边界，已回退"
    } : naturalized,
    languageGuard: { ...guarded, reply: distinctReply },
    duplicateAvoided: duplicate || styled.occurrence > 1,
    variantApplied: styled.openerChanged || (duplicate && distinctReply !== styled.reply)
  };
}

function sanitizeStrictNaturalizedReply(reply: string, fallback: string): { reply: string; rejected: boolean } {
  if (asksForUnsupportedManualRegistration(reply)) {
    return { reply: fallback, rejected: true };
  }
  return { reply, rejected: false };
}

function enforceCustomerQuestionBoundary(
  reply: string,
  fallback: string,
  replyPurpose: StrictFlowReply["replyPurpose"]
): string {
  if (replyPurpose !== "answer_customer_question") return reply;
  return containsFlowProgressionPrompt(reply) && !containsFlowProgressionPrompt(fallback)
    ? fallback
    : reply;
}

function containsFlowProgressionPrompt(text: string): boolean {
  return /(?:有空|方便).{0,20}(?:注册|开户)|(?:继续|开始).{0,20}(?:注册|开户)|(?:完成注册|注册完成).{0,20}(?:手机号|电话)|(?:注册链接|开户链接|邀请码|注册步骤)|(?:tem tempo|est[aá] livre|podemos continuar|vamos continuar).{0,40}(?:cadastro|registro)|continuar (?:o )?cadastro agora|(?:tiene tiempo|est[aá] libre|podemos continuar).{0,40}(?:registro|registrarse)|continue (?:with )?(?:the )?registration|registration link|invitation code/i.test(text);
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

function makeDistinctReply(
  reply: string,
  language: string,
  history: Array<{ direction: string; content: string }>
): string {
  const candidates: string[] = [];
  if (language === "es") {
    candidates.push(reply
      .replace(/^de acuerdo[,.]?/i, "Perfecto,")
      .replace(/por favor/gi, "cuando pueda")
      .replace(/envíeme/gi, "mándeme")
      .replace(/dígame/gi, "cuénteme"));
    candidates.push(reply
      .replace(/^(de acuerdo|perfecto|vale)[,.]?\s*/i, "Entendido, ")
      .replace(/por favor/gi, "cuando pueda")
      .replace(/envíeme/gi, "puede enviarme")
      .replace(/mándeme/gi, "puede enviarme"));
  } else if (language === "pt-BR") {
    candidates.push(reply
      .replace(/^certo[,.]?/i, "Perfeito,")
      .replace(/por favor/gi, "quando puder")
      .replace(/\benvie\b/gi, "me mande"));
    candidates.push(reply
      .replace(/^(certo|perfeito|ok)[,.]?\s*/i, "Entendi, ")
      .replace(/por favor/gi, "quando puder")
      .replace(/\benvie\b/gi, "pode me mandar")
      .replace(/\bme mande\b/gi, "pode me mandar"));
  } else if (language === "en") {
    candidates.push(reply
      .replace(/^okay[,.]?/i, "Alright,")
      .replace(/^ok[,.]?/i, "Got it,")
      .replace(/please/gi, "when you can"));
    candidates.push(reply
      .replace(/^(okay|alright|got it)[,.]?\s*/i, "Understood, ")
      .replace(/please/gi, "when you can"));
  } else {
    candidates.push(reply
      .replace(/^好的[，,]?/, "没问题，")
      .replace(/请告知我/, "完成后告诉我")
      .replace(/请将/, "记得把"));
    candidates.push(reply
      .replace(/^好的[，,]?/, "明白了，")
      .replace(/请告知我/, "完成后和我说一声")
      .replace(/请将/, "麻烦把")
      .replace(/请把/, "把"));
  }
  return candidates.find((candidate) => candidate !== reply && !isExactRecentReply(candidate, history))
    ?? candidates.find((candidate) => candidate !== reply)
    ?? reply;
}

function isExactRecentReply(
  reply: string,
  history: Array<{ direction: string; content: string }>
): boolean {
  const normalized = normalizeReply(reply);
  return recentOutboundReplies(history).some((previous) => normalizeReply(previous) === normalized);
}
