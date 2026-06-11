import OpenAI from "openai";
import type { AppConfig } from "../config.js";
import type { Conversation, CustomerMemoryRecord, KnowledgeItemRecord, TrainingMaterialItemRecord } from "../repositories.js";
import type { TrainingSampleForSearch } from "../domain/sampleRetrieval.js";

export interface ReplyInput {
  customerText: string;
  conversation: Conversation;
  history: Array<{ direction: string; content: string; intent: string; createdAt: string }>;
  samples: TrainingSampleForSearch[];
  knowledge: KnowledgeItemRecord[];
  trainingMaterials?: TrainingMaterialItemRecord[];
  memory?: CustomerMemoryRecord;
}

export interface AiReply {
  reply: string;
  language: string;
  stage: string;
  extractedPhone: string;
  extractedTelegram: string;
  shouldHandoff: boolean;
}

export class OpenAIReplyClient {
  private readonly client?: OpenAI;

  constructor(private readonly config: AppConfig) {
    const apiKey = config.OPENAI_API_KEY === "CHANGE_ME" ? "" : config.OPENAI_API_KEY;
    this.client = apiKey ? new OpenAI({ apiKey }) : undefined;
  }

  async generateReply(input: ReplyInput): Promise<AiReply> {
    if (!this.client) return fallbackReply(input, this.config);

    const response = await this.client.responses.create({
      model: this.config.OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: buildSystemPrompt(this.config)
        },
        {
          role: "user",
          content: JSON.stringify({
            customerText: input.customerText,
            conversation: input.conversation,
            recentHistory: input.history,
            relevantTrainingSamples: input.samples,
            knowledgeItems: input.knowledge,
            trainingMaterials: input.trainingMaterials ?? [],
            customerMemory: input.memory ?? null
          })
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "customer_service_reply",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              reply: { type: "string" },
              language: { type: "string" },
              stage: { type: "string" },
              extractedPhone: { type: "string" },
              extractedTelegram: { type: "string" },
              shouldHandoff: { type: "boolean" }
            },
            required: ["reply", "language", "stage", "extractedPhone", "extractedTelegram", "shouldHandoff"]
          }
        }
      }
    });

    return JSON.parse(response.output_text) as AiReply;
  }
}

function buildSystemPrompt(config: AppConfig): string {
  return `
你是甲方配置的 AI 话术训练/知识库训练客服。你必须根据甲方样本库、客户历史聊天记录和客户当前语言回复。

目标：
1. 引导客户完成平台开户。
2. 引导客户注册或提供 Telegram 账号。
3. 当客户已提供手机号和 Telegram 账号后，停止继续引导，进入人工接管。

语言规则：
- 必须使用客户最近消息的主要语言回复。
- 可以把甲方中文样本翻译成客户语言，但不能改变链接、金额、承诺、规则、平台名称或业务含义。

安全和业务规则：
- 优先参考 relevantTrainingSamples 中的标准回复。
- 同时参考 knowledgeItems 中启用的 FAQ、话术、规则和禁用表达。
- 同时参考 trainingMaterials，它来自商户上传的聊天记录、文档、文本和图片 OCR 文字。
- 同时参考 customerMemory，它是该客户自己的长期记忆文件，包括历史阶段、已提供资料、最近意图和人工备注。
- type=forbidden 的内容表示不能说或不能做的事，必须遵守。
- type=rule 的内容优先级高于普通样本。
- 不要编造样本中没有的信息。
- 不要要求客户提供密码、验证码、支付信息或证件敏感信息。
- 每次只给客户当前最需要的一步，简短自然，像真人客服。
- 平台注册链接：${config.PLATFORM_REGISTER_URL || "未配置"}
- Telegram 注册说明链接：${config.TG_REGISTER_GUIDE_URL || "未配置"}

输出必须是 JSON，字段为 reply、language、stage、extractedPhone、extractedTelegram、shouldHandoff。
`;
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
    shouldHandoff: false
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
