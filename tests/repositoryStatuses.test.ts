import { describe, expect, it } from "vitest";
import {
  normalizeConversationReviewItemStatus,
  normalizeConversationReviewItemType,
  normalizeConversationReviewStatus,
  normalizeKnowledgeType,
  normalizeReviewSampleStage,
  normalizeScriptFlowStatus,
  normalizeTelegramBindingStatus
} from "../src/repositoryStatuses.js";

describe("repositoryStatuses", () => {
  it("normalizes content and script flow statuses", () => {
    expect(normalizeKnowledgeType("rule")).toBe("rule");
    expect(normalizeKnowledgeType("unknown")).toBe("faq");
    expect(normalizeScriptFlowStatus("active")).toBe("active");
    expect(normalizeScriptFlowStatus("archived")).toBe("draft");
  });

  it("normalizes telegram binding and review statuses", () => {
    expect(normalizeTelegramBindingStatus("bound")).toBe("bound");
    expect(normalizeTelegramBindingStatus("bad")).toBe("unbound");
    expect(normalizeConversationReviewStatus("applied")).toBe("applied");
    expect(normalizeConversationReviewStatus("bad")).toBe("ready");
    expect(normalizeConversationReviewItemType("sample")).toBe("sample");
    expect(normalizeConversationReviewItemType("bad")).toBe("knowledge");
    expect(normalizeConversationReviewItemStatus("ignored")).toBe("ignored");
    expect(normalizeConversationReviewItemStatus("bad")).toBe("candidate");
  });

  it("normalizes suggested sample stages", () => {
    expect(normalizeReviewSampleStage("need_tg_register")).toBe("need_tg_register");
    expect(normalizeReviewSampleStage("other")).toBe("need_platform_register");
  });
});
