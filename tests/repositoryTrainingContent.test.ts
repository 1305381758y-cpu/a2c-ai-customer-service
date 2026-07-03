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

  it("deletes a material and its generated sample and knowledge records within merchant scope", () => {
    const { merchant, country, training } = setup();
    const other = setup();
    const material = training.createTrainingMaterial({
      merchantId: merchant.id,
      countryId: country.id,
      sourceType: "txt",
      filename: "script.txt",
      mimeType: "text/plain",
      rawText: "话本",
      warnings: []
    });
    const sample = training.createTrainingSample(merchant.id, {
      customerMessage: "怎么注册",
      standardReply: "打开链接",
      stage: "need_platform_register",
      intent: "ask_platform_register",
      language: "zh",
      keywords: "注册",
      priority: 1,
      enabled: true
    }, country.id);
    const knowledge = training.createKnowledgeItem(merchant.id, {
      countryId: country.id,
      title: "注册说明",
      content: "按页面提示填写",
      type: "faq"
    });
    training.addTrainingMaterialItem({
      materialId: material.id,
      merchantId: merchant.id,
      countryId: country.id,
      kind: "sample",
      sampleId: sample.id,
      title: "样本",
      content: "怎么注册 -> 打开链接"
    });
    training.addTrainingMaterialItem({
      materialId: material.id,
      merchantId: merchant.id,
      countryId: country.id,
      kind: "knowledge",
      knowledgeId: knowledge.id,
      title: "知识",
      content: "按页面提示填写"
    });
    const otherMaterial = other.training.createTrainingMaterial({
      merchantId: other.merchant.id,
      countryId: other.country.id,
      sourceType: "txt",
      filename: "other.txt",
      mimeType: "text/plain",
      rawText: "其他素材",
      warnings: []
    });

    expect(training.deleteTrainingMaterial(material.id, merchant.id)).toBe(true);
    expect(training.getTrainingMaterial(material.id, merchant.id)).toBeUndefined();
    expect(training.listTrainingMaterialItems(material.id, merchant.id)).toEqual([]);
    expect(training.listTrainingSamples({ merchantId: merchant.id, countryId: country.id })).toEqual([]);
    expect(training.listKnowledgeItems({ merchantId: merchant.id, countryId: country.id })).toEqual([]);
    expect(other.training.getTrainingMaterial(otherMaterial.id, other.merchant.id)).toEqual(expect.objectContaining({
      id: otherMaterial.id
    }));
    expect(training.deleteTrainingMaterial(material.id, merchant.id)).toBe(false);
  });
});
