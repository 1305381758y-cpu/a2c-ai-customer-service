import type { AppConfig } from "../config.js";
import type { AiTextOptions, AiTextPart } from "./aiProviderTypes.js";
import type { ConversationMessageRecord, ConversationReviewInput, MerchantAgentProfileRecord } from "../repositoryTypes.js";

export interface AiConversationReviewDraftInput {
  agentProfile: MerchantAgentProfileRecord;
  messages: ConversationMessageRecord[];
}

export interface AiConversationReviewRuntime {
  generateText(config: AppConfig, contents: string | AiTextPart[], options?: AiTextOptions): Promise<string>;
}

export async function generateConversationReviewDraftWithAi(
  config: AppConfig,
  input: AiConversationReviewDraftInput,
  runtime: AiConversationReviewRuntime
): Promise<ConversationReviewInput> {
  const text = await runtime.generateText(config, JSON.stringify({
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
    systemInstruction: conversationReviewSystemInstruction
  });
  return JSON.parse(stripJsonFence(text)) as ConversationReviewInput;
}

export const conversationReviewSystemInstruction = `
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
`;

function stripJsonFence(text: string): string {
  return text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}
