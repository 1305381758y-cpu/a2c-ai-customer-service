import type { ChatMessage, ConversationReviewResponse, Knowledge, Sample, ScriptFlowStep } from "../types.js";
import { firstSuggestedReply } from "./ConversationScriptHelpers.js";

export function trainingSuggestedReply(currentScriptStep: ScriptFlowStep | null, trainingSamples: Sample[], review: ConversationReviewResponse) {
  return currentScriptStep?.standardReply
    || trainingSamples.find((sample) => sample.standardReply)?.standardReply
    || firstSuggestedReply(review)
    || "当前节点还没有配置标准回复。可以先生成对话复盘，或到话本流程/训练中心补充样本。";
}

export function trainingBusinessSource(currentScriptStep: ScriptFlowStep | null, firstSample?: Sample, firstReviewItem?: unknown) {
  if (currentScriptStep) return "当前话本节点";
  if (firstSample) return "训练样本";
  if (firstReviewItem) return "复盘候选";
  return "待补充";
}

export function trainingReferenceCounts(lastOutboundPayload: NonNullable<ChatMessage["rawPayload"]>) {
  return {
    samples: lastOutboundPayload.samples?.length || 0,
    materials: lastOutboundPayload.trainingMaterials?.length || 0
  };
}

export function firstMatchedKnowledge(knowledgeItems: Knowledge[]) {
  return knowledgeItems[0];
}

export function firstMatchedSample(trainingSamples: Sample[]) {
  return trainingSamples[0];
}

export function firstReviewCandidate(review: ConversationReviewResponse) {
  return review.items[0];
}
