import { isContextualIntentLabel, isInternalIntentLabel, type ContextualIntentLabel, type InternalIntentLabel, type MessageAnalysis } from "../domain/analyzer.js";
import type { StrictContextualIntent } from "../domain/strictFlow.js";
import type { IntentLearningEventRecord } from "../repositories.js";

export interface LearnedIntentMatch {
  event: IntentLearningEventRecord;
  score: number;
  internalIntent?: InternalIntentLabel;
  contextualIntent?: ContextualIntentLabel;
}

export function findLearnedIntentMatch(input: { events: IntentLearningEventRecord[]; customerText: string; flowStep: string }): LearnedIntentMatch | undefined {
  const text = input.customerText.trim();
  if (!text || text.length < 2) return undefined;
  const signature = signatureForIntent(text);
  let best: LearnedIntentMatch | undefined;
  for (const event of input.events) {
    if (!isLearnedIntentApplicableToStep(event, input.flowStep)) continue;
    const texts = [event.customerText, ...event.examples.map((example) => String(example.text || example.customerText || ""))].filter(Boolean);
    const score = Math.max(...texts.map((candidate) => learnedTextSimilarity(text, candidate, signature)));
    if (score < 0.74) continue;
    const match = {
      event,
      score,
      internalIntent: isInternalIntentLabel(event.suggestedIntent) ? event.suggestedIntent : undefined,
      contextualIntent: isContextualIntentLabel(event.suggestedIntent) ? event.suggestedIntent : undefined
    };
    if (!best || match.score > best.score || match.score === best.score && event.occurrenceCount > best.event.occurrenceCount) best = match;
  }
  return best;
}

export function contextualQuestionTypeFromLearnedIntent(intent: ContextualIntentLabel): StrictContextualIntent["questionType"] {
  const map: Partial<Record<ContextualIntentLabel, StrictContextualIntent["questionType"]>> = {
    payment_concern: "payment",
    investment_concern: "investment",
    trust_concern: "trust",
    earning_concern: "earning",
    registration_field_question: "registration_field",
    workflow_question: "help",
    job_question: "job",
    ask_tg_register: "telegram",
    telegram_username_help: "telegram",
    complaint: "complaint",
    chat: "chat",
    sensitive_request: "sensitive",
    unknown_question: "unknown"
  };
  return map[intent] || "none";
}

export function buildIntentLearningCandidate(input: {
  customerText: string;
  analysis: MessageAnalysis;
  inferredIntent: InternalIntentLabel;
  contextualIntent: StrictContextualIntent;
  flowStep: string;
  strictFlowEnabled: boolean;
}): { candidateKey: string; suggestedIntent: string; displayName: string; description: string } | undefined {
  const text = input.customerText.trim();
  if (!text || text.length < 2 || input.analysis.phone || input.analysis.telegram) return undefined;
  const contextual = input.contextualIntent.intent || "unknown";
  const pureGreeting = /^(你好|您好|早上好|下午好|晚上好|hi|hello|hey|ola|olá)$/i.test(text);
  const looksMisclassifiedGreeting = input.analysis.intent === "greeting" && !pureGreeting;
  const needsLearning =
    input.analysis.intent === "unknown" ||
    input.analysis.intent === "irrelevant_or_spam" ||
    contextual === "unknown" ||
    contextual === "unknown_question" ||
    input.contextualIntent.source === "ai" ||
    input.inferredIntent !== "unknown" ||
    looksMisclassifiedGreeting;
  if (!needsLearning) return undefined;

  const suggestedIntent = normalizeSuggestedIntent(input);
  const displayName = intentDisplayName(suggestedIntent);
  const description = intentDescription(suggestedIntent, {
    detectedIntent: input.analysis.intent,
    inferredIntent: input.inferredIntent,
    contextualIntent: contextual,
    flowStep: input.flowStep
  });
  return {
    candidateKey: candidateKeyForIntent(suggestedIntent, input.flowStep, text),
    suggestedIntent,
    displayName,
    description
  };
}

function isLearnedIntentApplicableToStep(event: IntentLearningEventRecord, currentStep: string): boolean {
  if (!event.flowStep || !currentStep) return true;
  if (event.flowStep === currentStep) return true;
  if (event.suggestedIntent.startsWith("custom_unknown")) return true;
  return false;
}

