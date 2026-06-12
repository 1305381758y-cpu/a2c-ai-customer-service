import { GoogleGenAI, Type, type Part, type Schema } from "@google/genai";
import type { AppConfig } from "../config.js";
import type { Conversation, CustomerMemoryRecord, KnowledgeItemRecord, MerchantCountryRecord, TrainingMaterialItemRecord } from "../repositories.js";
import type { TrainingSampleForSearch } from "../domain/sampleRetrieval.js";

export interface ReplyInput {
  customerText: string;
  conversation: Conversation;
  history: Array<{ direction: string; content: string; intent: string; createdAt: string }>;
  samples: TrainingSampleForSearch[];
  knowledge: KnowledgeItemRecord[];
  trainingMaterials?: TrainingMaterialItemRecord[];
  memory?: CustomerMemoryRecord;
  country?: MerchantCountryRecord;
}

export interface AiReply {
  reply: string;
  language: string;
  stage: string;
  extractedPhone: string;
  extractedTelegram: string;
  extractedWhatsApp: string;
  shouldHandoff: boolean;
  fallback?: boolean;
  error?: string;
}

export type GeminiConfig = Pick<AppConfig, "GOOGLE_AI_API_KEY" | "GOOGLE_AI_MODEL">;

const GEMINI_TIMEOUT_MS = 15_000;

const replySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    reply: { type: Type.STRING },
    language: { type: Type.STRING },
    stage: { type: Type.STRING },
    extractedPhone: { type: Type.STRING },
    extractedTelegram: { type: Type.STRING },
    extractedWhatsApp: { type: Type.STRING },
    shouldHandoff: { type: Type.BOOLEAN }
  },
  required: ["reply", "language", "stage", "extractedPhone", "extractedTelegram", "extractedWhatsApp", "shouldHandoff"],
  propertyOrdering: ["reply", "language", "stage", "extractedPhone", "extractedTelegram", "extractedWhatsApp", "shouldHandoff"]
};

export class GeminiReplyClient {
  private readonly client?: GoogleGenAI;

  constructor(private readonly config: AppConfig) {
    const apiKey = geminiApiKey(config);
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : undefined;
  }

  async generateReply(input: ReplyInput): Promise<AiReply> {
    if (!this.client) return fallbackReply(input, this.config);

    try {
      const response = await this.client.models.generateContent({
        model: geminiModel(this.config),
        contents: JSON.stringify({
          customerText: input.customerText,
          conversation: input.conversation,
          recentHistory: input.history,
          relevantTrainingSamples: input.samples,
          knowledgeItems: input.knowledge,
          trainingMaterials: input.trainingMaterials ?? [],
          customerMemory: input.memory ?? null,
          country: input.country ?? null
        }),
        config: {
          abortSignal: timeoutSignal(),
          httpOptions: { timeout: GEMINI_TIMEOUT_MS },
          systemInstruction: buildSystemPrompt(this.config),
          responseMimeType: "application/json",
          responseSchema: replySchema,
          temperature: 0.25,
          maxOutputTokens: 800,
          thinkingConfig: { thinkingBudget: 0 }
        }
      });

      return normalizeAiReply(JSON.parse(response.text?.trim() || "{}"), input, this.config);
    } catch (error) {
      const fallback = fallbackReply(input, this.config);
      fallback.fallback = true;
      fallback.error = error instanceof Error ? error.message : "Gemini reply failed";
      return fallback;
    }
  }
}

export async function generateGeminiText(
  config: GeminiConfig,
  contents: string | Part[],
  options: { systemInstruction?: string; temperature?: number } = {}
): Promise<string> {
  const apiKey = geminiApiKey(config);
  if (!apiKey) throw new Error("Google AI Studio Key 未配置");
  const client = new GoogleGenAI({ apiKey });
  const response = await client.models.generateContent({
    model: geminiModel(config),
    contents,
    config: {
      abortSignal: timeoutSignal(),
      httpOptions: { timeout: GEMINI_TIMEOUT_MS },
      systemInstruction: options.systemInstruction,
      temperature: options.temperature ?? 0.2,
      maxOutputTokens: 1200,
      thinkingConfig: { thinkingBudget: 0 }
    }
  });
  return response.text?.trim() || "";
}

export function geminiApiKey(config: GeminiConfig): string {
  const value = config.GOOGLE_AI_API_KEY || "";
  return value === "CHANGE_ME" ? "" : value;
}

export function geminiModel(config: GeminiConfig): string {
  return config.GOOGLE_AI_MODEL || "gemini-2.5-flash";
}

function timeoutSignal(): AbortSignal {
  return AbortSignal.timeout(GEMINI_TIMEOUT_MS);
}

