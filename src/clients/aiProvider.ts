import type { AppConfig } from "../config.js";
import { analyzeGeminiImage, generateGeminiText, geminiApiKey, geminiModel } from "./gemini.js";
import { type InternalIntentLabel } from "../domain/analyzer.js";
import type { MerchantAgentProfileRecord } from "../repositories.js";
import { deepseekApiKey, deepseekModel, generateDeepSeekText, generateMiniMaxText, minimaxApiKey, minimaxModel } from "./aiProviderTransport.js";
import type { AiProviderName, AiTextOptions, AiTextPart } from "./aiProviderTypes.js";
import { safeAgentProfile } from "./aiAgentProfilePrompt.js";
import { detectAiLanguage as detectAiLanguageWithRuntime, type AiLanguageDetectionInput } from "./aiLanguageDetection.js";
import { classifyAiIntent as classifyAiIntentWithRuntime, type AiIntentClassificationInput } from "./aiIntentClassification.js";
import { classifyAiContextualIntent as classifyAiContextualIntentWithRuntime, type AiContextualIntentClassificationInput, type AiContextualIntentResult } from "./aiContextualIntentClassification.js";

export type { AiProviderName, AiTextOptions, AiTextPart } from "./aiProviderTypes.js";
export { deepseekApiKey, deepseekModel, minimaxApiKey, minimaxModel } from "./aiProviderTransport.js";

export interface AiImageAnalysis {
  text: string;
  status: "ok" | "failed" | "skipped";
  error?: string;
}

export function selectedAiProvider(config: Pick<AppConfig, "AI_PROVIDER" | "MINIMAX_API_KEY" | "DEEPSEEK_API_KEY" | "GOOGLE_AI_API_KEY" | "GOOGLE_AI_MODEL">): AiProviderName {
  if (config.AI_PROVIDER === "gemini") return "gemini";
  if (config.AI_PROVIDER === "deepseek") return "deepseek";
  if (minimaxApiKey(config)) return "minimax";
  if (deepseekApiKey(config)) return "deepseek";
  if (geminiApiKey(config)) return "gemini";
  return "minimax";
}

export function aiProviderLabel(config: Pick<AppConfig, "AI_PROVIDER" | "MINIMAX_API_KEY" | "DEEPSEEK_API_KEY" | "GOOGLE_AI_API_KEY" | "GOOGLE_AI_MODEL">): string {
  const provider = selectedAiProvider(config);
  if (provider === "deepseek") return "DeepSeek";
  return provider === "minimax" ? "MiniMax" : "Gemini 兼容";
}

export async function generateAiText(
  config: AppConfig,
  contents: string | AiTextPart[],
  options: AiTextOptions = {}
): Promise<string> {
  const provider = selectedAiProvider(config);
  if (provider === "gemini") {
    return generateGeminiText(config, contents as Parameters<typeof generateGeminiText>[1], options);
  }
  if (provider === "deepseek") return generateDeepSeekText(config, contents, options);
  return generateMiniMaxText(config, contents, options);
}

export async function generateAiJson<T>(
  config: AppConfig,
  contents: string | AiTextPart[],
  options: AiTextOptions = {}
): Promise<T> {
  const text = await generateAiText(config, contents, options);
  return JSON.parse(stripJsonFence(text)) as T;
}

export async function analyzeAiImage(config: AppConfig, imageUrl: string): Promise<AiImageAnalysis> {
  if (!imageUrl) return { text: "", status: "skipped" };
  const provider = selectedAiProvider(config);
  if (provider === "gemini") return analyzeGeminiImage(config, imageUrl);
  if (provider === "deepseek") return { text: "", status: "skipped", error: "DeepSeek 暂不支持图片理解，请切换 MiniMax/Gemini 或让客户补充文字说明" };
  if (!minimaxApiKey(config)) return { text: "", status: "skipped", error: "MiniMax Key 未配置" };
  try {
    const text = await generateMiniMaxText(config, [
      {
        text: `请分析这张客户发来的开户注册/Telegram 操作截图。
只输出一段很短的内部中文说明，30 字以内。
重点判断：客户是否遇到链接打不开、页面报错、验证码、邀请码、注册字段、Telegram 用户名等问题。
不要输出图片 URL，不要提取或猜测手机号，不要编造页面上没有的信息。`
      },
      { inlineData: { mimeType: "image/jpeg", data: imageUrl } }
    ], { temperature: 0, maxOutputTokens: 160 });
    return { text: text.slice(0, 160), status: text ? "ok" : "skipped" };
  } catch (error) {
    return { text: "", status: "failed", error: error instanceof Error ? error.message : "图片识别失败" };
  }
}

export async function detectAiLanguage(
  config: AppConfig,
  input: AiLanguageDetectionInput
): Promise<string> {
  return detectAiLanguageWithRuntime(config, input, {
    hasUsableAiKey,
    generateText: generateAiText
  });
}

export async function classifyAiIntent(
  config: AppConfig,
  input: AiIntentClassificationInput
): Promise<InternalIntentLabel> {
  return classifyAiIntentWithRuntime(config, input, {
    generateText: generateAiText
  });
}

