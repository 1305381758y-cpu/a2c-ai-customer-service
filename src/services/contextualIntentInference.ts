import type { AppConfig } from "../config.js";
import type { InternalIntentLabel, MessageAnalysis } from "../domain/analyzer.js";
import { buildRuleContextualIntent, type StrictContextualIntent } from "../domain/strictFlow.js";
import type { Conversation, ConversationMessageRecord } from "../repositories.js";
import type { AiTasks } from "./aiTasks.js";

type RecentHistoryMessage = Pick<ConversationMessageRecord, "direction" | "content" | "intent" | "createdAt">;

export async function inferStrictFlowIntent(input: {
  ai: AiTasks;
  runtimeConfig: AppConfig;
  conversation: Pick<Conversation, "flowStep" | "language">;
  analysis: MessageAnalysis;
  customerText: string;
  strictFlowEnabled: boolean;
  history: RecentHistoryMessage[];
}): Promise<InternalIntentLabel> {
  if (!input.customerText.trim()) return "unknown";
  if (!input.strictFlowEnabled) return "unknown";
  if (!input.conversation.flowStep) return "unknown";
  if (input.analysis.intent !== "unknown" && input.analysis.intent !== "irrelevant_or_spam") return "unknown";
  return input.ai.classifyIntent(input.runtimeConfig, {
    customerText: input.customerText,
    language: input.analysis.language || input.conversation.language,
    flowStep: input.conversation.flowStep,
    recentHistory: input.history
  });
}

export async function inferStrictFlowContextualIntent(input: {
  ai: AiTasks;
  runtimeConfig: AppConfig;
  conversation: Conversation;
  analysis: MessageAnalysis;
  customerText: string;
  strictFlowEnabled: boolean;
  history: RecentHistoryMessage[];
  inferredIntent: InternalIntentLabel;
}): Promise<StrictContextualIntent> {
  const rule = buildRuleContextualIntent({
    conversation: input.conversation,
    analysis: input.analysis,
    customerText: input.customerText,
    inferredIntent: input.inferredIntent
  }, input.history);
  if (!input.strictFlowEnabled || !input.conversation.flowStep || !shouldAskAiForContext(rule, input.customerText, input.analysis.intent)) {
    return rule;
  }
  const aiIntent = await input.ai.classifyContextualIntent(input.runtimeConfig, {
    customerText: input.customerText,
    language: input.analysis.language || input.conversation.language,
    flowStep: input.conversation.flowStep,
    previousAssistantMessage: lastAssistantContent(input.history),
    recentHistory: input.history,
    knownPhone: input.conversation.extractedPhone,
    knownTelegram: input.conversation.extractedTelegram
  });
  if (aiIntent.intent === "unknown") return rule;
  return {
    intent: aiIntent.intent,
    source: "ai",
    answeredPreviousQuestion: aiIntent.answeredPreviousQuestion,
    isQuestion: aiIntent.isQuestion,
    isSubmission: aiIntent.intent === "phone_submission" || aiIntent.intent === "telegram_submission",
    shouldPause: aiIntent.shouldPause,
    questionType: normalizeContextualQuestionType(aiIntent.questionType),
    nextAction: aiIntent.nextAction,
    reason: aiIntent.reason
  };
}

export function applyInternalIntent(analysis: MessageAnalysis, inferredIntent: InternalIntentLabel): MessageAnalysis {
  const intentMap: Partial<Record<InternalIntentLabel, MessageAnalysis["intent"]>> = {
    positive_confirmation: "greeting",
    negative_refusal: "unknown",
    need_help: "need_help",
    ask_platform_register: "ask_platform_register",
    ask_link: "ask_link",
    ask_tg_register: "ask_tg_register",
    platform_register_done: "platform_register_done",
    trust_concern: "trust_concern",
    payment_concern: "unknown",
    investment_concern: "unknown",
    earning_concern: "unknown",
    workflow_question: "need_help",
    job_question: "greeting",
    complaint: "unknown",
    chat: "greeting",
    sensitive_request: "unknown"
  };
  const intent = intentMap[inferredIntent] ?? analysis.intent;
  const stage = intent === "ask_tg_register" || intent === "platform_register_done"
    ? "need_phone_or_tg"
    : analysis.stage;
  return { ...analysis, intent, stage };
}

function shouldAskAiForContext(rule: StrictContextualIntent, text: string, intent: MessageAnalysis["intent"]): boolean {
  if (rule.source === "rule" && rule.intent !== "unknown" && rule.intent !== "unknown_question") return false;
  const normalized = text.trim();
  if (!normalized) return false;
  return rule.intent === "unknown_question" ||
    intent === "unknown" ||
    intent === "irrelevant_or_spam" ||
    (intent === "greeting" && !/^(你好|您好|早上好|下午好|晚上好|hi|hello|hey)$/i.test(normalized)) ||
    normalized.length <= 16 ||
    /[?？为什么為什麼怎么怎麼如何什么什麼]/.test(normalized);
}

function normalizeContextualQuestionType(value: string): StrictContextualIntent["questionType"] {
  const normalized = value.trim().toLowerCase();
  if (normalized === "telegram") return "telegram";
  if (normalized === "payment") return "payment";
  if (normalized === "investment") return "investment";
  if (normalized === "trust") return "trust";
  if (normalized === "earning") return "earning";
  if (normalized === "workflow") return "help";
  if (normalized === "job") return "job";
  if (normalized === "complaint") return "complaint";
  if (normalized === "chat") return "chat";
  if (normalized === "sensitive") return "sensitive";
  if (normalized === "unknown") return "unknown";
  return "none";
}

function lastAssistantContent(history: Array<{ direction: string; content: string }>): string {
  return [...history].reverse().find((message) => message.direction === "outbound")?.content ?? "";
}
