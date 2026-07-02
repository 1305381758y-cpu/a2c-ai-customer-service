import type { AppConfig } from "../config.js";
import { isContextualIntentLabel, type ContextualIntentLabel } from "../domain/analyzer.js";
import type { AiTextOptions } from "./aiProviderTypes.js";

export interface AiContextualIntentClassificationInput {
  customerText: string;
  language: string;
  flowStep: string;
  previousAssistantMessage: string;
  recentHistory: Array<{ direction: string; content: string; intent: string; createdAt: string }>;
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

export interface AiContextualIntentRuntime {
  generateJson<T>(config: AppConfig, contents: string, options: AiTextOptions): Promise<T>;
}

const fallbackContextualIntent: AiContextualIntentResult = {
  intent: "unknown",
  answeredPreviousQuestion: false,
  isQuestion: false,
  shouldPause: false,
  questionType: "none",
  nextAction: "",
  reason: ""
};

export async function classifyAiContextualIntent(
  config: AppConfig,
  input: AiContextualIntentClassificationInput,
  runtime: AiContextualIntentRuntime
): Promise<AiContextualIntentResult> {
  try {
    const parsed = await runtime.generateJson<Partial<AiContextualIntentResult> & { intent?: string }>(config, JSON.stringify({
      customerText: input.customerText,
      language: input.language,
      flowStep: input.flowStep,
      previousAssistantMessage: input.previousAssistantMessage,
      knownPhone: input.knownPhone,
      knownTelegram: input.knownTelegram,
      recentHistory: input.recentHistory.slice(-10).map((item) => ({
        direction: item.direction,
        content: item.content,
        intent: item.intent
      }))
    }), {
      temperature: 0,
      maxOutputTokens: 260,
      systemInstruction: `
你只做开户注册流程的上下文意图分类，不能生成客服回复，不能决定跳流程。
必须只输出 JSON，不要 Markdown，不要解释。

JSON 字段：
{
  "intent": "固定标签",
  "answeredPreviousQuestion": boolean,
  "isQuestion": boolean,
  "shouldPause": boolean,
  "questionType": "none|telegram|payment|investment|trust|earning|workflow|job|complaint|chat|sensitive|unknown",
  "nextAction": "一句内部动作描述",
  "reason": "极短原因"
}

intent 只能是：
phone_submission, incomplete_phone, telegram_submission, positive_confirmation, acknowledgement, negative_refusal, not_available, not_registered, no_telegram, telegram_installed, telegram_username_help, need_help, ask_platform_register, ask_link, ask_tg_register, platform_register_done, payment_concern, investment_concern, trust_concern, earning_concern, workflow_question, registration_field_question, job_question, complaint, chat, sensitive_request, unknown_question, unknown

判断重点：
- 资料提交优先：手机号是 phone_submission，@用户名是 telegram_submission。
- 短句必须结合 previousAssistantMessage 和 flowStep。比如上一句问 Telegram，客户说“我没有”就是 no_telegram；上一句问是否有空，客户说“我没有”就是 not_available；上一句问是否完成注册，客户说“我没有”就是 not_registered。
- telegram_download 阶段的“装好了/下载好了/安装好了”是 telegram_installed，不是平台开户完成。
- 客户问“@ 在哪里/怎么找用户名/怎么设置用户名/没有 @/找不到 username”是 telegram_username_help，questionType=telegram。
- collect_telegram 阶段的“ok/好的/明白了”多半是 acknowledgement，表示客户明白了但还没提交资料。
- 客户问“为什么/TG 是什么/怎么下载”属于 ask_tg_register 或 workflow_question，questionType=telegram。
- 客户问费用、投资、本金、押金、诈骗、安全、收益时分别分类，不要归 unknown。
- 客户明确说不想继续、别发了、不要了才是 negative_refusal。
`
    });
    return normalizeContextualIntentResult(parsed);
  } catch {
    return { ...fallbackContextualIntent };
  }
}

export function normalizeContextualIntentResult(parsed: Partial<AiContextualIntentResult> & { intent?: string }): AiContextualIntentResult {
  const intent = parsed.intent && isContextualIntentLabel(parsed.intent) ? parsed.intent : "unknown";
  return {
    intent,
    answeredPreviousQuestion: Boolean(parsed.answeredPreviousQuestion),
    isQuestion: Boolean(parsed.isQuestion),
    shouldPause: Boolean(parsed.shouldPause),
    questionType: typeof parsed.questionType === "string" ? parsed.questionType : "none",
    nextAction: typeof parsed.nextAction === "string" ? parsed.nextAction.slice(0, 120) : "",
    reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 120) : ""
  };
}
