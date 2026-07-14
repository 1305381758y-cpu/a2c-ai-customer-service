import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";
import { importTrainingMaterialFromBuffer, importTrainingSamplesFromBuffer } from "../src/services/trainingImports.js";

describe("training import service", () => {
  it("imports CSV samples into the merchant default country", async () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("样本导入商户");
    repos.createMerchantCountry(merchant.id, { name: "玻利维亚" });
    const countryId = repos.defaultCountryId(merchant.id);
    const csv = [
      "客户消息,标准回复,适用阶段,客户意图,语言,关键词,优先级,是否启用",
      "注册链接在哪里,请使用开户链接注册,need_platform_register,ask_link,es,链接,80,是"
    ].join("\n");

    const result = await importTrainingSamplesFromBuffer(repos, merchant.id, {
      buffer: Buffer.from(csv),
      filename: "samples.csv"
    });

    expect(result).toEqual({ ok: true, value: { imported: 1, enabled: 1 } });
    expect(repos.listTrainingSamples({ merchantId: merchant.id, countryId })).toEqual([
      expect.objectContaining({
        countryId,
        customerMessage: "注册链接在哪里",
        standardReply: "请使用开户链接注册",
        intent: "ask_link",
        language: "es",
        enabled: 1
      })
    ]);
  });

  it("imports text material as knowledge and records material item counts", async () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("素材导入商户");
    repos.createMerchantCountry(merchant.id, { name: "菲律宾" });
    const countryId = repos.defaultCountryId(merchant.id);
    const text = [
      "开户链接必须保持为 https://merchant.example/register",
      "",
      "Telegram 引导需要提醒客户发送 @username。"
    ].join("\n");

    const result = await importTrainingMaterialFromBuffer(repos, loadConfig({ DATABASE_URL: ":memory:" }), merchant.id, {
      buffer: Buffer.from(text),
      filename: "faq.txt",
      mimeType: "text/plain"
    });

    expect(result).toMatchObject({
      ok: true,
      value: { imported: 2, samples: 0, knowledge: 2 }
    });
    if (!result.ok) throw new Error(result.message);
    expect(result.value.material).toMatchObject({
      merchantId: merchant.id,
      countryId,
      sourceType: "txt",
      itemCount: 2,
      sampleCount: 0,
      knowledgeCount: 2
    });
    expect(repos.listTrainingMaterialItems(result.value.material.id, merchant.id)).toHaveLength(2);
    expect(repos.listKnowledgeItems({ merchantId: merchant.id, countryId }).map((row) => row.content).join("\n")).toContain("@username");
  });

  it("stores uploaded material under the selected valid country", async () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("多国家素材商户");
    repos.createMerchantCountry(merchant.id, { name: "巴西" });
    const selectedCountry = repos.createMerchantCountry(merchant.id, { name: "玻利维亚" });

    const result = await importTrainingMaterialFromBuffer(repos, loadConfig({ DATABASE_URL: ":memory:" }), merchant.id, {
      buffer: Buffer.from("注册链接必须保持为 https://merchant.example/register"),
      filename: "selected-country.txt",
      mimeType: "text/plain",
      countryId: selectedCountry.id
    });

    expect(result).toMatchObject({ ok: true, value: { material: { countryId: selectedCountry.id } } });
    expect(repos.listTrainingMaterials({ merchantId: merchant.id, countryId: selectedCountry.id })).toHaveLength(1);
  });

  it("returns a structured error when the uploaded sample file cannot be parsed", async () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("非法样本商户");

    const result = await importTrainingSamplesFromBuffer(repos, merchant.id, {
      buffer: Buffer.from("not an excel file"),
      filename: "samples.xlsx"
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      statusCode: 400,
      error: "invalid training sample file"
    });
  });
});
