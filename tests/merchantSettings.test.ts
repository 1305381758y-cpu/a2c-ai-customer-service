import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";
import { getMerchantVisibleConfig, patchMaskedMerchantConfig, patchMerchantVisibleConfig } from "../src/services/merchantSettings.js";
import { createBuiltInStrictScriptFlow, enableScriptFlow } from "../src/services/scriptFlows.js";
import { appConfigForMerchant } from "../src/services/runtimeConfig.js";

describe("merchant settings service", () => {
  it("requires an active valid script flow before enabling script-flow mode", () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("话本开关商户");

    expect(patchMaskedMerchantConfig(repos, merchant.id, { strictScriptFlowEnabled: true })).toEqual({
      ok: false,
      statusCode: 400,
      error: "开启话本流程前，请先在“话本流程”页面启用一个有效流程。"
    });
  });

  it("allows enabling script-flow mode when a valid flow is active", () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("有效话本商户");
    const flow = createBuiltInStrictScriptFlow(repos, merchant.id, {}, "运营");
    if (!flow.ok) throw new Error(flow.error);
    expect(enableScriptFlow(repos, String(flow.value.flow.id), merchant.id, "运营")).toMatchObject({ ok: true });

    const result = patchMaskedMerchantConfig(repos, merchant.id, { strictScriptFlowEnabled: true });

    expect(result).toMatchObject({ ok: true, value: { strictScriptFlowEnabled: true } });
  });

  it("rejects script-flow mode when the active flow is broken legacy data", () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("坏话本商户");
    const flow = createBuiltInStrictScriptFlow(repos, merchant.id, {}, "运营");
    if (!flow.ok) throw new Error(flow.error);
    expect(enableScriptFlow(repos, String(flow.value.flow.id), merchant.id, "运营")).toMatchObject({ ok: true });
    repos.patchScriptFlowStep(flow.value.steps[0].id, merchant.id, { standardReply: "" }, "运营");

    const result = patchMaskedMerchantConfig(repos, merchant.id, { strictScriptFlowEnabled: true });

    expect(result).toEqual({
      ok: false,
      statusCode: 400,
      error: "当前启用话本存在问题：首次问候 缺少客服标准话术"
    });
  });

  it("keeps model configuration platform-only while exposing billing to merchants", () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("计费权限商户");
    patchMaskedMerchantConfig(repos, merchant.id, {
      aiProvider: "deepseek",
      deepseekApiKey: "platform-key",
      sessionPrice: 2.5,
      balance: 20,
      balanceCurrency: "CNY"
    });

    const visible = getMerchantVisibleConfig(repos, merchant.id);
    expect(visible).toMatchObject({ sessionPrice: 2.5, balance: 20, balanceCurrency: "CNY" });
    expect(visible).not.toHaveProperty("aiProvider");
    expect(visible).not.toHaveProperty("deepseekApiKey");

    patchMerchantVisibleConfig(repos, merchant.id, { aiProvider: "gemini", deepseekApiKey: "merchant-key", balance: 30, sessionPrice: 1 });
    expect(repos.getMerchantConfig(merchant.id)).toMatchObject({ aiProvider: "deepseek", deepseekApiKey: "platform-key", balance: 20, sessionPrice: 2.5 });
  });

  it("charges a new conversation once and blocks new conversations when balance is insufficient", () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("会话余额商户");
    const country = repos.ensurePrimaryCountry(merchant.id);
    patchMaskedMerchantConfig(repos, merchant.id, { sessionPrice: 3, balance: 5 });

    const first = repos.getOrCreateConversation("customer-1", "a2c-1", "", merchant.id, country.id);
    expect(first).toMatchObject({ billingStatus: "charged", sessionChargeAmount: 3 });
    expect(repos.getMerchantConfig(merchant.id).balance).toBe(2);
    const same = repos.getOrCreateConversation("customer-1", "a2c-1", "", merchant.id, country.id);
    expect(same.id).toBe(first.id);
    expect(repos.getMerchantConfig(merchant.id).balance).toBe(2);

    const second = repos.getOrCreateConversation("customer-2", "a2c-1", "", merchant.id, country.id);
    expect(second.billingStatus).toBe("insufficient");
    expect(repos.getMerchantConfig(merchant.id).balance).toBe(2);
  });

  it("supports customer balance ledger CRUD and customer-level model override", () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("客户账单与模型商户");
    const country = repos.ensurePrimaryCountry(merchant.id);
    const conversation = repos.getOrCreateConversation("customer-1", "a2c-1", "客户", merchant.id, country.id, false);
    repos.upsertCustomerFromConversation(conversation);

    const created = repos.createCustomerBalanceTransaction(merchant.id, "customer-1", 12.5, "测试充值", "管理员");
    expect(created).toMatchObject({ amount: 12.5, note: "测试充值", createdBy: "管理员" });
    expect(repos.getCustomer(merchant.id, "customer-1")).toMatchObject({ balance: 12.5, balanceCurrency: "CNY" });

    const patched = repos.patchCustomerBalanceTransaction(created!.id, merchant.id, { amount: 20, note: "调整后" });
    expect(patched).toMatchObject({ amount: 20, note: "调整后" });
    expect(repos.getCustomer(merchant.id, "customer-1")?.balance).toBe(20);

    expect(repos.patchCustomer(merchant.id, "customer-1", { aiProvider: "deepseek", aiModel: "deepseek-chat" })).toMatchObject({ aiProvider: "deepseek", aiModel: "deepseek-chat" });
    const baseConfig = repos.getMerchantConfig(merchant.id);
    const runtime = appConfigForMerchant({ AI_PROVIDER: "minimax", MINIMAX_MODEL: "MiniMax-M3", DEEPSEEK_MODEL: "deepseek-chat" } as any, baseConfig, country, { aiProvider: "deepseek", aiModel: "deepseek-reasoner" });
    expect(runtime).toMatchObject({ AI_PROVIDER: "deepseek", DEEPSEEK_MODEL: "deepseek-reasoner" });

    expect(repos.deleteCustomerBalanceTransaction(patched!.id, merchant.id)).toBe(true);
    expect(repos.getCustomer(merchant.id, "customer-1")?.balance).toBe(0);
  });
});
