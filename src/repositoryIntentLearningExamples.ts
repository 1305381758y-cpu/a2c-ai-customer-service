import { clipText, parseJsonRecordArray } from "./repositoryJson.js";
import type { IntentLearningInput } from "./repositoryTypes.js";

export interface IntentLearningExample {
  [key: string]: unknown;
  text: string;
  conversationId: string;
  messageId: number | null;
  detectedIntent: string;
  inferredIntent: string;
  contextualIntent: string;
  flowStep: string;
  at: string;
}

export function buildIntentLearningExample(input: IntentLearningInput, now = new Date()): IntentLearningExample {
  return {
    text: clipText(input.customerText, 300),
    conversationId: input.conversationId,
    messageId: input.messageId ?? null,
    detectedIntent: input.detectedIntent,
    inferredIntent: input.inferredIntent,
    contextualIntent: input.contextualIntent,
    flowStep: input.flowStep,
    at: now.toISOString()
  };
}

export function mergeIntentLearningExamples(example: IntentLearningExample, existingExamplesJson: unknown, limit = 8): Record<string, unknown>[] {
  return [example, ...parseJsonRecordArray(existingExamplesJson)]
    .filter((item, index, array) => {
      const text = String((item as Record<string, unknown>).text ?? "");
      return text && array.findIndex((candidate) => String((candidate as Record<string, unknown>).text ?? "") === text) === index;
    })
    .slice(0, limit);
}
