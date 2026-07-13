import { analyzeMessage, type MessageAnalysis } from "../domain/analyzer.js";
import { isStrictFlowEnabled, resolveEffectiveStrictFlowStep, type StrictContextualIntent } from "../domain/strictFlow.js";
import type {
  Conversation,
  ConversationMessageRecord,
  MerchantConfigRecord,
  MerchantCountryRecord,
  MerchantRecord,
  Repositories,
  ScriptFlowRuntime
} from "../repositories.js";
import type { AppConfig } from "../config.js";
import type { AiTasks } from "./aiTasks.js";
import type { LearnedIntentDebugInfo } from "./aiConversationReply.js";
import { applyInternalIntent, inferStrictFlowContextualIntent, inferStrictFlowIntent } from "./contextualIntentInference.js";
import { buildIntentLearningCandidate, contextualQuestionTypeFromLearnedIntent, findLearnedIntentMatch } from "./intentLearning.js";
import { refineMessageLanguage } from "./replyLanguage.js";
import type { InternalIntentLabel } from "../domain/analyzer.js";

type RecentHistoryMessage = ConversationMessageRecord;

export interface InboundTurnAnalysisResult {
  analysis: MessageAnalysis;
  scriptFlow?: ScriptFlowRuntime;
  strictFlowEnabled: boolean;
  effectiveStrictFlowStep: string;
  inferredIntent: InternalIntentLabel;
  contextualIntent: StrictContextualIntent;
  learnedIntent: ReturnType<typeof findLearnedIntentMatch>;
  learnedIntentDebug: LearnedIntentDebugInfo | null;
  intentLearningCandidate: ReturnType<typeof buildIntentLearningCandidate>;
}

export async function analyzeInboundTurn(input: {
  repos: Repositories;
  ai: AiTasks;
  runtimeConfig: AppConfig;
  merchant: MerchantRecord;
  merchantConfig: MerchantConfigRecord;
  country: MerchantCountryRecord;
  conversation: Conversation;
  msgType: string;
  analysisText: string;
  imageAnalysisText: string;
  customerTextForAi: string;
  history: RecentHistoryMessage[];
}): Promise<InboundTurnAnalysisResult> {
  let analysis = analyzeMessage(input.msgType === "text" || input.analysisText ? input.customerTextForAi : input.imageAnalysisText, input.conversation.language);
  if (input.msgType === "image" && !input.analysisText && !input.imageAnalysisText) {
    analysis = { ...analysis, language: input.conversation.language || analysis.language, intent: "need_help", stage: "need_platform_register" };
  }
  analysis = await refineMessageLanguage(input.ai, {
    runtimeConfig: input.runtimeConfig,
    country: input.country,
    conversation: input.conversation,
    analysis,
    customerText: input.customerTextForAi,
    history: input.history
  });

  const boundScriptState = (input.repos as Repositories & {
    getConversationScriptState?: Repositories["getConversationScriptState"];
  }).getConversationScriptState?.(input.conversation.id, input.merchant.id);
  const scriptFlow = boundScriptState?.flowId
    ? input.repos.getScriptFlowVersion(boundScriptState.flowId, boundScriptState.flowVersion, input.merchant.id) || input.repos.getScriptFlow(boundScriptState.flowId, input.merchant.id)
    : input.repos.getActiveScriptFlow(input.merchant.id, input.country.id);
  const strictFlowEnabled = Boolean(scriptFlow) || isStrictFlowEnabled(input.merchant, input.country, input.merchantConfig);
  const effectiveStrictFlowStep = strictFlowEnabled
    ? resolveEffectiveStrictFlowStep(input.conversation, input.history)
    : "";
  if (effectiveStrictFlowStep && input.conversation.flowStep !== effectiveStrictFlowStep) {
    input.conversation.flowStep = effectiveStrictFlowStep;
  }

  const contextualPhone = detectContextualRegistrationPhone(input.analysisText, effectiveStrictFlowStep || input.conversation.flowStep);
  if (contextualPhone && !analysis.phone) {
    analysis = { ...analysis, phone: contextualPhone, intent: "provide_phone", stage: "need_phone_or_tg" };
  }

  const learnedIntent = findLearnedIntentMatch({
    events: input.repos.listPromotedIntentLearningEvents({ merchantId: input.merchant.id, countryId: input.country.id }),
    customerText: input.customerTextForAi,
    flowStep: effectiveStrictFlowStep || input.conversation.flowStep || ""
  });
  const learnedIntentDebug = learnedIntent ? {
    id: learnedIntent.event.id,
    suggestedIntent: learnedIntent.event.suggestedIntent,
    displayName: learnedIntent.event.displayName,
    score: learnedIntent.score
  } satisfies LearnedIntentDebugInfo : null;

  let inferredIntent = await inferStrictFlowIntent({
    ai: input.ai,
    runtimeConfig: input.runtimeConfig,
    conversation: input.conversation,
    analysis,
    customerText: input.customerTextForAi,
    strictFlowEnabled,
    history: input.history
  });
  if (learnedIntent?.internalIntent && inferredIntent === "unknown") {
    inferredIntent = learnedIntent.internalIntent;
  }
  if (inferredIntent !== "unknown") {
    analysis = applyInternalIntent(analysis, inferredIntent);
  }

  let contextualIntent = await inferStrictFlowContextualIntent({
    ai: input.ai,
    runtimeConfig: input.runtimeConfig,
    conversation: input.conversation,
    analysis,
    customerText: input.customerTextForAi,
    strictFlowEnabled,
    history: input.history,
    inferredIntent
  });
  if (learnedIntent?.contextualIntent && (contextualIntent.intent === "unknown" || contextualIntent.intent === "unknown_question" || contextualIntent.source === "ai")) {
    contextualIntent = {
      ...contextualIntent,
      intent: learnedIntent.contextualIntent,
      source: "rule",
      questionType: contextualQuestionTypeFromLearnedIntent(learnedIntent.contextualIntent),
      nextAction: `learned intent: ${learnedIntent.event.displayName || learnedIntent.event.suggestedIntent}`,
      reason: `matched promoted intent #${learnedIntent.event.id}`
    };
  }

  return {
    analysis,
    scriptFlow,
    strictFlowEnabled,
    effectiveStrictFlowStep,
    inferredIntent,
    contextualIntent,
    learnedIntent,
    learnedIntentDebug,
    intentLearningCandidate: buildIntentLearningCandidate({
      customerText: input.customerTextForAi,
      analysis,
      inferredIntent,
      contextualIntent,
      flowStep: effectiveStrictFlowStep || input.conversation.flowStep || "",
      strictFlowEnabled
    })
  };
}

export function detectContextualRegistrationPhone(text: string, flowStep: string): string {
  if (flowStep !== "wait_registration" && flowStep !== "telegram_confirm") return "";
  const normalized = text.trim();
  if (!/^\+?\d[\d\s-]{5,18}$/.test(normalized)) return "";
  const digits = normalized.replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 8 ? digits : "";
}
