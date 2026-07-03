import type { AppConfig } from "../config.js";
import type { A2CInviteCodeRecord, MerchantAgentProfileRecord, MerchantCountryRecord } from "../repositories.js";
import { agentProfileBlock, safeAgentProfile } from "./aiAgentProfilePrompt.js";
import type { AiTextOptions, AiTextPart } from "./aiProviderTypes.js";
import type { AiReply, ReplyInput } from "./aiReplyTypes.js";

export interface AiConversationReplyRuntime {
  generateText(config: AppConfig, contents: string | AiTextPart[], options: AiTextOptions): Promise<string>;
}

export async function generateConversationReply(
  config: AppConfig,
  input: ReplyInput,
  runtime: AiConversationReplyRuntime
): Promise<AiReply> {
  try {
    const text = await runtime.generateText(config, JSON.stringify({
      customerText: input.customerText,
      conversation: input.conversation,
      recentHistory: input.history,
      relevantTrainingSamples: input.samples,
      knowledgeItems: input.knowledge,
      trainingMaterials: input.trainingMaterials ?? [],
      customerMemory: input.memory ?? null,
      country: input.country ?? null,
      agentProfile: safeAgentProfile(input.agentProfile),
      assignedInviteCode: input.inviteCode ? {
        code: input.inviteCode.code,
        registerUrl: input.inviteCode.registerUrl,
        status: input.inviteCode.status
      } : null
    }), {
      temperature: 0.45,
      maxOutputTokens: 900,
      taskType: "conversation_reply",
      systemInstruction: buildReplySystemPrompt(input.agentProfile)
    });
    return normalizeAiReply(JSON.parse(stripJsonFence(text)) as Partial<AiReply>, input, config);
  } catch (error) {
    const fallback = fallbackReply(input, config);
    fallback.fallback = true;
    fallback.error = error instanceof Error ? error.message : "AI 回复失败";
    return fallback;
  }
}

