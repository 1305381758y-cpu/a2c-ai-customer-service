import { describe, expect, it } from "vitest";
import { mapConversationReview, mapConversationReviewItem } from "../src/repositoryReviewMappers.js";

describe("repositoryReviewMappers", () => {
  it("maps conversation reviews with parsed arrays and status fallback", () => {
    expect(mapConversationReview({
      id: 21,
      merchant_id: "m1",
      conversation_id: "c1",
      score: 82,
      goal_completed: 1,
      summary: "完成目标",
      main_concerns_json: "[\"收益\", 123]",
      mistakes_json: "[\"重复催促\"]",
      good_replies_json: "[\"解释自然\"]",
      suggested_samples_json: "[{\"customerMessage\":\"链接打不开\"}, \"skip\"]",
      suggested_knowledge_json: "[{\"title\":\"TG用户名\"}]",
      improvement_actions_json: "[\"补充教程\"]",
      status: "bad"
    })).toEqual({
      id: 21,
      merchantId: "m1",
      conversationId: "c1",
      score: 82,
      goalCompleted: true,
      summary: "完成目标",
      mainConcerns: ["收益", "123"],
      mistakes: ["重复催促"],
      goodReplies: ["解释自然"],
      suggestedSamples: [{ customerMessage: "链接打不开" }],
      suggestedKnowledge: [{ title: "TG用户名" }],
      improvementActions: ["补充教程"],
      status: "ready",
      createdAt: "",
      updatedAt: ""
    });
  });

  it("maps conversation review items with normalized type and status", () => {
    expect(mapConversationReviewItem({
      id: 9,
      review_id: 21,
      merchant_id: "m1",
      conversation_id: "c1",
      item_type: "sample",
      title: "注册链接问题",
      content: "{\"answer\":\"换浏览器\"}",
      status: "applied",
      applied_target_type: "training_sample",
      applied_target_id: "77"
    })).toEqual({
      id: 9,
      reviewId: 21,
      merchantId: "m1",
      conversationId: "c1",
      itemType: "sample",
      title: "注册链接问题",
      content: "{\"answer\":\"换浏览器\"}",
      status: "applied",
      appliedTargetType: "training_sample",
      appliedTargetId: "77",
      createdAt: "",
      updatedAt: ""
    });

    expect(mapConversationReviewItem({ item_type: "bad", status: "bad" })).toMatchObject({
      itemType: "knowledge",
      status: "candidate"
    });
  });
});
