import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";
import {
  createBuiltInStrictScriptFlow,
  deleteScriptFlow,
  deleteScriptFlowStep,
  enableScriptFlow,
  getScriptFlowDetail,
  listScriptFlows,
  patchScriptFlow,
  patchScriptFlowStep
} from "../src/services/scriptFlows.js";

describe("script flow service", () => {
  it("lists and reads script flows through merchant scope", () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("话本服务商户");
    const otherMerchant = repos.createMerchant("其他商户");
    const flow = createTwoStepFlow(repos, merchant.id);
    createTwoStepFlow(repos, otherMerchant.id);

    expect(listScriptFlows(repos, {}, merchant.id).rows).toEqual([
      expect.objectContaining({ id: flow.flow.id, merchantId: merchant.id })
    ]);

    const detail = getScriptFlowDetail(repos, String(flow.flow.id), merchant.id);
    expect(detail).toMatchObject({
      ok: true,
      value: {
        flow: expect.objectContaining({ id: flow.flow.id }),
        steps: expect.arrayContaining([expect.objectContaining({ flowCode: "A" })])
      }
    });
    if (!detail.ok) throw new Error(detail.error);
    expect(detail.value.versions.length).toBeGreaterThan(0);

    expect(getScriptFlowDetail(repos, String(flow.flow.id), otherMerchant.id)).toEqual({
      ok: false,
      statusCode: 404,
      error: "script flow not found"
    });
  });

  it("enables merchant strict flow config when merchant enables a script flow", () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("启用话本商户");
    const flow = createTwoStepFlow(repos, merchant.id);

    const result = enableScriptFlow(repos, String(flow.flow.id), merchant.id, "运营", { enableStrictFlowConfig: true });

    expect(result).toMatchObject({ ok: true, value: { flow: expect.objectContaining({ active: true }) } });
    expect(repos.getMerchantConfig(merchant.id).strictScriptFlowEnabled).toBe(true);
  });

  it("creates the built-in 11-step strict business flow as editable draft", () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("内置流程商户");

    const result = createBuiltInStrictScriptFlow(repos, merchant.id, {}, "运营");

    expect(result).toMatchObject({
      ok: true,
      value: {
        flow: expect.objectContaining({ name: "严格业务流程", status: "draft", active: false, sourceFilename: "系统内置", stepCount: 11 })
      }
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.value.steps.map((step) => step.flowName)).toEqual([
      "首次问候",
      "兴趣筛选",
      "项目介绍",
      "确认意向",
      "发送链接",
      "等待注册",
      "确认TG",
      "下载TG",
      "发送TG链接",
      "人工接管",
      "结束"
    ]);
    expect(result.value.steps[4]).toMatchObject({ flowStep: "send_register_link", sendLink: true, sendInvite: true, sendTutorialImage: false });
  });

  it("keeps script flow status and active flag consistent when editing basic info", () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("状态一致商户");
    const flow = createTwoStepFlow(repos, merchant.id);

    expect(patchScriptFlow(repos, String(flow.flow.id), merchant.id, { status: "active" }, "运营")).toMatchObject({
      ok: true,
      value: { flow: expect.objectContaining({ status: "active", active: true }) }
    });

    expect(patchScriptFlow(repos, String(flow.flow.id), merchant.id, { status: "disabled" }, "运营")).toMatchObject({
      ok: true,
      value: { flow: expect.objectContaining({ status: "disabled", active: false }) }
    });

    expect(deleteScriptFlow(repos, String(flow.flow.id), merchant.id)).toEqual({
      ok: true,
      value: { ok: true }
    });
  });

  it("allows deleting legacy flows that were disabled while still marked active", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("历史状态商户");
    const flow = createTwoStepFlow(repos, merchant.id);
    repos.enableScriptFlow(flow.flow.id, merchant.id, "运营");
    db.sqlite.prepare("UPDATE script_flows SET status = 'disabled', active = 1 WHERE id = ?").run(flow.flow.id);

    expect(deleteScriptFlow(repos, String(flow.flow.id), merchant.id)).toEqual({
      ok: true,
      value: { ok: true }
    });
  });

  it("returns structured errors for invalid or referenced script flow steps", () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("节点保护商户");
    const flow = createTwoStepFlow(repos, merchant.id);

    expect(patchScriptFlowStep(repos, String(flow.steps[1].id), merchant.id, { standardReply: "更新后的项目介绍。" }, "运营")).toMatchObject({
      ok: true,
      value: { standardReply: "更新后的项目介绍。" }
    });
    expect(deleteScriptFlowStep(repos, String(flow.steps[1].id), merchant.id, "运营")).toEqual({
      ok: false,
      statusCode: 400,
      error: "有其他节点引用了这个节点，请先修改下一步条件后再删除"
    });
    expect(deleteScriptFlowStep(repos, "999999", merchant.id, "运营")).toEqual({
      ok: false,
      statusCode: 404,
      error: "script flow step not found"
    });
  });
});

function createTwoStepFlow(repos: Repositories, merchantId: string) {
  return repos.createScriptFlow(merchantId, {
    name: "直营网话本",
    steps: [
      {
        flowCode: "A",
        flowName: "兴趣筛选",
        flowStep: "interest_screening",
        standardReply: "您好，是否有兴趣？",
        nextFlowCode: "B",
        nextFlowStep: "registration_intent",
        sortOrder: 1
      },
      {
        flowCode: "B",
        flowName: "项目介绍",
        flowStep: "registration_intent",
        standardReply: "这里是自定义项目介绍。",
        sortOrder: 2
      }
    ],
    createdBy: "测试员"
  });
}