function learnedTextSimilarity(text: string, candidate: string, signature: string): number {
  const candidateSignature = signatureForIntent(candidate);
  if (signature && signature === candidateSignature) return 1;
  const a = tokenSetForLearning(text);
  const b = tokenSetForLearning(candidate);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = new Set([...a, ...b]).size;
  const jaccard = union ? intersection / union : 0;
  const normalizedA = normalizeLearningText(text);
  const normalizedB = normalizeLearningText(candidate);
  const containment = normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA) ? Math.min(normalizedA.length, normalizedB.length) / Math.max(normalizedA.length, normalizedB.length) : 0;
  return Math.max(jaccard, containment);
}

function tokenSetForLearning(text: string): Set<string> {
  const normalized = normalizeLearningText(text);
  const tokens = normalized.match(/[a-z0-9]+|[\u4E00-\u9FFF]/gi) || [];
  const grams = new Set<string>(tokens);
  for (let i = 0; i < normalized.length - 1; i += 1) {
    grams.add(normalized.slice(i, i + 2));
  }
  return grams;
}

function normalizeLearningText(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "url")
    .replace(/@\w+/g, "@user")
    .replace(/\d{4,}/g, "number")
    .replace(/[^\p{L}\p{N}\u4E00-\u9FFF]+/gu, "")
    .trim();
}

function candidateKeyForIntent(suggestedIntent: string, flowStep: string, text: string): string {
  const signature = signatureForIntent(text);
  if (suggestedIntent.startsWith("custom_unknown") || suggestedIntent === "custom_unclassified_or_noise") {
    return [suggestedIntent, signature].join(":");
  }
  return [flowStep || "no_step", suggestedIntent, signature].join(":");
}

function normalizeSuggestedIntent(input: {
  customerText: string;
  analysis: MessageAnalysis;
  inferredIntent: InternalIntentLabel;
  contextualIntent: StrictContextualIntent;
}): string {
  if (input.contextualIntent.intent && input.contextualIntent.intent !== "unknown" && input.contextualIntent.intent !== "unknown_question") {
    return input.contextualIntent.intent;
  }
  if (input.inferredIntent !== "unknown") return input.inferredIntent;
  const text = input.customerText.toLowerCase();
  if (/[?？]/.test(input.customerText) || /(为什么|為什麼|怎么|怎麼|如何|什么|什麼|where|how|why|what)/i.test(input.customerText)) return "custom_unknown_question";
  if (/^(好的|好|ok|嗯|明白|知道了|yes|sim|claro)$/i.test(text.trim())) return "contextual_acknowledgement";
  if (input.analysis.intent === "irrelevant_or_spam") return "custom_unclassified_or_noise";
  return "custom_unclassified";
}

function intentDisplayName(intent: string): string {
  const names: Record<string, string> = {
    positive_confirmation: "上下文肯定回复",
    acknowledgement: "已理解/等待操作",
    negative_refusal: "拒绝或暂停",
    not_available: "当前没空",
    not_registered: "尚未注册完成",
    no_telegram: "没有 Telegram",
    telegram_installed: "Telegram 已安装",
    telegram_username_help: "Telegram 用户名帮助",
    payment_concern: "费用疑问",
    investment_concern: "投资/本金疑问",
    trust_concern: "安全/诈骗疑虑",
    earning_concern: "收益疑问",
    workflow_question: "流程操作问题",
    job_question: "工作内容问题",
    complaint: "抱怨重复/机械",
    chat: "闲聊/身份问题",
    sensitive_request: "敏感资料请求",
    custom_unknown_question: "待识别客户问题",
    contextual_acknowledgement: "短句确认/已知晓",
    custom_unclassified_or_noise: "待判断无关内容",
    custom_unclassified: "待识别新意图"
  };
  return names[intent] || intent;
}

function intentDescription(intent: string, input: { detectedIntent: string; inferredIntent: string; contextualIntent: string; flowStep: string }): string {
  return `客户表达可能需要沉淀为“${intentDisplayName(intent)}”。原始识别=${input.detectedIntent}，AI意图=${input.inferredIntent}，上下文意图=${input.contextualIntent}，流程=${input.flowStep || "未进入流程"}。`;
}

function signatureForIntent(text: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "url")
    .replace(/@\w+/g, "@user")
    .replace(/\d{4,}/g, "number")
    .replace(/[^\p{L}\p{N}\u4E00-\u9FFF]+/gu, "")
    .slice(0, 24);
  return normalized || "empty";
}
