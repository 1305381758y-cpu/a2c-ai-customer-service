import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { conversationReviewSystemInstruction, generateConversationReviewDraftWithAi } from "../src/clients/aiConversationReviewTask.js";
import type { ConversationMessageRecord, MerchantAgentProfileRecord } from "../src/repositoryTypes.js";

function agentProfile(): MerchantAgentProfileRecord {
  return {
    merchantId: "merchant-1",
    agentName: "接待专员",
    roleDefinition: "拥有10年开户注册接待经验",
    toneStyle: "自然简短",
    coreGoal: "引导开户注册并收集手机号和 Telegram",
    mustFollow: "不暴露身份",
    forbidden: "不承诺固定收益",
    uncertaintyPolicy: "以页面和人工确认为准",
    handoffPolicy: "资料齐全后转人工",
    enabled: true,
    createdAt: "2026-07-02T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z"
  };
}

function message(overrides: Partial<ConversationMessageRecord>): ConversationMessageRecord {
  return {
    id: 1,
    direction: "inbound",
    content: "这个安全吗",
    msgType: "text",
    language: "zh",
    intent: "trust_concern",
    rawPayload: {},
    createdAt: "2026-07-02T00:00:00.000Z",
    ...overrides
  };
}

describe("AI conversation review task", () => {
  it("builds the review payload and parses fenced JSON from the provider", async () => {
    const generateText = vi.fn(async () => `\`\`\`json
{
  "score": 91,
  "goalCompleted": true,
  "summary": "本轮完成目标。",
  "mainConcerns": ["安全疑虑"],
  "mistakes": [],
  "goodReplies": ["规则以页面和人工确认为准。"],
  "suggestedSamples": [],
  "suggestedKnowledge": [],
  "improvementActions": ["保持简短回答。"]
}
\`\`\``);

    const result = await generateConversationReviewDraftWithAi(loadConfig({ MINIMAX_API_KEY: "sk-test" }), {
      agentProfile: agentProfile(),
      messages: [
        message({ direction: "inbound", content: "这个安全吗", rawPayload: { replyMode: "inbound" } }),
        message({
          id: 2,
          direction: "outbound",
          content: "规则以页面和人工确认为准。",
          rawPayload: {
            replyMode: "strict_flow",
            strictFlowStep: "wait_registration",
            strictQuestionType: "trust_concern"
          }
        })
      ]
    }, { generateText });

    expect(result.score).toBe(91);
    expect(result.mainConcerns).toEqual(["安全疑虑"]);
    expect(generateText).toHaveBeenCalledWith(expect.any(Object), expect.any(String), {
      temperature: 0.15,
      taskType: "conversation_review",
      systemInstruction: conversationReviewSystemInstruction
    });

    const firstCall = (generateText.mock.calls as unknown as Array<[unknown, string, unknown]>)[0];
    const parsedPayload = JSON.parse(firstCall[1]);
    expect(parsedPayload.messages[1].rawPayload).toEqual({
      replyMode: "strict_flow",
      flowStep: "wait_registration",
      questionType: "trust_concern"
    });
  });
});
