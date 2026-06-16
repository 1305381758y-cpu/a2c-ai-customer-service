import { GoogleGenAI, Type, type Part, type Schema } from "@google/genai";
import type { AppConfig } from "../config.js";
import type { A2CInviteCodeRecord, Conversation, CustomerMemoryRecord, KnowledgeItemRecord, MerchantCountryRecord, TrainingMaterialItemRecord, VectorSearchHit } from "../repositories.js";
import type { TrainingSampleForSearch } from "../domain/sampleRetrieval.js";

export interface ReplyInput {
  customerText: string;
  conversation: Conversation;
  history: Array<{ direction: string; content: string; intent: string; createdAt: string }>;
  samples: TrainingSampleForSearch[];
  knowledge: KnowledgeItemRecord[];
  trainingMaterials?: TrainingMaterialItemRecord[];
  memory?: CustomerMemoryRecord;
  retrievedContext?: VectorSearchHit[];
  country?: MerchantCountryRecord;
  inviteCode?: A2CInviteCodeRecord;
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
export const DEFAULT_GEMINI_EMBEDDING_MODEL = "gemini-embedding-2";

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
          retrievedContext: input.retrievedContext ?? [],
          country: input.country ?? null,
          assignedInviteCode: input.inviteCode ? {
            code: input.inviteCode.code,
            registerUrl: inviteRegisterUrl(input.inviteCode, fallbackRegisterUrl(input, this.config)),
            displayText: inviteDisplayText(input.inviteCode, input.conversation.language, fallbackRegisterUrl(input, this.config)),
            status: input.inviteCode.status
          } : null
        }),
        config: {
          abortSignal: timeoutSignal(),
          httpOptions: { timeout: GEMINI_TIMEOUT_MS },
          systemInstruction: buildSystemPrompt(this.config),
          responseMimeType: "application/json",
          responseSchema: replySchema,
          temperature: 0.45,
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

export async function generateGeminiEmbedding(
  config: GeminiConfig,
  text: string,
  model = DEFAULT_GEMINI_EMBEDDING_MODEL
): Promise<{ embedding: number[]; model: string }> {
  const apiKey = geminiApiKey(config);
  if (!apiKey) throw new Error("Google AI Studio Key 未配置");
  const client = new GoogleGenAI({ apiKey });
  const safeText = text.length > 12_000 ? text.slice(0, 12_000) : text;
  try {
    const response = await client.models.embedContent({
      model,
      contents: safeText,
      config: { taskType: "RETRIEVAL_DOCUMENT" }
    });
    const embedding = (response.embeddings?.[0]?.values ?? [])
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item));
    if (!embedding.length) throw new Error("Gemini embedding 返回为空");
    return { embedding, model };
  } catch (error) {
    if (model !== "gemini-embedding-001") return generateGeminiEmbedding(config, text, "gemini-embedding-001");
    throw error;
  }
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
你是甲方配置的平台客服。你必须根据甲方样本库、客户历史聊天记录和客户当前语言回复。

目标：
1. 引导客户完成平台开户。
2. 根据当前国家配置，引导客户提供所需联系方式：手机号、Telegram 或 WhatsApp。
3. 当客户满足当前国家 completion targets 后，停止继续引导，进入人工接管。

语言规则：
- 必须使用客户最近消息的主要语言回复。
- 可以把甲方中文样本翻译成客户语言，但不能改变链接、金额、承诺、规则、平台名称或业务含义。