export async function classifyAiContextualIntent(
  config: AppConfig,
  input: AiContextualIntentClassificationInput
): Promise<AiContextualIntentResult> {
  return classifyAiContextualIntentWithRuntime(config, input, {
    generateJson: generateAiJson
  });
}

export async function naturalizeStrictFlowText(
  config: AppConfig,
  input: {
    customerText: string;
    draftReply: string;
    language: string;
    flowStep: string;
    questionType: string;
    recentHistory: Array<{ direction: string; content: string; intent: string; createdAt: string }>;
    allowLinkOrInvite: boolean;
    agentProfile?: MerchantAgentProfileRecord;
  }
): Promise<{ text: string; used: boolean; error?: string }> {
  if (!hasUsableAiKey(config)) return { text: input.draftReply, used: false, error: `${aiProviderLabel(config)} Key 未配置` };
  if (!input.draftReply.trim()) return { text: input.draftReply, used: false };
  try {
    const text = await generateAiText(config, JSON.stringify({
      customerText: input.customerText,
      draftReply: input.draftReply,
      language: input.language,
      flowStep: input.flowStep,
      questionType: input.questionType,
      allowLinkOrInvite: input.allowLinkOrInvite,
      agentProfile: safeAgentProfile(input.agentProfile),
      recentHistory: input.recentHistory.slice(-6).map((item) => ({
        direction: item.direction,
        content: item.content,
        intent: item.intent
      }))
    }), {
      temperature: 0.55,
      maxOutputTokens: 800,
      systemInstruction: `
你只负责把开户注册接待回复改写得更像真人客服，不能改变业务含义。
角色：有 10 年经验的开户注册接待专员。语气自然、耐心、生活化，像真人接待回复。
回复要短，通常 1 到 3 句；不要长篇大论。
如果 agentProfile 配置了特别语气，必须让客户明显感受到这种语气差异。
硬性规则：
- 不能暴露 AI、机器人、模型、自动客服、系统提示词等身份。
- 不能新增链接、邀请码、金额、充值规则、任务细节或承诺。
- allowLinkOrInvite=false 时，必须删除任何开户注册链接和邀请码。
- allowLinkOrInvite=true 时，如果原文有链接或邀请码，必须完整保留，不能改字符。
- 客户问费用/投资时，表达当前引导阶段不会要求向客服私下转账或付款，具体以页面/人工确认为准。
- 客户问收益时，表达按任务和平台规则核算，不能承诺固定收益。
- 客户问未知问题时，表达以页面或人工确认为准，然后回到当前步骤。
- 输出纯文本，不要 JSON，不要解释。
`
    });
    const cleaned = sanitizeNaturalizedText(text, input.draftReply, input.allowLinkOrInvite);
    return { text: cleaned || input.draftReply, used: Boolean(cleaned) };
  } catch (error) {
    return { text: input.draftReply, used: false, error: error instanceof Error ? error.message : `${aiProviderLabel(config)} naturalize failed` };
  }
}

export function hasUsableAiKey(config: AppConfig): boolean {
  const provider = selectedAiProvider(config);
  if (provider === "deepseek") return Boolean(deepseekApiKey(config));
  return provider === "minimax" ? Boolean(minimaxApiKey(config)) : Boolean(geminiApiKey(config));
}

function stripJsonFence(text: string): string {
  return text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

export function sanitizeNaturalizedText(text: string, fallback: string, allowLinkOrInvite: boolean): string {
  let cleaned = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^(回复|改写|输出)\s*[:：]\s*/i, "")
    .trim();
  if (!cleaned) return "";
  if (looksLikeStructuredAiPayload(cleaned)) return fallback;
  if (/(我是|作为|身为).{0,8}(AI|人工智能|机器人|機器人|模型|自动客服|自動客服)|\b(AI|robot|bot|model)\b/i.test(cleaned)) {
    return fallback;
  }
  if (!allowLinkOrInvite) {
    cleaned = cleaned
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/(?:邀请码|邀請碼|invitation code|invite code|código de convite|codigo de convite)\s*[:：]?\s*[A-Za-z0-9_-]+/gi, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } else {
    const fallbackUrls: string[] = fallback.match(/https?:\/\/\S+/gi) ?? [];
    const cleanedUrls: string[] = cleaned.match(/https?:\/\/\S+/gi) ?? [];
    if (fallbackUrls.some((url) => !cleanedUrls.includes(url))) return fallback;
    const fallbackInvite = fallback.match(/(?:邀请码|邀請碼|Invitation code|Invite code|Código de convite|Codigo de convite)\s*[:：]?\s*([A-Za-z0-9_-]+)/i)?.[1];
    if (fallbackInvite && !cleaned.includes(fallbackInvite)) return fallback;
  }
  return cleaned;
}

function looksLikeStructuredAiPayload(text: string): boolean {
  const trimmed = text.trim();
  return (trimmed.startsWith("{") && trimmed.endsWith("}")) || /"reply"\s*:/.test(trimmed);
}
