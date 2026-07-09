import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { strictFlowScriptLine, strictFlowVerificationLine } from "../src/domain/strictFlowScriptText.js";
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

  it("rejects enabling a script flow with broken node rules", () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("启用校验商户");
    const flow = createTwoStepFlow(repos, merchant.id);

    repos.patchScriptFlowStep(flow.steps[0].id, merchant.id, { standardReply: "" }, "运营");

    expect(enableScriptFlow(repos, String(flow.flow.id), merchant.id, "运营")).toEqual({
      ok: false,
      statusCode: 400,
      error: "话本流程暂不能启用：兴趣筛选 缺少客服标准话术"
    });
  });

  it("rejects activating a broken script flow through basic info editing", () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("状态启用校验商户");
    const flow = createTwoStepFlow(repos, merchant.id);
    repos.patchScriptFlowStep(flow.steps[0].id, merchant.id, { standardReply: "" }, "运营");

    expect(patchScriptFlow(repos, String(flow.flow.id), merchant.id, { status: "active" }, "运营")).toEqual({
      ok: false,
      statusCode: 400,
      error: "话本流程暂不能启用：兴趣筛选 缺少客服标准话术"
    });
  });

  it("rejects enabling a script flow with missing next step references", () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("跳转校验商户");
    const flow = createTwoStepFlow(repos, merchant.id);

    repos.patchScriptFlowStep(flow.steps[0].id, merchant.id, { nextFlowCode: "不存在", nextFlowStep: "telegram_confirm" }, "运营");

    const result = enableScriptFlow(repos, String(flow.flow.id), merchant.id, "运营");
    expect(result).toMatchObject({ ok: false, statusCode: 400 });
    if (result.ok) throw new Error("expected validation error");
    expect(result.error).toContain("下一流程编号“不存在”不存在");
    expect(result.error).toContain("下一系统步骤 确认TG（telegram_confirm） 不存在");
  });

  it("rejects enabling a script flow when registration or teacher TG variables are incomplete", () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("变量校验商户");
    const flow = repos.createScriptFlow(merchant.id, {
      name: "变量错误话本",
      steps: [
        {
          flowCode: "A",
          flowName: "发送链接",
          flowStep: "send_register_link",
          standardReply: "请打开这个入口注册。",
          sendLink: true,
          sendInvite: false,
          sortOrder: 1
        },
        {
          flowCode: "B",
          flowName: "发送TG链接",
          flowStep: "collect_telegram",
          standardReply: "我会给您老师链接。",
          sortOrder: 2
        }
      ],
      createdBy: "测试员"
    });

    const result = enableScriptFlow(repos, String(flow.flow.id), merchant.id, "运营");
    expect(result).toMatchObject({ ok: false, statusCode: 400 });
    if (result.ok) throw new Error("expected validation error");
    expect(result.error).toContain("发送链接 发送注册信息时需要同时开启注册链接和邀请码");
    expect(result.error).toContain("发送链接 已开启发链接，但话术里缺少 {{REGISTER_URL}} 或 {{INVITE_DISPLAY}}");
    expect(result.error).toContain("发送TG链接 是发送TG链接节点，话术里需要包含 {{TG_LINK}}");
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
    expect(result.value.steps.map((step) => step.flowStep)).toEqual([
      "first_greeting",
      "interest_screening",
      "project_intro",
      "registration_intent",
      "send_register_link",
      "wait_registration",
      "telegram_confirm",
      "telegram_download",
      "collect_telegram",
      "human_handoff",
      "ended"
    ]);
    expect(result.value.steps[4]).toMatchObject({ flowStep: "send_register_link", sendLink: true, sendInvite: true, sendTutorialImage: false });
  });

  it("keeps built-in 11-step replies aligned with strict flow fallback replies", () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("内置兜底一致商户");

    const result = createBuiltInStrictScriptFlow(repos, merchant.id, {}, "运营");

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error(result.error);
    const byStep = new Map(result.value.steps.map((step) => [step.flowStep, step.standardReply]));
    expect(byStep.get("first_greeting")).toBe(strictFlowScriptLine("first_greeting", "zh"));
    expect(byStep.get("interest_screening")).toBe(strictFlowScriptLine("interest_screening_retry", "zh"));
    expect(byStep.get("project_intro")).toBe(strictFlowScriptLine("project_intro", "zh"));
    expect(byStep.get("registration_intent")).toBe(strictFlowScriptLine("registration_intent", "zh"));
    expect(byStep.get("wait_registration")).toBe(strictFlowScriptLine("wait_registration", "zh"));
    expect(byStep.get("telegram_confirm")).toBe(strictFlowScriptLine("telegram_confirm", "zh"));
    expect(byStep.get("telegram_download")).toBe(strictFlowScriptLine("telegram_download", "zh"));
    expect(byStep.get("collect_telegram")).toContain(strictFlowScriptLine("collect_telegram", "zh").split("按照她的指示去做。")[0]);
    expect(byStep.get("collect_telegram")).toContain("{{TG_LINK}}");
    expect(byStep.get("human_handoff")).toBe(strictFlowVerificationLine("zh"));
    expect(byStep.get("send_register_link")).toBe(
      [
        "好的，现在我会把链接和邀请码发给您。",
        "开户链接：{{REGISTER_URL}}",
        "邀请码：{{INVITE_CODE}}",
        "注册步骤：",
        "1. 在浏览器中打开链接。",
        "2. 填写手机号码。",
        "3. 设置用户名和密码。",
        "4. 输入邀请码。",
        "5. 提交注册。",
        "完成注册后请告诉我。"
      ].join("\n")
    );
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
