import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";
import { patchMaskedMerchantConfig } from "../src/services/merchantSettings.js";
import { createBuiltInStrictScriptFlow, enableScriptFlow } from "../src/services/scriptFlows.js";

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
});
