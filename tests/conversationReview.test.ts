import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";
import { generateConversationReview } from "../src/services/conversationReview.js";

function config() {
  return loadConfig({ DATABASE_URL: ":memory:" });
}

function setupConversation() {
  const repos = new Repositories(openDb(":memory:"));
  const merchant = repos.createMerchant("复盘商户");
  const conversation = repos.getOrCreateConversation("customer-review", "agent-review", "", merchant.id);
  conversation.extractedPhone = "13800138000";
  conversation.extractedTelegram = "@review";
  repos.updateConversation(conversation);
  repos.insertMessage({
    conversationId: conversation.id,
    direction: "inbound",
    externalId: "in-review-1",
    content: "这个安全吗",
    msgType: "text",
    language: "zh",
    intent: "trust_concern",
    rawPayload: { replyMode: "inbound" }
  });
  repos.insertMessage({
    conversationId: conversation.id,
    direction: "outbound",
    externalId: "out-review-1",
    content: "理解您的顾虑，规则以页面和人工确认为准。",
    msgType: "text",
    language: "zh",
    intent: "unknown",
    rawPayload: { replyMode: "strict_flow", strictFlowStep: "wait_registration" }
  });
  return { repos, conversation };
}

describe("conversation review module", () => {
  it("uses the AiTasks interface to generate and store review candidates", async () => {
    const { repos, conversation } = setupConversation();
    const ai = {
      generateConversationReviewDraft: vi.fn(async () => ({
        score: 88,
        goalCompleted: true,
        summary: "本轮顺利完成资料收集。",
        mainConcerns: ["安全疑虑"],
        mistakes: [],
        goodReplies: ["理解您的顾虑，规则以页面和人工确认为准。"],
        suggestedSamples: [{
          customerMessage: "这个安全吗",
          standardReply: "理解您的顾虑，规则以页面和人工确认为准。",
          intent: "trust_concern",
          stage: "need_platform_register",
          language: "zh",
          keywords: "安全",
          priority: 1
        }],
        suggestedKnowledge: [{
          title: "安全疑虑处理",
          content: "先理解顾虑，再说明规则以页面和人工确认为准。",
          type: "faq",
          language: "zh",
          priority: 1
        }],
        improvementActions: ["继续保持简短回答。"]
      }))
    };

    const result = await generateConversationReview(repos, config(), conversation.id, ai);

    expect(ai.generateConversationReviewDraft).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      agentProfile: expect.objectContaining({ merchantId: conversation.merchantId }),
      messages: expect.arrayContaining([
        expect.objectContaining({ content: "这个安全吗" })
      ])
    }));
    expect(result.review.score).toBe(88);
    expect(result.review.goalCompleted).toBe(true);
    expect(result.items.some((item) => item.itemType === "sample" && item.status === "candidate")).toBe(true);
    expect(result.items.some((item) => item.itemType === "knowledge" && item.status === "candidate")).toBe(true);
  });

  it("falls back locally when the AI review task fails", async () => {
    const { repos, conversation } = setupConversation();
    const ai = {
      generateConversationReviewDraft: vi.fn(async () => {
        throw new Error("provider down");
      })
    };

    const result = await generateConversationReview(repos, config(), conversation.id, ai);

    expect(ai.generateConversationReviewDraft).toHaveBeenCalledOnce();
    expect(result.review.score).toBeGreaterThanOrEqual(0);
    expect(result.review.summary).toContain("完成目标");
    expect(result.items.length).toBeGreaterThan(0);
  });
});
