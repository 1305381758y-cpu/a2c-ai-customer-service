import { describe, expect, it, vi } from "vitest";

import {
  intentLearningBase,
  intentLearningRowsUrl,
  loadIntentLearningEvents,
  patchIntentLearningEvent
} from "../frontend/src/intent-learning/intentLearningApi.js";

const event = {
  id: 9,
  merchantId: "merchant-1",
  countryId: "country-1",
  conversationId: "conversation-1",
  messageId: 17,
  candidateKey: "trust_concern:骗子",
  suggestedIntent: "trust_concern",
  displayName: "信任疑虑",
  description: "客户担心真实性",
  customerText: "你不会是骗子吧",
  language: "zh",
  detectedIntent: "unknown",
  inferredIntent: "trust_concern",
  contextualIntent: "trust_concern",
  flowStep: "wait_registration",
  status: "candidate",
  occurrenceCount: 3,
  examples: [],
  lastSeenAt: "2026-07-03T10:00:00Z",
  createdAt: "2026-07-03T10:00:00Z",
  updatedAt: "2026-07-03T10:00:00Z"
};

describe("intent learning API helpers", () => {
  it("builds scoped bases and list routes", () => {
    expect(intentLearningBase(false)).toBe("/api/merchant/intent-learning");
    expect(intentLearningBase(true)).toBe("/api/admin/intent-learning");

    expect(intentLearningRowsUrl(false, {
      merchantId: "merchant-1",
      countryId: "country-1",
      status: "candidate",
      suggestedIntent: "trust_concern",
      limit: "50"
    })).toBe("/api/merchant/intent-learning?countryId=country-1&status=candidate&suggestedIntent=trust_concern&limit=50");

    expect(intentLearningRowsUrl(true, {
      merchantId: "merchant-1",
      countryId: "country-1",
      status: "promoted",
      suggestedIntent: "",
      limit: "100"
    })).toBe("/api/admin/intent-learning?merchantId=merchant-1&countryId=country-1&status=promoted&limit=100");
  });

  it("loads intent learning rows", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      rows: [event]
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(loadIntentLearningEvents("/api/merchant/intent-learning?status=candidate")).resolves.toEqual([event]);

    expect(fetcher).toHaveBeenCalledWith("/api/merchant/intent-learning?status=candidate", expect.objectContaining({
      headers: {}
    }));
    fetcher.mockRestore();
  });

  it("patches intent learning events through the scoped route", async () => {
    const saved = { ...event, status: "reviewed", displayName: "安全疑虑" };
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(saved), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(patchIntentLearningEvent("/api/admin/intent-learning", 9, {
      status: "reviewed",
      displayName: "安全疑虑"
    })).resolves.toEqual(saved);

    expect(fetcher).toHaveBeenCalledWith("/api/admin/intent-learning/9", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ status: "reviewed", displayName: "安全疑虑" }),
      headers: { "Content-Type": "application/json" }
    }));
    fetcher.mockRestore();
  });
});
