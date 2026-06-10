import type { ConversationStage, IntentLabel } from "./intents.js";

export interface TrainingSampleForSearch {
  id: number;
  customerMessage: string;
  standardReply: string;
  stage: string;
  intent: string;
  language: string;
  keywords: string;
  priority: number;
}

export interface SearchContext {
  text: string;
  language: string;
  intent: IntentLabel;
  stage: ConversationStage;
}

export function rankSamples(samples: TrainingSampleForSearch[], context: SearchContext, limit = 5): TrainingSampleForSearch[] {
  return samples
    .map((sample) => ({ sample, score: scoreSample(sample, context) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.sample.priority - a.sample.priority)
    .slice(0, limit)
    .map((item) => item.sample);
}

function scoreSample(sample: TrainingSampleForSearch, context: SearchContext): number {
  let score = Math.min(sample.priority || 0, 20);
  if (sample.language && sample.language === context.language) score += 20;
  if (sample.intent && sample.intent === context.intent) score += 30;
  if (sample.stage && sample.stage === context.stage) score += 15;

  const haystack = `${sample.customerMessage} ${sample.keywords}`.toLowerCase();
  for (const token of tokenize(context.text)) {
    if (haystack.includes(token)) score += token.length > 2 ? 4 : 1;
  }
  return score;
}

function tokenize(text: string): string[] {
  const latin = text.toLowerCase().match(/[a-z0-9_@.]{2,}/g) ?? [];
  const cjk = text.match(/[\u4E00-\u9FFF]{1,2}/g) ?? [];
  return [...new Set([...latin, ...cjk])];
}
