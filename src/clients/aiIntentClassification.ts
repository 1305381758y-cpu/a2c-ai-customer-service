import type { AppConfig } from "../config.js";
import { isInternalIntentLabel, type InternalIntentLabel } from "../domain/analyzer.js";
import type { AiTextOptions } from "./aiProviderTypes.js";

export interface AiIntentClassificationInput {
  customerText: string;
  language: string;
  flowStep: string;
  recentHistory: Array<{ direction: string; content: string; intent: string; createdAt: string }>;
}

export interface AiIntentClassificationRuntime {
  generateText(config: AppConfig, contents: string, options: AiTextOptions): Promise<string>;
}

export async function classifyAiIntent(
  config: AppConfig,
  input: AiIntentClassificationInput,
  runtime: AiIntentClassificationRuntime
): Promise<InternalIntentLabel> {
  try {
    const text = await runtime.generateText(config, JSON.stringify({
      customerText: input.customerText,
      language: input.language,
      flowStep: input.flowStep,
      recentHistory: input.recentHistory.slice(-6).map((item) => ({
        direction: item.direction,
        content: item.content,
        intent: item.intent
      }))
    }), {
      temperature: 0,
      maxOutputTokens: 80,
      taskType: "intent_classification",
      systemInstruction: `
你只负责把客户当前消息归类为一个固定标签，不要解释，不要输出 JSON。
可选标签只有：
positive_confirmation, negative_refusal, need_help, ask_platform_register, ask_link, ask_tg_register, platform_register_done, payment_concern, investment_concern, trust_concern, earning_concern, workflow_question, job_question, complaint, chat, sensitive_request, unknown

判断规则：
- 客户表示“是、可以、继续、好的、同意、愿意、yes、ok、sim、claro”等，输出 positive_confirmation。
- 客户明确拒绝、不要、不感兴趣、停止，输出 negative_refusal。
- 客户说不会、帮我、怎么弄、需要协助，输出 need_help。
- 客户询问开户链接、邀请码、入口、URL，输出 ask_link。
- 客户询问注册、开户、平台是什么、在哪里注册，输出 ask_platform_register。
- 客户询问 Telegram/TG 下载、注册、账号，输出 ask_tg_register。
- 客户表示已经注册完成，输出 platform_register_done。
- 客户问是否需要付钱、收费、转账、充值，输出 payment_concern。
- 客户问投资、本金、押金、垫付、先付，输出 investment_concern。
- 客户质疑诈骗、骗子、安全、真假、可靠，输出 trust_concern。
- 客户质疑收入、收益、佣金、多久到账，输出 earning_concern。
- 客户问下一步、怎么做、需要什么资料、怎么操作，输出 workflow_question。
- 客户问工作是什么、具体做什么、兼职内容，输出 job_question。
- 客户抱怨你没回答、重复、机械、听不懂，输出 complaint。
- 客户想闲聊、问能不能聊天或你是谁，输出 chat。
- 客户要求处理验证码、密码、支付、证件等敏感资料，输出 sensitive_request。
- 无法判断才输出 unknown。
`
    });
    return normalizeInternalIntentLabel(text);
  } catch {
    return "unknown";
  }
}

export function normalizeInternalIntentLabel(text: string): InternalIntentLabel {
  const label = text.trim().replace(/[`"'。.!?！？\s]/g, "");
  return isInternalIntentLabel(label) ? label : "unknown";
}
