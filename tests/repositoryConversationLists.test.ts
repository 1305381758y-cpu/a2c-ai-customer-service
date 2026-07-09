import { describe, expect, it } from "vitest";
import { buildConversationListQuery } from "../src/repositoryConversationLists.js";

describe("repository conversation list query builder", () => {
  it("builds list filters in a stable order", () => {
    expect(buildConversationListQuery({
      merchantId: "merchant-1",
      countryId: "country-1",
      status: "active",
      language: "es",
      handoffStatus: "pending",
      a2cAccountPhone: "5917000",
      customerPhone: "customer-1",
      limit: 30
    })).toEqual({
      where: "WHERE c.merchant_id = ? AND c.country_id = ? AND c.status = ? AND c.language = ? AND c.handoff_status = ? AND c.a2c_account_phone = ? AND c.customer_phone = ?",
      params: [
        "merchant-1",
        "country-1",
        "active",
        "es",
        "pending",
        "5917000",
        "customer-1",
        30
      ]
    });
  });

  it("includes conversation created time range filters before the limit", () => {
    expect(buildConversationListQuery({
      merchantId: "merchant-1",
      countryId: "country-1",
      status: "human_handoff",
      handoffStatus: "pending",
      language: "es",
      a2cAccountPhone: "5910000",
      customerPhone: "customer-1",
      startAt: "2026-07-04 00:00:00",
      endAt: "2026-07-04 23:59:59",
      limit: 50
    })).toEqual({
      where: "WHERE c.merchant_id = ? AND c.country_id = ? AND c.status = ? AND c.language = ? AND c.handoff_status = ? AND c.a2c_account_phone = ? AND c.customer_phone = ? AND c.created_at >= ? AND c.created_at <= ?",
      params: [
        "merchant-1",
        "country-1",
        "human_handoff",
        "es",
        "pending",
        "5910000",
        "customer-1",
        "2026-07-04 00:00:00",
        "2026-07-04 23:59:59",
        50
      ]
    });
  });

  it("uses the default list limit without filters", () => {
    expect(buildConversationListQuery()).toEqual({
      where: "",
      params: [100]
    });
  });

  it("clamps list limits to the supported range", () => {
    expect(buildConversationListQuery({ limit: -5 }).params).toEqual([1]);
    expect(buildConversationListQuery({ limit: 99999 }).params).toEqual([50000]);
  });
});
