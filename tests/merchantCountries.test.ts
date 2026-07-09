import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";
import { createMerchantCountry, listAllMerchantCountries, listMerchantCountries, patchMerchantCountry } from "../src/services/merchantCountries.js";

describe("merchantCountries service", () => {
  it("creates the merchant primary country and infers code and default language from the name", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("国家服务商户");

    const result = createMerchantCountry(repos, merchant.id, { name: "玻利维亚" });

    expect(result).toMatchObject({
      ok: true,
      value: { merchantId: merchant.id, code: "bo", name: "玻利维亚", defaultLanguage: "es" }
    });
    expect(listMerchantCountries(repos, merchant.id).rows).toHaveLength(1);
    expect(listMerchantCountries(repos, merchant.id).rows[0]).toMatchObject({ code: "bo", defaultLanguage: "es" });
  });

  it("patches country profile fields through the same inference rule", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("国家修改服务商户");
    const created = createMerchantCountry(repos, merchant.id, { name: "巴西" });
    if (!created.ok) throw new Error(created.error);

    const result = patchMerchantCountry(repos, merchant.id, created.value.id, {
      name: "菲律宾",
      code: "default",
      defaultLanguage: "zh",
      requireTelegram: false,
      requireWhatsApp: true
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        code: "ph",
        name: "菲律宾",
        defaultLanguage: "en",
        requireTelegram: false,
        requireWhatsApp: true
      }
    });
  });

  it("returns not found when patching a country outside the merchant", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchantA = repos.createMerchant("国家商户A");
    const merchantB = repos.createMerchant("国家商户B");
    const created = createMerchantCountry(repos, merchantA.id, { name: "巴西" });
    if (!created.ok) throw new Error(created.error);

    expect(patchMerchantCountry(repos, merchantB.id, created.value.id, { name: "玻利维亚" })).toEqual({
      ok: false,
      statusCode: 404,
      error: "country not found"
    });
  });

  it("lists country options across merchants for platform filters", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchantA = repos.createMerchant("平台国家商户A");
    const merchantB = repos.createMerchant("平台国家商户B");
    createMerchantCountry(repos, merchantA.id, { name: "玻利维亚" });
    createMerchantCountry(repos, merchantB.id, { name: "巴西" });

    const rows = listAllMerchantCountries(repos).rows;

    expect(rows.some((country) => country.merchantId === merchantA.id && country.code === "bo")).toBe(true);
    expect(rows.some((country) => country.merchantId === merchantB.id && country.code === "br")).toBe(true);
  });
});