function buildSystemPrompt(config: AppConfig): string {
  return `
你是甲方配置的 AI 话术训练/知识库训练客服。你必须根据甲方样本库、客户历史聊天记录和客户当前语言回复。

目标：
1. 引导客户完成平台开户。
2. 根据当前国家配置，引导客户提供所需联系方式：手机号、Telegram 或 WhatsApp。
3. 当客户满足当前国家 completion targets 后，停止继续引导，进入人工接管。

语言规则：
- 必须使用客户最近消息的主要语言回复。
- 可以把甲方中文样本翻译成客户语言，但不能改变链接、金额、承诺、规则、平台名称或业务含义。

安全和业务规则：
- 优先参考 relevantTrainingSamples 中的标准回复。
- 同时参考 knowledgeItems 中启用的 FAQ、话术、规则和禁用表达。
- 同时参考 trainingMaterials，它来自商户上传的聊天记录、文档、文本和图片 OCR 文字。
- 同时参考 customerMemory，它是该客户自己的长期记忆文件，包括历史阶段、已提供资料、最近意图和人工备注。
- 同时参考 country，它是当前 A2C 客服账号绑定的国家配置；不同国家的链接、语言、目标可能不同。
- type=forbidden 的内容表示不能说或不能做的事，必须遵守。
- type=rule 的内容优先级高于普通样本。
- 不要编造样本中没有的信息。
- 不要要求客户提供密码、验证码、支付信息或证件敏感信息。
- 每次只给客户当前最需要的一步，简短自然，像真人客服。
- 全局平台注册链接：${config.PLATFORM_REGISTER_URL || "未配置"}
- 全局 Telegram 注册说明链接：${config.TG_REGISTER_GUIDE_URL || "未配置"}

输出必须是 JSON，字段为 reply、language、stage、extractedPhone、extractedTelegram、extractedWhatsApp、shouldHandoff。
`;
}

function normalizeAiReply(value: Partial<AiReply>, input: ReplyInput, config: AppConfig): AiReply {
  if (!value || typeof value.reply !== "string" || !value.reply.trim()) return fallbackReply(input, config);
  return {
    reply: value.reply.trim(),
    language: typeof value.language === "string" && value.language ? value.language : input.conversation.language,
    stage: typeof value.stage === "string" && value.stage ? value.stage : input.conversation.stage,
    extractedPhone: typeof value.extractedPhone === "string" ? value.extractedPhone : input.conversation.extractedPhone,
    extractedTelegram: typeof value.extractedTelegram === "string" ? value.extractedTelegram : input.conversation.extractedTelegram,
    extractedWhatsApp: typeof value.extractedWhatsApp === "string" ? value.extractedWhatsApp : input.conversation.extractedWhatsApp,
    shouldHandoff: Boolean(value.shouldHandoff)
  };
}

function fallbackReply(input: ReplyInput, config: AppConfig): AiReply {
  const sample = input.samples[0];
  const language = input.conversation.language === "unknown" ? "zh" : input.conversation.language;
  const reply = sample?.standardReply || defaultReply(language, config);
  return {
    reply,
    language,
    stage: input.conversation.stage,
    extractedPhone: input.conversation.extractedPhone,
    extractedTelegram: input.conversation.extractedTelegram,
    extractedWhatsApp: input.conversation.extractedWhatsApp,
    shouldHandoff: false,
    fallback: true
  };
}

function defaultReply(language: string, config: AppConfig): string {
  const link = config.PLATFORM_REGISTER_URL ? ` ${config.PLATFORM_REGISTER_URL}` : "";
  if (language === "en") return `Please complete the platform registration first, then send us your phone number and Telegram account.${link}`;
  if (language === "ms") return `Sila lengkapkan pendaftaran platform dahulu, kemudian hantar nombor telefon dan akaun Telegram anda.${link}`;
  if (language === "id") return `Silakan selesaikan pendaftaran platform terlebih dahulu, lalu kirim nomor telepon dan akun Telegram Anda.${link}`;
  if (language === "th") return `กรุณาสมัครบัญชีแพลตฟอร์มให้เสร็จก่อน จากนั้นส่งเบอร์โทรและบัญชี Telegram ของคุณมาให้เรา${link}`;
  if (language === "vi") return `Vui lòng hoàn tất đăng ký tài khoản nền tảng trước, sau đó gửi số điện thoại và tài khoản Telegram của bạn.${link}`;
  if (language === "pt-BR") return `Conclua primeiro o cadastro na plataforma. Depois, envie seu número de telefone e sua conta do Telegram.${link}`;
  return `请先完成平台开户，完成后把您的手机号和 Telegram 账号发给我。${link}`;
}