安全和业务规则：
- 面向客户的 reply 里，任何情况下都不能暴露自己是 AI、机器人、模型、自动客服或自动回复。
- 如果客户问“你是真人吗 / 你是机器人吗 / 是 AI 吗”，不能正面承认自动化身份，只能用客服口吻回复，例如“您好，我是平台客服，会继续协助您完成注册流程。”
- 优先参考 relevantTrainingSamples 中的标准回复。
- 同时参考 knowledgeItems 中启用的 FAQ、话术、规则和禁用表达。
- 同时参考 trainingMaterials，它来自商户上传的聊天记录、文档、文本和图片 OCR 文字。
- 同时参考 customerMemory，它是该客户自己的长期记忆文件，包括历史阶段、已提供资料、最近意图和人工备注。
- 同时参考 retrievedContext，它是系统语义检索出的真实历史对话、优秀样本和知识库内容；只当作内部参考，禁止向客户说“我引用了历史记录/知识库/语义搜索”。
- 同时参考 country，它是当前 A2C 客服账号绑定的国家配置；不同国家的链接、语言、目标可能不同。
- 只收集 country 当前要求的联系方式。country.requireWhatsApp=false 时，禁止要求客户提供 WhatsApp，因为客户本身通常已经通过 WhatsApp 联系我们。
- country.requireTelegram=true 且客户说没有 Telegram 时，必须引导客户注册/下载 Telegram，然后发送 @ 开头的 Telegram 用户名；不能改为要求 WhatsApp。
- country.requireTelegram=false 时，禁止要求 Telegram。
- 如果 assignedInviteCode 存在，开户注册引导必须同时包含它的 registerUrl 和邀请码 code；如果 registerUrl 已经包含邀请码，也仍要清楚表达这是专属开户链接。
- 开户开户链接和邀请码是开户注册必需信息，不能漏掉其中任何一个，不能自己编造邀请码。
- 如果客户追问邀请码、质疑是否需要邀请码，必须直接回答：注册需要邀请码，并给出 assignedInviteCode；禁止说“不需要邀请码”。
- 如果没有 assignedInviteCode，不能说“不需要邀请码”，只能说明“我这边正在确认专属邀请码，请稍等”。
- 不要连续重复同一句开户链接话术；客户追问时先回答问题，再轻轻推进下一步。
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
  const expectedLanguage = input.conversation.language && input.conversation.language !== "unknown" ? input.conversation.language : "";
  const policyReply = enforceContactPolicy(value.reply.trim(), input, config);
  const reply = sanitizeCustomerVisibleReply(ensureInviteInReply(policyReply, input, config), expectedLanguage || input.conversation.language);
  return {
    reply,
    language: expectedLanguage || (typeof value.language === "string" && value.language ? value.language : input.conversation.language),
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
  const baseReply = fallbackByCustomerText(input, config) || sample?.standardReply || defaultReply(language, config, input.inviteCode);
  const reply = sanitizeCustomerVisibleReply(ensureInviteInReply(baseReply, input, config), language);
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

function defaultReply(language: string, config: AppConfig, inviteCode?: A2CInviteCodeRecord): string {
  const registration = inviteCode ? inviteDisplayText(inviteCode, language, config.PLATFORM_REGISTER_URL) : config.PLATFORM_REGISTER_URL;
  const link = registration ? ` ${registration}` : "";
  if (language === "en") return `Please complete the platform registration first, then send us your phone number and Telegram account.${link}`;
  if (language === "ms") return `Sila lengkapkan pendaftaran platform dahulu, kemudian hantar nombor telefon dan akaun Telegram anda.${link}`;
  if (language === "id") return `Silakan selesaikan pendaftaran platform terlebih dahulu, lalu kirim nomor telepon dan akun Telegram Anda.${link}`;
  if (language === "th") return `กรุณาสมัครบัญชีแพลตฟอร์มให้เสร็จก่อน จากนั้นส่งเบอร์โทรและบัญชี Telegram ของคุณมาให้เรา${link}`;
  if (language === "vi") return `Vui lòng hoàn tất đăng ký tài khoản nền tảng trước, sau đó gửi số điện thoại và tài khoản Telegram của bạn.${link}`;
  if (language === "pt-BR") return `Conclua primeiro o cadastro na plataforma. Depois, envie seu número de telefone e sua conta do Telegram.${link}`;
  if (language === "ja") return `まずプラットフォーム登録を完了してください。完了後、電話番号とTelegramアカウントを送ってください。${link}`;
  return `请先完成平台开户，完成后把您的手机号和 Telegram 账号发给我。${link}`;
}

function inviteRegisterUrl(inviteCode: A2CInviteCodeRecord, fallbackUrl = ""): string {
  const template = inviteCode.registerUrl || fallbackUrl;
  if (!template) return inviteCode.code;
  return template.includes("{code}") ? template.replaceAll("{code}", encodeURIComponent(inviteCode.code)) : template;
}

function inviteDisplayText(inviteCode: A2CInviteCodeRecord, language: string, fallbackUrl = ""): string {
  const template = inviteCode.registerUrl || fallbackUrl;
  const url = inviteRegisterUrl(inviteCode, fallbackUrl);
  if (template.includes("{code}")) return url;
  if (language === "en") return `${url} Invitation code: ${inviteCode.code}`;
  if (language === "pt-BR") return `${url} Código de convite: ${inviteCode.code}`;
  if (language === "ja") return `${url} 招待コード：${inviteCode.code}`;
  if (language === "th") return `${url} รหัสเชิญ: ${inviteCode.code}`;
  if (language === "vi") return `${url} Mã mời: ${inviteCode.code}`;
  if (language === "ms" || language === "id") return `${url} Kode undangan: ${inviteCode.code}`;
  return `${url} 邀请码：${inviteCode.code}`;
}

function ensureInviteInReply(reply: string, input: ReplyInput, config: AppConfig): string {
  if (!input.country?.requirePlatformAccount) return reply;
  if (!input.inviteCode) return sanitizeNoInviteReply(reply, input.conversation.language, config);
  const fallbackUrl = fallbackRegisterUrl(input, config);
  const display = inviteDisplayText(input.inviteCode, input.conversation.language, fallbackUrl);
  const hasCode = reply.includes(input.inviteCode.code);
  const registerUrl = inviteRegisterUrl(input.inviteCode, fallbackUrl);
  const hasUrl = registerUrl ? reply.includes(registerUrl) || Boolean(input.inviteCode.registerUrl && reply.includes(input.inviteCode.registerUrl)) || Boolean(fallbackUrl && reply.includes(fallbackUrl)) : true;
  if (hasCode && hasUrl) return reply;
  const separator = /[。.!?！？]\s*$/.test(reply) ? "\n" : "\n";
  if (input.conversation.language === "en") return `${reply}${separator}Registration link and invitation code: ${display}`;
  if (input.conversation.language === "pt-BR") return `${reply}${separator}Link de cadastro e código de convite: ${display}`;
  if (input.conversation.language === "ja") return `${reply}${separator}登録リンクと招待コード：${display}`;
  return `${reply}${separator}开户链接和邀请码：${display || config.PLATFORM_REGISTER_URL}`;
}

function fallbackByCustomerText(input: ReplyInput, config: AppConfig): string {
  const language = input.conversation.language === "unknown" ? "zh" : input.conversation.language;
  if (/(邀请码|invite code|invitation code|código|codigo|招待コード)/i.test(input.customerText)) {
    if (input.inviteCode) {
      const display = inviteDisplayText(input.inviteCode, language, fallbackRegisterUrl(input, config));
      if (language === "en") return `Yes, registration requires an invitation code. Please use this registration link and invitation code: ${display}`;
      if (language === "pt-BR") return `Sim, o cadastro precisa de código de convite. Use este link de cadastro e código: ${display}`;
      if (language === "ja") return `はい、登録には招待コードが必要です。こちらの登録リンクと招待コードを使ってください：${display}`;
      return `需要邀请码才能注册。请使用这个开户链接和邀请码：${display}`;
    }
    return missingInviteReply(language, config);
  }
  if (/(今天|几号|日期|what date|what day|today|data de hoje)/i.test(input.customerText)) {
    if (language === "en") return "Today is June 13, 2026. I can continue helping you with the registration after this.";
    if (language === "pt-BR") return "Hoje é 13 de junho de 2026. Depois disso, posso continuar ajudando você com o cadastro.";
    return "今天是 2026年6月13日。您这边如果继续注册，我可以接着协助。";
  }
  return "";
}

function enforceContactPolicy(reply: string, input: ReplyInput, config: AppConfig): string {
  const country = input.country;
  if (!country) return reply;
  const language = input.conversation.language === "unknown" ? country.defaultLanguage || "zh" : input.conversation.language;
  if (country.requireTelegram && !input.conversation.extractedTelegram && customerSaysNoTelegram(input)) {
    return telegramGuideReply(language, config, country);
  }
  let normalized = reply;
  if (!country.requireWhatsApp) {
    normalized = removeForbiddenContactAsk(normalized, /WhatsApp|Whatsapp|\bWS\b|\bWA\b|WPP|whats app/i);
  }
  if (!country.requireTelegram) {
    normalized = removeForbiddenContactAsk(normalized, /Telegram|\bTG\b|电报|飞机|เทเลแกรม/i);
  }
  if (!normalized.trim()) return defaultReply(language, config, input.inviteCode);
  return normalized.trim();
}

function customerSaysNoTelegram(input: ReplyInput): boolean {
  const text = input.customerText.trim();
  const recentBotAskedTelegram = input.history
    .slice(-4)
    .some((item) => item.direction === "outbound" && /Telegram|\bTG\b|电报|飞机|@用户名|username/i.test(item.content));
  if (/(没有|沒有|不会|不想|没有tg|没有 telegram|no telegram|don't have telegram|dont have telegram|sem telegram|não tenho telegram|nao tenho telegram)/i.test(text)) {
    return /Telegram|\bTG\b|电报|飞机/i.test(text) || recentBotAskedTelegram || text.length <= 12;
  }
  return false;
}

function telegramGuideReply(language: string, config: AppConfig, country?: MerchantCountryRecord): string {
  const guide = country?.tgRegisterGuideUrl || config.TG_REGISTER_GUIDE_URL;
  const suffix = guide ? ` ${guide}` : "";
  if (language === "en") return `No problem. Please register or download Telegram first, then send us your Telegram username starting with @.${suffix}`;
  if (language === "pt-BR") return `Sem problema. Cadastre ou baixe o Telegram primeiro e depois envie seu nome de usuário do Telegram começando com @.${suffix}`;
  if (language === "ja") return `大丈夫です。先にTelegramを登録またはダウンロードしてから、@で始まるユーザー名を送ってください。${suffix}`;
  if (language === "th") return `ไม่เป็นไร กรุณาสมัครหรือดาวน์โหลด Telegram ก่อน จากนั้นส่งชื่อผู้ใช้ Telegram ที่ขึ้นต้นด้วย @ มาให้เรา${suffix}`;
  if (language === "vi") return `Không sao. Vui lòng đăng ký hoặc tải Telegram trước, rồi gửi tên người dùng Telegram bắt đầu bằng @ cho chúng tôi.${suffix}`;
  if (language === "ms" || language === "id") return `Tidak apa-apa. Sila daftar atau muat turun Telegram dahulu, kemudian hantar username Telegram yang bermula dengan @ kepada kami.${suffix}`;
  return `没关系，请先注册或下载 Telegram，然后把 @ 开头的 Telegram 用户名发给我们。${suffix}`;
}

function removeForbiddenContactAsk(reply: string, contactPattern: RegExp): string {
  return reply
    .split(/(?<=[。.!?！？])\s+|\n+/)
    .filter((sentence) => !(contactPattern.test(sentence) && /(提供|发送|发给|send|provide|hantar|envie|enviar|送って|ส่ง)/i.test(sentence)))
    .join("\n");
}

function fallbackRegisterUrl(input: ReplyInput, config: AppConfig): string {
  return input.country?.platformRegisterUrl || config.PLATFORM_REGISTER_URL || "";
}

function sanitizeNoInviteReply(reply: string, language: string, config: AppConfig): string {
  if (/(不需要邀请码|无需邀请码|不需要.*邀请码|no invite|no invitation code|does not need.*invite)/i.test(reply)) {
    return missingInviteReply(language, config);
  }
  return reply;
}

function missingInviteReply(language: string, config: AppConfig): string {
  const suffix = config.PLATFORM_REGISTER_URL ? ` ${config.PLATFORM_REGISTER_URL}` : "";
  if (language === "en") return `Registration requires an invitation code. I am confirming your dedicated invitation code now. Please wait a moment.${suffix}`;
  if (language === "pt-BR") return `O cadastro precisa de código de convite. Estou confirmando seu código exclusivo agora. Aguarde um momento.${suffix}`;
  if (language === "ja") return `登録には招待コードが必要です。専用の招待コードを確認していますので、少々お待ちください。${suffix}`;
  return `注册需要邀请码。我这边正在确认您的专属邀请码，请稍等。${suffix}`;
}

function sanitizeCustomerVisibleReply(reply: string, language: string): string {
  const normalized = reply
    .replace(/作为(?:一个)?(?:AI|人工智能|机器人|自?动客服|自?动回复)[，,：:\s]*/gi, "")
    .replace(/\b(as an?|i am an?|i'm an?)\s+(ai|artificial intelligence|bot|robot|automated assistant|automated reply)\b[:,\s]*/gi, "")
    .replace(/\b(sou|como)\s+(uma?\s+)?(ia|intelig[eê]ncia artificial|rob[oô]|bot)\b[:,\s]*/gi, "")
    .trim();
  const sentences = normalized
    .split(/(?<=[。.!?！？])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => !containsIdentityDisclosure(sentence));
  const cleaned = sentences.join(language === "zh" || /[\u4E00-\u9FFF]/.test(normalized) ? "\n" : " ").trim();
  return cleaned || platformServiceReply(language);
}

function containsIdentityDisclosure(value: string): boolean {
  return /(我是|我只是|这里是|本客服是|客服是).{0,10}(AI|人工智能|机器人|自?动客服|自?动回复|智能客服)|(?:AI|人工智能|机器人|自?动客服|自?动回复).{0,8}(客服|助手|回复|系统)|\b(i am|i'm|this is|we are).{0,20}\b(ai|artificial intelligence|bot|robot|automated assistant|automated reply)\b|\b(ai|bot|robot|automated assistant)\b.{0,12}\b(customer service|support|reply)\b|(?:sou|somos|este atendimento é).{0,20}(ia|intelig[eê]ncia artificial|rob[oô]|bot)/i.test(value);
}

function platformServiceReply(language: string): string {
  if (language === "en") return "Hello, I am platform support and will continue helping you with the registration process.";
  if (language === "pt-BR") return "Olá, sou do atendimento da plataforma e vou continuar ajudando você com o cadastro.";
  if (language === "ja") return "こんにちは。プラットフォームのサポートとして、登録手続きを引き続きお手伝いします。";
  if (language === "th") return "สวัสดีค่ะ ฝ่ายบริการของแพลตฟอร์มจะช่วยคุณดำเนินการสมัครต่อไป";
  if (language === "vi") return "Xin chào, bộ phận hỗ trợ nền tảng sẽ tiếp tục giúp bạn hoàn tất đăng ký.";
  if (language === "ms" || language === "id") return "Halo, layanan pelanggan platform akan terus membantu Anda menyelesaikan pendaftaran.";
  return "您好，我是平台客服，会继续协助您完成注册流程。";
}
