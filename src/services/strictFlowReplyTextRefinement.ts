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
    const duplicate = isNearDuplicateOfRecentReply(languageGuard.reply, input.history);
    const distinctReply = duplicate
      ? selectFlowHoldVariant(input.strictReply.flowHoldReason, input.strictReply.language, input.history, languageGuard.reply)
      : languageGuard.reply;
    return {
      reply: distinctReply,
      naturalized: {
        reply: input.strictReply.reply,
        used: false,
        error: "流程暂停或拒绝状态保留固定话术"
      },
      languageGuard: { ...languageGuard, reply: distinctReply },
      duplicateAvoided: duplicate,
      variantApplied: duplicate && distinctReply !== languageGuard.reply
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
    const teacherLinkFallback = localizedTeacherLinkFallback(input.strictReply.reply, input.strictReply.language);
    const languageGuard = await ensureReplyCustomerLanguage(input.runtimeConfig, {
      reply: input.strictReply.reply,
      targetLanguage: input.strictReply.language,
      flowStep: input.strictReply.nextFlowStep,
      allowLinkOrInvite: false,
      fallbackReply: teacherLinkFallback || undefined
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

  if (input.strictReply.preserveConfiguredText) {
    const languageGuard = await ensureReplyCustomerLanguage(input.runtimeConfig, {
      reply: input.strictReply.reply,
      targetLanguage: input.strictReply.language,
      flowStep: input.strictReply.replyFlowStep || input.strictReply.nextFlowStep,
      allowLinkOrInvite: input.strictReply.needsInviteCode
    });
    return {
      reply: languageGuard.reply,
      naturalized: {
        reply: input.strictReply.reply,
        used: false,
        error: "商户配置的分段话术仅执行语言转换"
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

function localizedTeacherLinkFallback(reply: string, language: string): string {
  const link = reply.match(/https?:\/\/(?:t\.me|telegram\.me)\/\S+/i)?.[0]?.replace(/[，。,.]+$/, "") || "";
  if (!link) return "";
  if (language === "pt-BR") {
    return `Agora vou enviar o link do Telegram da professora. Abra o link e entre em contato diretamente com ela. Ela vai orientar você nos próximos passos.\n${link}`;
  }
  if (language === "es") {
    return `Ahora le envío el enlace de Telegram de la profesora. Abra el enlace y contacte directamente con ella. Le explicará los próximos pasos.\n${link}`;
  }
  if (language === "en") {
    return `I am sending you the teacher's Telegram link now. Open it and contact her directly. She will guide you through the next steps.\n${link}`;
  }
  return `现在把老师的 Telegram 链接发给您。请打开链接并主动联系导师，她会继续指导后续步骤。\n${link}`;
}

function sanitizeStrictNaturalizedReply(reply: string, fallback: string): { reply: string; rejected: boolean } {
  if (asksForUnsupportedManualRegistration(reply) || containsUnsupportedAssurance(reply)) {
    return { reply: fallback, rejected: true };
  }
  return { reply, rejected: false };
}

function containsUnsupportedAssurance(text: string): boolean {
  if (/(?:não|nao) posso garantir|no puedo garantizar|cannot guarantee|can'?t guarantee|无法保证|不能保证/i.test(text)) return false;
  return /(?:100%|totalmente|completamente)\s+segur[oa]|(?:sem|não há|nao ha)\s+(?:nenhum\s+)?risco|sem nada escondido|rápid[oa]\s+e\s+segur[oa]|garantid[oa]|não é golpe|nao e golpe|100% safe|completely safe|no risk|nothing hidden|guaranteed|not a scam|完全安全|没有任何风险|绝对不会被骗|保证安全|不是骗局|不是诈骗/i.test(text);
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

function selectFlowHoldVariant(
  reason: NonNullable<StrictFlowReply["flowHoldReason"]>,
  language: string,
  history: Array<{ direction: string; content: string }>,
  fallback: string
): string {
  const normalizedLanguage = language.toLowerCase();
  const rejected = reason === "rejected";
  const candidates = normalizedLanguage.startsWith("pt")
    ? rejected
      ? [
        "Entendido. Não enviarei novas orientações. Se mudar de ideia, pode me chamar.",
        "Sem problema. Vou encerrar por aqui e não enviarei novas mensagens sobre o cadastro."
      ]
      : [
        "Certo, vou aguardar. Quando estiver disponível, me avise para continuarmos.",
        "Sem problema. Continue quando puder e me avise; vou esperar por aqui.",
        "Combinado. Faça o que precisa e me avise quando quiser retomar."
      ]
    : normalizedLanguage.startsWith("es")
      ? rejected
        ? [
          "Entendido. No enviaré más indicaciones. Si cambia de opinión, puede escribirme.",
          "De acuerdo. Lo dejamos aquí y no enviaré más mensajes sobre el registro."
        ]
        : [
          "De acuerdo, esperaré. Cuando esté disponible, avíseme para continuar.",
          "No hay problema. Continúe cuando pueda y avíseme; esperaré aquí.",
          "Perfecto. Ocúpese de lo que necesita y avíseme cuando quiera retomar."
        ]
      : normalizedLanguage.startsWith("en")
        ? rejected
          ? [
            "Understood. I will not send any more instructions. If you change your mind, you can message me.",
            "No problem. We will stop here, and I will not send more registration messages."
          ]
          : [
            "Alright, I will wait. Tell me when you are available and we can continue.",
            "No problem. Continue when you can and let me know; I will wait here.",
            "Got it. Take care of what you need and tell me when you want to resume."
          ]
        : rejected
          ? [
            "明白，我不会再发送后续引导。您之后改变想法时再联系我即可。",
            "好的，我们先结束到这里，我不会再发送注册相关消息。"
          ]
          : [
            "好的，我先等您。方便继续时告诉我就行。",
            "没问题，您先忙，准备继续时再告诉我。",
            "明白，您处理好后再联系我，我们从当前步骤继续。"
          ];
  return candidates.find((candidate) => !isExactRecentReply(candidate, history)) ?? fallback;
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
