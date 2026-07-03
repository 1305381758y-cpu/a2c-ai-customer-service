import { describe, expect, it } from "vitest";
import { buildConversationExportQuery } from "../src/repositoryConversationExports.js";

describe("repository conversation export query builder", () => {
  it("builds export filters in a stable order", () => {
    expect(buildConversationExportQuery({
      merchantId: "merchant-1",
      countryId: "country-1",
      status: "active",
      handoffStatus: "pending",
      language: "es",
      a2cAccountPhone: "5511000",
      customerPhone: "5917000",
      direction: "inbound",
      startAt: "2026-07-01T00:00:00.000Z",
      endAt: "2026-07-02T00:00:00.000Z",
      limit: 25
    })).toEqual({
      where: "WHERE c.merchant_id = ? AND c.country_id = ? AND c.status = ? AND c.handoff_status = ? AND c.language = ? AND c.a2c_account_phone = ? AND c.customer_phone = ? AND m.direction = ? AND m.created_at >= ? AND m.created_at <= ?",
      params: [
        "merchant-1",
        "country-1",
        "active",
        "pending",
        "es",
        "5511000",
        "5917000",
        "inbound",
        "2026-07-01T00:00:00.000Z",
        "2026-07-02T00:00:00.000Z",
        25
      ]
    });
  });

  it("uses no WHERE clause and the default limit when no filters are present", () => {
    expect(buildConversationExportQuery()).toEqual({
      where: "",
      params: [5000]
    });
  });

  it("clamps export limits to the supported range", () => {
    expect(buildConversationExportQuery({ limit: 0 }).params).toEqual([1]);
    expect(buildConversationExportQuery({ limit: 100000 }).params).toEqual([50000]);
  });
});
