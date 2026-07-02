import {
  analyzeAiImage,
  classifyAiContextualIntent,
  classifyAiIntent,
  detectAiLanguage,
  generateAiText,
  naturalizeStrictFlowText,
  type AiImageAnalysis
} from "../clients/aiProvider.js";
import { checkAiAvailability } from "../clients/aiAvailabilityTask.js";
import { AiReplyClient } from "../clients/aiReplyClient.js";
import type { AiReply, ReplyInput } from "../clients/aiReplyTypes.js";
import { generateConversationReviewDraftWithAi, type AiConversationReviewDraftInput } from "../clients/aiConversationReviewTask.js";
import { extractTrainingImageTextWithAi, type AiTrainingImageTextInput, type AiTrainingImageTextResult } from "../clients/aiTrainingImageTextTask.js";
import { translateTextWithAi, type AiTranslationInput } from "../clients/aiTranslationTask.js";
import type { AppConfig } from "../config.js";
import type { ContextualIntentLabel, InternalIntentLabel } from "../domain/analyzer.js";
import type { ConversationReviewInput, MerchantAgentProfileRecord } from "../repositories.js";

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

  async translateText(config: AppConfig, input: AiTranslationInput): Promise<string> {
    return translateTextWithAi(config, input, {
      generateText: generateAiText
    });
  }

  async checkAvailability(config: AppConfig): Promise<void> {
    await checkAiAvailability(config, {
      generateText: generateAiText
    });
  }

  async extractTrainingImageText(config: AppConfig, input: AiTrainingImageTextInput): Promise<AiTrainingImageTextResult> {
    return extractTrainingImageTextWithAi(config, input, {
      hasMiniMaxKey: (runtimeConfig) => Boolean(runtimeConfig.MINIMAX_API_KEY),
      hasGeminiKey: (runtimeConfig) => Boolean(runtimeConfig.GOOGLE_AI_API_KEY),
      generateText: generateAiText
    });
  }

  async generateConversationReviewDraft(config: AppConfig, input: AiConversationReviewDraftInput): Promise<ConversationReviewInput> {
    return generateConversationReviewDraftWithAi(config, input, {
      generateText: generateAiText
    });
  }
}
