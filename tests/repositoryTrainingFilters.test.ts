import { describe, expect, it } from "vitest";
import {
  buildKnowledgeItemWhere,
  buildTrainingMaterialWhere,
  buildTrainingSampleWhere,
  clampTrainingLimit
} from "../src/repositoryTrainingFilters.js";

describe("repositoryTrainingFilters", () => {
  it("builds training sample filters in stable parameter order", () => {
    expect(buildTrainingSampleWhere({
      merchantId: "m1",
      countryId: "m1:bo",
      language: "es",
      intent: "need_help",
      stage: "wait_registration",
      enabled: false
    })).toEqual({
      where: "WHERE merchant_id = ? AND country_id = ? AND language = ? AND intent = ? AND stage = ? AND enabled = ?",
      params: ["m1", "m1:bo", "es", "need_help", "wait_registration", 0]
    });
  });

  it("builds knowledge and material filters with aliases where needed", () => {
    expect(buildKnowledgeItemWhere({ merchantId: "m1", type: "faq", enabled: true })).toEqual({
      where: "WHERE merchant_id = ? AND type = ? AND enabled = ?",
      params: ["m1", "faq", 1]
    });

    expect(buildTrainingMaterialWhere({ merchantId: "m1", countryId: "m1:bo", sourceType: "image", status: "ready" })).toEqual({
      where: "WHERE tm.merchant_id = ? AND tm.country_id = ? AND tm.source_type = ? AND tm.status = ?",
      params: ["m1", "m1:bo", "image", "ready"]
    });
  });

  it("clamps list limits", () => {
    expect(clampTrainingLimit(undefined, 100, 500)).toBe(100);
    expect(clampTrainingLimit(0, 100, 500)).toBe(1);
    expect(clampTrainingLimit(800, 100, 500)).toBe(500);
  });
});
