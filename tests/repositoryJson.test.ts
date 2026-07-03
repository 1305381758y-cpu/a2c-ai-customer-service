import { describe, expect, it } from "vitest";
import { buildCustomerMemorySummary, clipText, parseJsonArray, parseJsonObject, parseJsonRecordArray } from "../src/repositoryJson.js";
import type { Conversation } from "../src/repositoryTypes.js";

describe("repositoryJson utilities", () => {
  it("parses objects and falls back to an empty object", () => {
    expect(parseJsonObject('{"replyMode":"strict_flow"}')).toEqual({ replyMode: "strict_flow" });
    expect(parseJsonObject("[]")).toEqual({});
    expect(parseJsonObject("not json")).toEqual({});
  });

  it("parses arrays safely", () => {
    expect(parseJsonArray('["安全","收益",123]')).toEqual(["安全", "收益", "123"]);
    expect(parseJsonArray('{"not":"array"}')).toEqual([]);
    expect(parseJsonRecordArray('[{"text":"ok"}, "skip", ["skip"], {"intent":"ask_link"}]')).toEqual([
      { text: "ok" },
      { intent: "ask_link" }
    ]);
  });

  it("clips long text with ellipsis", () => {
    expect(clipText("abcdef", 4)).toBe("abcd...");
    expect(clipText("abc", 4)).toBe("abc");
  });

  it("builds customer memory summaries with operator notes", () => {
    const conversation: Conversation = {
      id: "conversation-1",
      merchantId: "merchant-1",
      countryId: "merchant-1:bo",
      countryCode: "bo",
      countryName: "玻利维亚",
      customerPhone: "591123456",
      a2cAccountPhone: "a2c-1",
      nickname: "客户",
      language: "es",
      stage: "need_tg_register",
      flowStep: "collect_telegram",
      extractedPhone: "591123456",
      extractedTelegram: "",
      extractedWhatsApp: "",
      status: "active",
      handoffStatus: "pending",
      handoffNotified: 0,
      unreadCount: 0,
      pinnedAt: "",
      updatedAt: ""
    };

    expect(buildCustomerMemorySummary(conversation, "ask_tg_register", "客户需要安卓教程")).toContain("国家: 玻利维亚");
    expect(buildCustomerMemorySummary(conversation, "ask_tg_register", "客户需要安卓教程")).toContain("人工备注: 客户需要安卓教程");
  });
});
