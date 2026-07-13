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
  avoidReplies?: string[];
}

export interface AiTaskPorts {
  generateReply?: (config: AppConfig, input: ReplyInput) => Promise<AiReply>;
  analyzeImage?: (config: AppConfig, imageUrl: string) => Promise<AiImageAnalysis>;
  detectLanguage?: (config: AppConfig, input: AiLanguageDetectionInput) => Promise<string>;
  classifyIntent?: (config: AppConfig, input: AiIntentClassificationInput) => Promise<InternalIntentLabel>;
  classifyContextualIntent?: (config: AppConfig, input: AiContextualIntentInput) => Promise<AiContextualIntentResult>;
  naturalizeStrictFlowText?: (config: AppConfig, input: AiNaturalizeStrictFlowInput) => Promise<{ text: string; used: boolean; error?: string }>;
  translateText?: (config: AppConfig, input: AiTranslationInput) => Promise<string>;
  checkAvailability?: (config: AppConfig) => Promise<void>;
  extractTrainingImageText?: (config: AppConfig, input: AiTrainingImageTextInput) => Promise<AiTrainingImageTextResult>;
  generateConversationReviewDraft?: (config: AppConfig, input: AiConversationReviewDraftInput) => Promise<ConversationReviewInput>;
}

export class AiTasks {
  constructor(private readonly ports: AiTaskPorts = {}) {}

  async generateReply(config: AppConfig, input: ReplyInput): Promise<AiReply> {
    if (this.ports.generateReply) return this.ports.generateReply(config, input);
    return new AiReplyClient(config).generateReply(input);
  }

  async analyzeImage(config: AppConfig, imageUrl: string): Promise<AiImageAnalysis> {
    if (this.ports.analyzeImage) return this.ports.analyzeImage(config, imageUrl);
    return analyzeAiImage(config, imageUrl);
  }

  async detectLanguage(config: AppConfig, input: AiLanguageDetectionInput): Promise<string> {
    if (this.ports.detectLanguage) return this.ports.detectLanguage(config, input);
    return detectAiLanguage(config, input);
  }

  async classifyIntent(config: AppConfig, input: AiIntentClassificationInput): Promise<InternalIntentLabel> {
    if (this.ports.classifyIntent) return this.ports.classifyIntent(config, input);
    return classifyAiIntent(config, input);
  }

  async classifyContextualIntent(config: AppConfig, input: AiContextualIntentInput): Promise<AiContextualIntentResult> {
    if (this.ports.classifyContextualIntent) return this.ports.classifyContextualIntent(config, input);
    return classifyAiContextualIntent(config, input);
  }

  async naturalizeStrictFlowText(config: AppConfig, input: AiNaturalizeStrictFlowInput): Promise<{ text: string; used: boolean; error?: string }> {
    if (this.ports.naturalizeStrictFlowText) return this.ports.naturalizeStrictFlowText(config, input);
    return naturalizeStrictFlowText(config, input);
  }

  async translateText(config: AppConfig, input: AiTranslationInput): Promise<string> {
    if (this.ports.translateText) return this.ports.translateText(config, input);
    return translateTextWithAi(config, input, {
      generateText: generateAiText
    });
  }

  async checkAvailability(config: AppConfig): Promise<void> {
    if (this.ports.checkAvailability) return this.ports.checkAvailability(config);
    await checkAiAvailability(config, {
      generateText: generateAiText
    });
  }

  async extractTrainingImageText(config: AppConfig, input: AiTrainingImageTextInput): Promise<AiTrainingImageTextResult> {
    if (this.ports.extractTrainingImageText) return this.ports.extractTrainingImageText(config, input);
    return extractTrainingImageTextWithAi(config, input, {
      hasMiniMaxKey: (runtimeConfig) => Boolean(runtimeConfig.MINIMAX_API_KEY),
      hasGeminiKey: (runtimeConfig) => Boolean(runtimeConfig.GOOGLE_AI_API_KEY),
      generateText: generateAiText
    });
  }

  async generateConversationReviewDraft(config: AppConfig, input: AiConversationReviewDraftInput): Promise<ConversationReviewInput> {
    if (this.ports.generateConversationReviewDraft) return this.ports.generateConversationReviewDraft(config, input);
    return generateConversationReviewDraftWithAi(config, input, {
      generateText: generateAiText
    });
  }
}
