import { describe, expect, it } from "vitest";
import { mapKnowledgeItem, mapTrainingMaterial, mapTrainingMaterialItem } from "../src/repositoryTrainingMappers.js";

describe("repositoryTrainingMappers", () => {
  it("maps knowledge items with country and type defaults", () => {
    expect(mapKnowledgeItem({
      id: 9,
      merchant_id: "m1",
      type: "not-valid",
      title: "开户链接",
      content: "按页面填写",
      enabled: 0
    })).toEqual({
      id: 9,
      merchantId: "m1",
      countryId: "m1:default",
      type: "faq",
      title: "开户链接",
      content: "按页面填写",
      language: "zh",
      priority: 0,
      enabled: false
    });
  });

  it("maps training materials with warnings and joined country fields", () => {
    expect(mapTrainingMaterial({
      id: 12,
      merchant_id: "m1",
      country_id: "m1:bo",
      country_code: "BO",
      country_name: "玻利维亚",
      source_type: "image",
      filename: "教程.png",
      warnings_json: "[\"OCR失败\", 12]",
      item_count: 3,
      sample_count: 1,
      knowledge_count: 2
    })).toMatchObject({
      id: 12,
      merchantId: "m1",
      countryId: "m1:bo",
      countryCode: "BO",
      countryName: "玻利维亚",
      sourceType: "image",
      filename: "教程.png",
      status: "enabled",
      warnings: ["OCR失败", "12"],
      itemCount: 3,
      sampleCount: 1,
      knowledgeCount: 2
    });
  });

  it("maps training material items and preserves null target ids", () => {
    expect(mapTrainingMaterialItem({
      id: 33,
      material_id: 12,
      merchant_id: "m1",
      kind: "sample",
      sample_id: null,
      knowledge_id: 7,
      title: "链接打不开",
      content: "换浏览器打开",
      enabled: 0
    })).toEqual({
      id: 33,
      materialId: 12,
      merchantId: "m1",
      countryId: "m1:default",
      kind: "sample",
      sampleId: null,
      knowledgeId: 7,
      title: "链接打不开",
      content: "换浏览器打开",
      intent: "unknown",
      stage: "",
      language: "zh",
      enabled: false
    });
  });
});
