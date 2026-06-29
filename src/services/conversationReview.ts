import type { AppConfig } from "../config.js";
import { generateAiText } from "../clients/aiProvider.js";
import type { ConversationMessageRecord, ConversationReviewInput, MerchantAgentProfileRecord, Repositories } from "../repositories.js";

export async function generateConversationReview(
  repos: Repositories,
  config: AppConfig,
  conversationId: string
): Promise<ReturnType<Repositories["upsertConversationReview"]>> {
  const conversation = repos.getConversation(conversationId);
  if (!conversation) throw new Error("conversation not found");
  const messages = repos.listConversationMessages(conversationId, 120);
  const agentProfile = repos.getMerchantAgentProfile(conversation.merchantId);
  const generated = await generateWithAiProvider(config, agentProfile, messages).catch(() => fallbackReview(messages, conversation));
  const review = normalizeReview(generated, messages, conversation);
  return repos.upsertConversationReview(conversation.id, conversation.merchantId, review);
}

async function generateWithAiProvider(
  config: AppConfig,
  agentProfile: MerchantAgentProfileRecord,
  messages: ConversationMessageRecord[]
): Promise<ConversationReviewInput> {
  const text = await generateAiText(config, JSON.stringify({
    agentProfile,
    messages: messages.map((message) => ({
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

function fallbackReview(messages: ConversationMessageRecord[], conversation: { extractedPhone: string; extractedTelegram: string }): ConversationReviewInput {
  const outbound = messages.filter((message) => message.direction === "outbound");
  const inbound = messages.filter((message) => message.direction === "inbound");
  const repeated = repeatedOutbound(outbound);
  const concerns = detectConcerns(inbound.map((message) => message.content).join("\n"));
  const goalCompleted = Boolean(conversation.extractedPhone && conversation.extractedTelegram);
  const score = clampScore(65 + (goalCompleted ? 20 : -10) - repeated.length * 8 - Math.max(0, concerns.length - 2) * 2);
  const pairs = collectRecentPairs(messages);
  return {
    score,
    goalCompleted,
    summary: goalCompleted
      ? repeated.length ? "本轮完成目标，但部分节点存在重复回复。" : "本轮完成目标，整体流程推进正常。"
      : repeated.length ? "本轮未完成目标，且部分回复重复，需要优化。" : "本轮未完成目标，需要继续跟进客户疑问。",
    mainConcerns: concerns,
    mistakes: [
      ...repeated.map((reply) => `重复回复：${clip(reply, 80)}`),
      ...detectUnansweredQuestions(messages)
    ].slice(0, 8),
    goodReplies: outbound.map((message) => message.content).filter((text) => text.length >= 10 && text.length <= 220).slice(-3),
    suggestedSamples: pairs.slice(0, 3).map((pair) => ({
      customerMessage: pair.customer,
      standardReply: pair.agent,
      intent: "unknown",
      stage: "auto_review",
      language: "zh",
      keywords: "复盘候选,人工审核",
      priority: 0
    })),
    suggestedKnowledge: concerns.slice(0, 4).map((concern) => ({
      title: `${concern}处理口径`,
      content: defaultKnowledgeForConcern(concern),
      type: "faq",
      language: "zh",
      priority: 0
    })),
    improvementActions: [
      repeated.length ? "减少同一节点的重复话术，按客户问题换一种说法。" : "保持当前自然回答方式。",
      goalCompleted ? "资料齐全后继续保持及时接管。" : "优先补齐客户手机号和 Telegram 用户名。"
    ]
  };
}

function normalizeReview(input: Partial<ConversationReviewInput>, messages: ConversationMessageRecord[], conversation: { extractedPhone: string; extractedTelegram: string }): ConversationReviewInput {
  const fallback = fallbackReview(messages, conversation);
  return {
    score: clampScore(Number(input.score ?? fallback.score)),
    goalCompleted: Boolean(input.goalCompleted ?? fallback.goalCompleted),
    summary: clip(String(input.summary || fallback.summary), 1200),
    mainConcerns: stringArray(input.mainConcerns, fallback.mainConcerns).slice(0, 12),
    mistakes: stringArray(input.mistakes, fallback.mistakes).slice(0, 12),
    goodReplies: stringArray(input.goodReplies, fallback.goodReplies).slice(0, 8),
    suggestedSamples: recordArray(input.suggestedSamples, fallback.suggestedSamples).slice(0, 8),
    suggestedKnowledge: recordArray(input.suggestedKnowledge, fallback.suggestedKnowledge).slice(0, 8),
    improvementActions: stringArray(input.improvementActions, fallback.improvementActions).slice(0, 12)
  };
}

function detectConcerns(text: string): string[] {
  const entries: Array<[string, RegExp]> = [
    ["安全疑虑", /安全|诈骗|骗子|真假|靠谱吗|可靠/],
    ["收益疑问", /收益|赚钱|佣金|这么多|到账/],
    ["费用投资", /充值|付钱|投资|押金|本金|垫付|收费/],
    ["链接打不开", /打不开|无法打开|加载|链接/],
    ["注册操作", /怎么注册|不会注册|教程|步骤|卡住/],
    ["Telegram", /telegram|tg|用户名|@/i]
  ];
  return entries.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

function repeatedOutbound(outbound: ConversationMessageRecord[]): string[] {
  const counts = new Map<string, number>();
  for (const message of outbound) {
    const key = message.content.trim();
    if (!key || key.length < 12) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([text]) => text);
}

function detectUnansweredQuestions(messages: ConversationMessageRecord[]): string[] {
  const results: string[] = [];
  for (let index = 0; index < messages.length - 1; index += 1) {
    const current = messages[index];
    const next = messages[index + 1];
    if (current.direction !== "inbound" || next.direction !== "outbound") continue;
    if (!/[?？吗呢]|怎么|为什么|是否|能不能|可以/.test(current.content)) continue;
    if (/请把|发送给我|注册手机号|Telegram 用户名/.test(next.content) && !/因为|可以|不用|不会|按|打开|设置|收益|安全|规则|页面|人工/.test(next.content)) {
      results.push(`疑问可能未充分回答：${clip(current.content, 80)}`);
    }
  }
  return results;
}

function collectRecentPairs(messages: ConversationMessageRecord[]): Array<{ customer: string; agent: string }> {
  const pairs: Array<{ customer: string; agent: string }> = [];
  for (let index = 0; index < messages.length - 1; index += 1) {
    const current = messages[index];
    const next = messages[index + 1];
    if (current.direction === "inbound" && next.direction === "outbound" && current.content.trim() && next.content.trim()) {
      pairs.push({ customer: clip(current.content, 300), agent: clip(next.content, 600) });
    }
  }
  return pairs.slice(-8).reverse();
}

function defaultKnowledgeForConcern(concern: string): string {
  if (concern === "安全疑虑") return "客户担心安全或诈骗时，先理解顾虑，说明当前不要求私下转账，规则以页面和人工确认为准，再回到当前步骤。";
  if (concern === "收益疑问") return "客户询问收益时，说明收益按实际任务和平台规则核算，不承诺固定金额。";
  if (concern === "费用投资") return "客户询问充值、押金、投资时，说明当前引导阶段不会要求向客服私下付款，具体规则以页面和人工确认为准。";
  if (concern === "链接打不开") return "客户链接打不开时，引导复制到手机浏览器打开；仍失败则让客户发送截图或页面提示。";
  if (concern === "Telegram") return "客户不知道 Telegram 用户名时，引导打开 Telegram 设置，找到或设置 @ 开头用户名后发送。";
  return "客户卡住时，先确认卡在哪一步，再给对应的一步操作指引。";
}

function stripJsonFence(text: string): string {
  return text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function stringArray(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : fallback;
}

function recordArray(value: unknown, fallback: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
    : fallback;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}
