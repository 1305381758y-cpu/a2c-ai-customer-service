import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { createRepositoryModules, type RepositoryModules } from "../src/repositoryModules.js";

function setupModules(): RepositoryModules {
  let modules: RepositoryModules;
  modules = createRepositoryModules(openDb(":memory:"), {
    refreshCustomerAfterConversationDelete: (merchantId, countryId, customerKey) => {
      modules.customers.refreshAfterConversationDelete(merchantId, countryId, customerKey);
    },
    createTrainingSample: (merchantId, sample, countryId) => modules.trainingContent.createTrainingSample(merchantId, sample, countryId),
    createKnowledgeItem: (merchantId, input) => modules.trainingContent.createKnowledgeItem(merchantId, input),
    defaultCountryId: (merchantId) => modules.settings.defaultCountryId(merchantId),
    validCountryId: (merchantId, countryId) => modules.settings.validCountryId(merchantId, countryId)
  });
  return modules;
}

describe("repository module composer", () => {
  it("wires merchant defaults into dependent repositories", () => {
    const modules = setupModules();
    const merchant = modules.merchants.create("装配测试商户");

    const defaultCountry = modules.settings.ensureDefaultCountry(merchant.id);
    const accounts = modules.a2cAccounts.sync(merchant.id, [{
      apiPhone: "551199991111",
      wabaId: "waba-1",
      status: 1,
      numberStatus: 1,
      qualityRating: 2,
      messagingLimit: 1000,
      verifiedName: "Support BR"
    }]);

    expect(defaultCountry.merchantId).toBe(merchant.id);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.countryId).toBe(defaultCountry.id);
  });

  it("wires review candidate application back into training content", () => {
    const modules = setupModules();
    const merchant = modules.merchants.create("复盘装配商户");
    const country = modules.settings.ensureDefaultCountry(merchant.id);
    const conversation = modules.conversations.getOrCreate("customer-1", "a2c-1", "", merchant.id, country.id);
    const review = modules.reviews.upsert(conversation.id, merchant.id, {
      score: 90,
      goalCompleted: true,
      summary: "完成注册引导。",
      mainConcerns: [],
      mistakes: [],
      goodReplies: [],
      suggestedSamples: [{
        customerMessage: "链接打不开",
        standardReply: "您可以复制到浏览器打开，仍不行就发截图给我。",
        intent: "need_help",
        stage: "wait_registration",
        language: "zh",
        keywords: "复盘候选",
        priority: 1
      }],
      suggestedKnowledge: [],
      improvementActions: []
    });

    const applied = modules.reviews.applyItem(review.items[0]!.id, merchant.id);
    const samples = modules.trainingContent.listTrainingSamples({ merchantId: merchant.id });

    expect(applied?.status).toBe("applied");
    expect(samples).toEqual([
      expect.objectContaining({
        customerMessage: "链接打不开",
        standardReply: "您可以复制到浏览器打开，仍不行就发截图给我。",
        countryId: country.id
      })
    ]);
  });
});
