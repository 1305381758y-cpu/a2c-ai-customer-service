import {
  analyzeAiImage,
  classifyAiContextualIntent,
  classifyAiIntent,
  detectAiLanguage,
  naturalizeStrictFlowText,
  type AiImageAnalysis
} from "../clients/aiProvider.js";
import { AiReplyClient, type AiReply, type ReplyInput } from "../clients/aiReplyClient.js";
import type { AppConfig } from "../config.js";
import type { ContextualIntentLabel, InternalIntentLabel } from "../domain/analyzer.js";
import type { MerchantAgentProfileRecord } from "../repositories.js";

export interface AiLanguageDetectionInput {
  customerText: string;
  previousLanguage: string;
  countryDefaultLanguage: string;
  recentHistory: Array<{ direction: string; content: string; intent: string; createdAt: string }>;
}

export interface AiIntentClassificationInput {
  customerText: string;
  language: string;
  flowStep: string;
  recentHistory: Array<{ direction: string; content: string; intent: string; createdAt: string }>;
}

export interface AiContextualIntentInput extends AiIntentClassificationInput {
  previousAssistantMessage: string;
  knownPhone: string;
  knownTelegram: string;
}

export interface AiContextualIntentResult {
  intent: ContextualIntentLabel;
  answeredPreviousQuestion: boolean;
  isQuestion: boolean;
  shouldPause: boolean;
  questionType: string;
  nextAction: string;
  reason: string;
}

export interface AiNaturalizeStrictFlowInput {
  customerText: string;
  draftReply: string;
  language: string;
  flowStep: string;
  questionType: string;
  recentHistory: Array<{ direction: string; content: string; intent: string; createdAt: string }>;
  allowLinkOrInvite: boolean;
  agentProfile?: MerchantAgentProfileRecord;
}

export class AiTasks {
  async generateReply(config: AppConfig, input: ReplyInput): Promise<AiReply> {
    return new AiReplyClient(config).generateReply(input);
  }

  async analyzeImage(config: AppConfig, imageUrl: string): Promise<AiImageAnalysis> {
    return analyzeAiImage(config, imageUrl);
  }

  async detectLanguage(config: AppConfig, input: AiLanguageDetectionInput): Promise<string> {
    return detectAiLanguage(config, input);
  }

  async classifyIntent(config: AppConfig, input: AiIntentClassificationInput): Promise<InternalIntentLabel> {
    return classifyAiIntent(config, input);
  }

  async classifyContextualIntent(config: AppConfig, input: AiContextualIntentInput): Promise<AiContextualIntentResult> {
    return classifyAiContextualIntent(config, input);
  }

  async naturalizeStrictFlowText(config: AppConfig, input: AiNaturalizeStrictFlowInput): Promise<{ text: string; used: boolean; error?: string }> {
    return naturalizeStrictFlowText(config, input);
  }
}
