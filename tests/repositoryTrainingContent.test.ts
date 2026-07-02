import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";
import { TrainingContentRepository } from "../src/repositoryTrainingContent.js";

function setup() {
  const db = openDb(":memory:");
  const repos = new Repositories(db);
  const merchant = repos.createMerchant("训练内容商户");
  const country = repos.createMerchantCountry(merchant.id, {
    name: "巴西",
    code: "BR",
    defaultLanguage: "pt-BR"
  });
  const training = new TrainingContentRepository(db, {
    defaultCountryId: () => country.id,
    validCountryId: (_merchantId, countryId) => (countryId === country.id ? country.id : "")
  });
  return { merchant, country, training };
}

describe("TrainingContentRepository", () => {
  it("keeps sample, knowledge, and material operations behind the training-content module", () => {
    const { merchant, country, training } = setup();

    const sample = training.createTrainingSample(merchant.id, {
      customerMessage: "Como registrar?",
      standardReply: "Abra o link e use o convite.",
      stage: "need_platform_register",
      intent: "ask_platform_register",
      language: "pt-BR",
      keywords: "registro",
      priority: 3,
      enabled: true
    }, country.id);
    expect(training.listTrainingSamples({ merchantId: merchant.id, countryId: country.id })).toEqual([
      expect.objectContaining({
        id: sample.id,
        customerMessage: "Como registrar?",
        countryId: country.id
      })
    ]);

    const knowledge = training.createKnowledgeItem(merchant.id, {
      countryId: country.id,
      title: "注册链接打不开",
      content: "建议复制到浏览器打开",
      type: "faq",
      language: "zh",
      priority: 2
    });
    expect(training.listKnowledgeItems({ merchantId: merchant.id, countryId: country.id })).toEqual([
      expect.objectContaining({
        id: knowledge.id,
        title: "注册链接打不开"
      })
    ]);

    const material = training.createTrainingMaterial({
      merchantId: merchant.id,
      countryId: country.id,
      sourceType: "image",
      filename: "guide.png",
      mimeType: "image/png",
      rawText: "教程图片文字",
      warnings: []
    });
    const item = training.addTrainingMaterialItem({
      materialId: material.id,
      merchantId: merchant.id,
      countryId: country.id,
      kind: "knowledge",
      knowledgeId: knowledge.id,
      title: "教程步骤",
      content: "第一步打开链接",
      language: "zh"
    });
    expect(training.listTrainingMaterialItems(material.id, merchant.id)).toEqual([
      expect.objectContaining({
        id: item.id,
        countryId: country.id,
        content: "第一步打开链接"
      })
    ]);
  });
});
