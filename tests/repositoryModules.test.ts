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

  it("replaces stale A2C accounts when a merchant syncs new remote credentials", () => {
    const modules = setupModules();
    const merchant = modules.merchants.create("A2C替换测试商户");
    modules.settings.ensureDefaultCountry(merchant.id);
    const oldAccounts = modules.a2cAccounts.sync(merchant.id, [
      { apiPhone: "old-a2c-1", verifiedName: "旧客服一" },
      { apiPhone: "old-a2c-2", verifiedName: "旧客服二" }
    ]);

    modules.a2cAccounts.createInviteCode(oldAccounts[0]!.id, { code: "OLD1" }, merchant.id);

    const newAccounts = modules.a2cAccounts.sync(merchant.id, [
      { apiPhone: "new-a2c-1", verifiedName: "新客服一" }
    ]);
    const savedAccounts = modules.a2cAccounts.list({ merchantId: merchant.id });
    const config = modules.settings.getConfig(merchant.id);

    expect(newAccounts.map((account) => account.apiPhone)).toEqual(["new-a2c-1"]);
    expect(savedAccounts.map((account) => account.apiPhone)).toEqual(["new-a2c-1"]);
    expect(config.a2cAccountPhone).toBe("new-a2c-1");
    expect(modules.a2cAccounts.listInviteCodes(oldAccounts[0]!.id, merchant.id)).toEqual([]);
  });

  it("reserves the current A2C account invite code even when other accounts exceed the query window", () => {
    const modules = setupModules();
    const merchant = modules.merchants.create("大邀请码池测试商户");
    const country = modules.settings.ensureDefaultCountry(merchant.id);
    const accounts = modules.a2cAccounts.sync(merchant.id, [
      { apiPhone: "account-with-old-codes", verifiedName: "旧邀请码客服" },
      { apiPhone: "target-account", verifiedName: "目标客服" }
    ]);
    const oldAccount = accounts.find((account) => account.apiPhone === "account-with-old-codes")!;
    const targetAccount = accounts.find((account) => account.apiPhone === "target-account")!;

    for (let index = 0; index < 201; index += 1) {
      modules.a2cAccounts.createInviteCode(oldAccount.id, { code: `OLD-${index}` }, merchant.id);
    }
    modules.a2cAccounts.createInviteCode(targetAccount.id, { code: "TARGET-CODE" }, merchant.id);

    const reserved = modules.a2cAccounts.reserveInviteCodeForConversation({
      id: "target-conversation",
      merchantId: merchant.id,
      countryId: country.id,
      customerPhone: "target-customer",
      a2cAccountPhone: targetAccount.apiPhone
    });

    expect(reserved).toMatchObject({
      code: "TARGET-CODE",
      a2cAccountPhone: targetAccount.apiPhone,
      assignedConversationId: "target-conversation",
      status: "reserved"
    });
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