export function normalizeAiReply(value: Partial<AiReply>, input: ReplyInput, config: AppConfig): AiReply {
  if (!value || typeof value.reply !== "string" || !value.reply.trim()) return fallbackReply(input, config);
  const expectedLanguage = input.conversation.language && input.conversation.language !== "unknown" ? input.conversation.language : "";
  const policyReply = enforceContactPolicy(value.reply.trim(), input, config);
  const sanitizedReply = sanitizeCustomerVisibleReply(ensureInviteInReply(policyReply, input, config), expectedLanguage || input.conversation.language);
  const reply = isMechanicalTemplateReply(sanitizedReply)
    ? sanitizeCustomerVisibleReply(ensureInviteInReply(contextualFallbackReply(input, config) || defaultReply(input, config), input, config), expectedLanguage || input.conversation.language)
    : sanitizedReply;
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

export function fallbackReply(input: ReplyInput, config: AppConfig): AiReply {
  const language = input.conversation.language === "unknown" ? "zh" : input.conversation.language;
  const sample = input.samples.find((item) => item.standardReply && !isMechanicalTemplateReply(item.standardReply));
  const safeSampleReply = sample?.standardReply && !containsNoInviteClaim(sample.standardReply)
    ? sample.standardReply
    : "";
  const baseReply = contextualFallbackReply(input, config) || safeSampleReply || defaultReply(input, config);
  const reply = sanitizeCustomerVisibleReply(ensureInviteInReply(enforceContactPolicy(baseReply, input, config), input, config), language);
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

export function sanitizeCustomerVisibleReply(text: string, language = "zh"): string {
  const normalized = sanitizeRegionalChatAppComparisons(text)
    .replace(/作为(?:一个)?(?:AI|人工智能|机器人|自?动客服|自?动回复)[，,：:\s]*/gi, "")
    .replace(/\b(as an?|i am an?|i'm an?)\s+(ai|artificial intelligence|bot|robot|automated assistant|automated reply)\b[:,\s]*/gi, "")
    .replace(/\b(sou|como)\s+(uma?\s+)?(ia|intelig[eê]ncia artificial|rob[oô]|bot)\b[:,\s]*/gi, "")
    .replace(/\b(AI|robot|bot|model)\b/gi, "")
    .trim();
  const sentences = normalized
    .split(/(?<=[。.!?！？])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => !containsIdentityDisclosure(sentence));
  const cleaned = sentences.join(language === "zh" || /[\u4E00-\u9FFF]/.test(normalized) ? "\n" : " ").trim();
  return cleaned || platformServiceReply(language);
}

function defaultReply(input: ReplyInput, config: AppConfig): string {
  const language = input.conversation.language === "unknown" ? "zh" : input.conversation.language;
  const registration = input.inviteCode ? inviteDisplayText(input.inviteCode, language, fallbackRegisterUrl(input, config)) : fallbackRegisterUrl(input, config);
  const link = registration ? ` ${registration}` : "";
  if (language === "en") return `Please complete the platform registration first, then send us your phone number and Telegram account.${link}`;
  if (language === "es") return `Primero complete el registro en la plataforma y luego envíeme su número de teléfono y su cuenta de Telegram.${link}`;
  if (language === "pt-BR") return `Conclua primeiro o cadastro na plataforma. Depois, envie seu número de telefone e sua conta do Telegram.${link}`;
  return `请先完成平台开户，完成后把您的手机号和 Telegram 账号发给我。${link}`;
}

function contextualFallbackReply(input: ReplyInput, config: AppConfig): string {
  const language = input.conversation.language === "unknown" ? "zh" : input.conversation.language;
  const text = input.customerText.trim();
  if (isMechanicalComplaint(text)) return naturalComplaintReply(language);
  if (asksAboutServiceIdentity(text)) return naturalServiceIntroReply(language);
  if (isJobIntent(text)) return naturalJobIntentReply(language);
  if (isGreetingOnly(text) && hasRecentOutbound(input)) return naturalGreetingReply(language, input);
  if (/(邀请码|invite code|invitation code|código|codigo|招待コード)/i.test(text)) {
    if (input.inviteCode) {
      const display = inviteDisplayText(input.inviteCode, language, fallbackRegisterUrl(input, config));
      if (language === "en") return `Yes, registration requires an invitation code. Please use this registration link and invitation code: ${display}`;
      if (language === "es") return `Sí, el registro necesita un código de invitación. Use este enlace de registro y este código: ${display}`;
      if (language === "pt-BR") return `Sim, o cadastro precisa de código de convite. Use este link de cadastro e código: ${display}`;
      return `需要邀请码才能注册。请使用这个开户链接和邀请码：${display}`;
    }
    return missingInviteReply(language, input, config);
  }
  if (/(发我链接|注册链接|开户链接|注册入口|link please|register link|registration link)/i.test(text) && input.inviteCode) {
    const display = inviteDisplayText(input.inviteCode, language, fallbackRegisterUrl(input, config));
    if (language === "en") return `Please use this registration link and invitation code: ${display}`;
    if (language === "es") return `Use este enlace de registro y este código de invitación: ${display}`;
    if (language === "pt-BR") return `Use este link de cadastro e código de convite: ${display}`;
    return `请使用这个开户链接和邀请码：${display}`;
  }
  return "";
}

function ensureInviteInReply(reply: string, input: ReplyInput, config: AppConfig): string {
  if (!input.country?.requirePlatformAccount) return reply;
  if (!input.inviteCode) return containsNoInviteClaim(reply) ? missingInviteReply(input.conversation.language, input, config) : reply;
  const fallbackUrl = fallbackRegisterUrl(input, config);
  const display = inviteDisplayText(input.inviteCode, input.conversation.language, fallbackUrl);
  const registerUrl = inviteRegisterUrl(input.inviteCode, fallbackUrl);
  const hasCode = reply.includes(input.inviteCode.code);
  const hasUrl = registerUrl ? reply.includes(registerUrl) || Boolean(input.inviteCode.registerUrl && reply.includes(input.inviteCode.registerUrl)) || Boolean(fallbackUrl && reply.includes(fallbackUrl)) : true;
  if (hasCode && hasUrl) return reply;
  if (!/(注册链接|开户链接|register|cadastro|link|邀请码|invite|convite)/i.test(input.customerText + "\n" + reply)) return reply;
  const language = input.conversation.language === "unknown" ? "zh" : input.conversation.language;
  if (language === "en") return `${reply}\nRegistration link and invitation code: ${display}`;
  if (language === "es") return `${reply}\nEnlace de registro y código de invitación: ${display}`;
  if (language === "pt-BR") return `${reply}\nLink de cadastro e código de convite: ${display}`;
  return `${reply}\n开户链接和邀请码：${display}`;
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
  if (language === "es") return `${url} Código de invitación: ${inviteCode.code}`;
  if (language === "pt-BR") return `${url} Código de convite: ${inviteCode.code}`;
  return `${url} 邀请码：${inviteCode.code}`;
}

function fallbackRegisterUrl(input: ReplyInput, config: AppConfig): string {
  return input.country?.platformRegisterUrl || config.PLATFORM_REGISTER_URL || "";
}

function missingInviteReply(language: string, input: ReplyInput, config: AppConfig): string {
  const suffix = fallbackRegisterUrl(input, config) ? ` ${fallbackRegisterUrl(input, config)}` : "";
  if (language === "en") return `Registration requires an invitation code. I am confirming your dedicated invitation code now. Please wait a moment.${suffix}`;
  if (language === "es") return `El registro necesita un código de invitación. Estoy confirmando su código exclusivo ahora. Espere un momento.${suffix}`;
  if (language === "pt-BR") return `O cadastro precisa de código de convite. Estou confirmando seu código exclusivo agora. Aguarde um momento.${suffix}`;
  return `注册需要邀请码。我这边正在确认您的专属邀请码，请稍等。${suffix}`;
}

function containsNoInviteClaim(reply: string): boolean {
  return /(不需要邀请码|无需邀请码|不需要.*邀请码|no invite|no invitation code|does not need.*invite)/i.test(reply);
}

function isMechanicalTemplateReply(reply: string): boolean {
  const text = reply.replace(/\s+/g, " ").trim();
  if (!text) return false;
  return /(我是平台客服|平台客服，会继续协助您完成注册流程|想了解如何开户(?:注册)?|协助您完成注册、排查问题、确认手机号|请问您现在想先处理哪一步|Não entendi sua mensagem|Nao entendi sua mensagem|Pode escrever sua dúvida em uma frase curta|Posso ajudar com cadastro, link, telefone, Telegram|I can help with registration, link, phone, Telegram|Please write your question in one short sentence)/i.test(text);
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
  if (!normalized.trim()) return defaultReply(input, config);
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
  if (language === "es") return `No hay problema. Primero registre o descargue Telegram, luego envíenos su nombre de usuario de Telegram que empieza con @.${suffix}`;
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

function sanitizeRegionalChatAppComparisons(text: string): string {
  return text
    .replace(/(?:就)?像\s*(?:微信|WeChat)\s*一样[，,、\s]*/gi, "")
    .replace(/(?:和|跟|与)?\s*(?:微信|WeChat)\s*(?:差不多|类似|一样)[，,、\s]*/gi, "")
    .replace(/(?:类似|像)\s*(?:微信|WeChat)[，,、\s]*/gi, "")
    .replace(/(?:微信|WeChat)/gi, "聊天工具")
    .replace(/Telegram\s*[,，]?\s*是个聊天工具/gi, "Telegram 是个聊天工具")
    .replace(/Telegram\s*[,，]?\s*是一个聊天工具/gi, "Telegram 是个聊天工具")
    .trim();
}

function containsIdentityDisclosure(value: string): boolean {
  return /(我是|我只是|这里是|本客服是|客服是|我这边).{0,10}(AI|人工智能|机器人|自?动客服|自?动回复|智能客服)|(?:AI|人工智能|机器人|自?动客服|自?动回复).{0,8}(客服|助手|回复|系统)|\b(i am|i'm|this is|we are).{0,20}\b(ai|artificial intelligence|bot|robot|automated assistant|automated reply)\b|\b(ai|bot|robot|automated assistant)\b.{0,12}\b(customer service|support|reply)\b|(?:sou|somos|este atendimento é).{0,20}(ia|intelig[eê]ncia artificial|rob[oô]|bot)/i.test(value);
}

function platformServiceReply(language: string): string {
  if (language === "en") return "I am here. Tell me where you are stuck, and I will help you with the next step.";
  if (language === "es") return "Estoy aquí. Dígame en qué paso se quedó y le ayudo a continuar.";
  if (language === "pt-BR") return "Estou aqui. Me diga em qual etapa você parou e eu ajudo você a continuar.";
  if (language === "ja") return "こちらで対応します。どの手順で止まっているか教えてください。";
  if (language === "th") return "ฉันอยู่ตรงนี้ แจ้งได้เลยว่าติดขั้นตอนไหน แล้วจะช่วยต่อให้";
  if (language === "vi") return "Tôi vẫn ở đây. Bạn đang vướng ở bước nào thì gửi tôi biết, tôi sẽ hỗ trợ tiếp.";
  if (language === "ms" || language === "id") return "Saya masih di sini. Beri tahu Anda tersangkut di langkah mana, saya akan bantu lanjutkan.";
  return "我在的。您现在卡在哪一步，直接告诉我，我继续帮您处理。";
}

function isMechanicalComplaint(text: string): boolean {
  return /(机械|僵硬|重复|只会|一句话|听不懂|不是|不对|不用|不需要|别发|烦|打扰|robotic|repeat|same thing|not this|wrong|não é|nao e|mecânico|mecanico|repetindo)/i.test(text);
}

function asksAboutServiceIdentity(text: string): boolean {
  return /(介绍一下自己|你是谁|你是做什么|什么平台|who are you|what are you|introduce yourself|quem é você|quem e voce|o que você faz|o que voce faz)/i.test(text);
}

function isGreetingOnly(text: string): boolean {
  return /^(你好|您好|在吗|在不在|hi|hello|hey|good morning|good afternoon|good evening|ol[aá]|oi|bom dia|boa tarde|boa noite|こんにちは|こんばんは)\s*[。.!?？！]*$/i.test(text);
}

function isJobIntent(text: string): boolean {
  return /(找工作|找一份工作|兼职|线上工作|在线工作|工作机会|赚钱|收入|job|work|part[-\s]?time|online work|extra income|emprego|trabalho|renda extra|vaga)/i.test(text);
}

function hasRecentOutbound(input: ReplyInput): boolean {
  return input.history.slice(-6).some((item) => item.direction === "outbound" && item.content.trim());
}

function naturalComplaintReply(language: string): string {
  if (language === "en") return "Sorry, I did not understand you well just now. You can tell me directly whether you want to register, check Telegram, or verify your phone number, and I will handle that step.";
  if (language === "pt-BR") return "Desculpe, não entendi bem agora. Você pode me dizer direto se quer se cadastrar, resolver o Telegram ou confirmar o telefone, e eu sigo por essa etapa.";
  if (language === "ja") return "すみません、先ほどはうまく理解できていませんでした。登録、Telegram、電話番号確認のどれを進めたいか教えてください。";
  return "抱歉，刚才没有理解准确。您可以直接告诉我：是想注册、处理 Telegram，还是核对手机号？我按您当前这一步来处理。";
}

function naturalServiceIntroReply(language: string): string {
  if (language === "en") return "I mainly help you complete the platform registration and contact verification. If you want to continue, I can guide you step by step.";
  if (language === "pt-BR") return "Eu ajudo principalmente com o cadastro na plataforma e a verificação do contato. Se quiser continuar, posso orientar você passo a passo.";
  if (language === "ja") return "主にプラットフォーム登録と連絡先確認をお手伝いします。続ける場合は、順番に案内します。";
  return "我这边主要协助您完成开户注册和联系方式核对。您如果要继续，我可以按步骤带您处理。";
}

function naturalJobIntentReply(language: string): string {
  if (language === "en") return "Yes, I can help you understand this online work opportunity. If you are interested, I will guide you step by step, starting with the registration.";
  if (language === "pt-BR") return "Sim, posso explicar esta oportunidade de trabalho online. Se você tiver interesse, eu oriento passo a passo, começando pelo cadastro.";
  if (language === "ja") return "はい、このオンラインの仕事について案内できます。興味があれば、登録から順番にサポートします。";
  return "可以的，我先帮您了解这份线上工作。如果您有兴趣，我会从注册开始一步一步带您处理。";
}

function naturalGreetingReply(language: string, input: ReplyInput): string {
  if (input.country?.requireTelegram && input.conversation.extractedPhone && !input.conversation.extractedTelegram) {
    if (language === "en") return "I am here. Please send me your Telegram username starting with @ when it is ready.";
    if (language === "pt-BR") return "Estou aqui. Quando estiver pronto, envie seu nome de usuário do Telegram começando com @.";
    return "我在的。您准备好后，把 @ 开头的 Telegram 用户名发给我就可以。";
  }
  if (language === "en") return "I am here. Do you want to continue with the registration, or did you run into a problem?";
  if (language === "pt-BR") return "Estou aqui. Você quer continuar o cadastro ou encontrou algum problema?";
  if (language === "ja") return "対応しています。登録を続けますか、それとも問題がありましたか？";
  return "我在的。您是想继续注册，还是刚才哪一步遇到问题了？";
}

function buildReplySystemPrompt(agentProfile?: MerchantAgentProfileRecord): string {
  return `
你是甲方配置的真人客服口吻助手。你必须根据甲方上传的对话资料、话本、客户历史聊天记录和客户当前语言回复。
${agentProfileBlock(agentProfile)}
目标：
1. 引导客户完成平台开户。
2. 根据当前国家配置，引导客户提供手机号、Telegram 或 WhatsApp。
3. 当客户满足当前国家目标后，停止继续引导，进入人工接管。
规则：
- 面向客户的 reply 里，任何情况下都不能暴露自己是 AI、机器人、模型、自动客服或自动回复。
- 必须使用客户最近消息的主要语言回复。
- 优先参考 relevantTrainingSamples、knowledgeItems、trainingMaterials、customerMemory、country。
- 只收集 country 当前要求的联系方式。
- 如果 assignedInviteCode 存在，开户注册引导必须同时包含 registerUrl 和邀请码 code。
- 不要要求客户提供密码、验证码、支付信息或证件敏感信息。
- 每次只给客户当前最需要的一步，简短自然，像真人客服。
输出必须是 JSON，字段为 reply、language、stage、extractedPhone、extractedTelegram、extractedWhatsApp、shouldHandoff。
`;
}

function stripJsonFence(text: string): string {
  return text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}
