import {
  analyzeAiImage,
  classifyAiContextualIntent,
  classifyAiIntent,
  detectAiLanguage,
  generateAiText,
  naturalizeStrictFlowText,
  type AiImageAnalysis,
  type AiTextPart
} from "../clients/aiProvider.js";
import { AiReplyClient } from "../clients/aiReplyClient.js";
import type { AiReply, ReplyInput } from "../clients/aiReplyTypes.js";
import type { AppConfig } from "../config.js";
import type { ContextualIntentLabel, InternalIntentLabel } from "../domain/analyzer.js";
import type { ConversationMessageRecord, ConversationReviewInput, MerchantAgentProfileRecord } from "../repositories.js";

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

export interface AiTranslationInput {
  text: string;
  targetLanguage: string;
  systemPrompt: string;
}

export interface AiTrainingImageTextInput {
  buffer: Buffer;
  filename: string;
  mimeType?: string;
}

export interface AiTrainingImageTextResult {
  text: string;
  status: "ok" | "skipped" | "failed";
  error?: string;
}

export interface AiConversationReviewDraftInput {
  agentProfile: MerchantAgentProfileRecord;
  messages: ConversationMessageRecord[];
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
    return generateAiText(config, JSON.stringify({ targetLanguage: input.targetLanguage, text: input.text }), {
      systemInstruction: input.systemPrompt
    });
  }

  async checkAvailability(config: AppConfig): Promise<void> {
    await generateAiText(config, "Reply with OK only.");
  }

  async extractTrainingImageText(config: AppConfig, input: AiTrainingImageTextInput): Promise<AiTrainingImageTextResult> {
    const hasMiniMax = Boolean(config.MINIMAX_API_KEY);
    const hasGemini = Boolean(config.GOOGLE_AI_API_KEY);
    if (!hasMiniMax && !hasGemini) {
      return { text: "", status: "skipped", error: "图片 OCR 需要配置支持图片的 MiniMax 或 Gemini Key；当前图片未提取到文字" };
    }

    const imageProvider = config.AI_PROVIDER === "gemini" && hasGemini ? "gemini" : hasMiniMax ? "minimax" : "gemini";
    const contents: AiTextPart[] = [
      { inlineData: { mimeType: input.mimeType || guessImageMime(input.filename), data: input.buffer.toString("base64") } },
      { text: "请只提取图片中的全部可读文字，保持原语言和换行，不要解释。" }
    ];

    try {
      const text = await generateAiText({ ...config, AI_PROVIDER: imageProvider }, contents);
      return text.trim() ? { text, status: "ok" } : { text: "", status: "skipped", error: "图片 OCR 未提取到可读文字" };
    } catch (error) {
      return { text: "", status: "failed", error: error instanceof Error ? error.message : "图片 OCR 失败" };
    }
  }

  async generateConversationReviewDraft(config: AppConfig, input: AiConversationReviewDraftInput): Promise<ConversationReviewInput> {
    const text = await generateAiText(config, JSON.stringify({
      agentProfile: input.agentProfile,
      messages: input.messages.map((message) => ({
        direction: message.direction,
        content: message.content,
        intent: message.intent,
        language: message.language,
        rawPayload: {
          replyMode: message.rawPayload.replyMode,
          flowStep: message.rawPayload.strictFlowStep || message.rawPayload.flowStep,
          questionType: message.rawPayload.strictQuestionType || message.rawPayload.contextualIntent
        },
        createdAt: message.createdAt
      }))
    }), {
      temperature: 0.15,
      systemInstruction: `
你是客服质检和训练数据审核员。请只输出 JSON，不要 markdown。
目标：复盘一轮开户注册客服对话，判断是否完成手机号和 Telegram 收集，识别重复话术、答非所问、跳流程、未回答客户疑问。
候选学习内容不能直接启用，只是给商户审核。
JSON 字段：
{
  "score": 0-100,
  "goalCompleted": boolean,
  "summary": "一句中文总结",
  "mainConcerns": ["安全", "收益"],
  "mistakes": ["问题"],
  "goodReplies": ["优秀回复原文"],
  "suggestedSamples": [{"customerMessage":"客户说法","standardReply":"建议回复","intent":"unknown","stage":"auto_review","language":"zh","keywords":"复盘候选","priority":0}],
  "suggestedKnowledge": [{"title":"知识标题","content":"知识内容","type":"faq","language":"zh","priority":0}],
  "improvementActions": ["优化建议"]
}
评分维度：目标完成度、自然度、问题解答质量、流程推进、边界合规、重复程度。
不要把错误回复作为优秀样本。不要包含 AI、机器人、模型等客户不可见身份话术。
`
    });
    return JSON.parse(stripJsonFence(text)) as ConversationReviewInput;
  }
}

function stripJsonFence(text: string): string {
  return text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function guessImageMime(filename: string): string {
  const name = filename.toLowerCase();
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".svg")) return "image/svg+xml";
  return "image/png";
}
