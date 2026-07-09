import { describe, expect, it } from "vitest";

import { validateScriptFlowDraft } from "../frontend/src/script-flows/ScriptFlowValidation.js";
import type { ScriptFlowStep } from "../frontend/src/types.js";

describe("frontend script flow validation", () => {
  it("requires at least one enabled step", () => {
    expect(validateScriptFlowDraft([])).toEqual(["至少需要 1 个启用节点"]);
    expect(validateScriptFlowDraft([step({ enabled: false })])).toEqual(["至少需要 1 个启用节点"]);
  });

  it("warns about registration variable problems before enabling", () => {
    const warnings = validateScriptFlowDraft([
      step({
        flowName: "发送链接",
        flowStep: "send_register_link",
        standardReply: "请打开这个入口注册。",
        sendLink: true,
        sendInvite: false
      })
    ]);

    expect(warnings).toContain("发送链接 发注册信息时需要同时开启链接和邀请码");
    expect(warnings).toContain("发送链接 缺少注册链接变量");
  });

  it("warns when teacher Telegram link step misses link variables", () => {
    expect(validateScriptFlowDraft([
      step({ flowName: "发送TG链接", flowStep: "collect_telegram", standardReply: "我会给您老师链接。" })
    ])).toContain("发送TG链接 缺少老师TG链接变量");
  });

  it("warns about duplicate and missing next node references", () => {
    const warnings = validateScriptFlowDraft([
      step({ id: 1, flowCode: "A", nextFlowCode: "C", nextFlowStep: "telegram_confirm" }),
      step({ id: 2, flowCode: "A", flowStep: "wait_registration" })
    ]);

    expect(warnings).toContain("流程编号重复：A");
    expect(warnings).toContain("节点 的下一流程编号不存在");
    expect(warnings).toContain("节点 的下一系统步骤不存在");
  });

  it("accepts complete registration and Telegram link nodes", () => {
    expect(validateScriptFlowDraft([
      step({
        flowCode: "A",
        flowName: "发送链接",
        flowStep: "send_register_link",
        standardReply: "开户链接：{{REGISTER_URL}}\n邀请码：{{INVITE_CODE}}",
        sendLink: true,
        sendInvite: true,
        nextFlowCode: "B",
        nextFlowStep: "collect_telegram"
      }),
      step({
        id: 2,
        flowCode: "B",
        flowName: "发送TG链接",
        flowStep: "collect_telegram",
        standardReply: "老师TG：{{TG_LINK}}"
      })
    ])).toEqual([]);
  });
});

function step(patch: Partial<ScriptFlowStep> = {}): ScriptFlowStep {
  return {
    id: 1,
    flowId: 1,
    flowCode: "A",
    flowName: "节点",
    flowStep: "interest_screening",
    goal: "",
    triggerCondition: "",
    customerExpressions: "",
    standardReply: "默认话术",
    collectInfo: "",
    sendLink: false,
    sendInvite: false,
    sendTutorialImage: false,
    nextCondition: "",
    nextFlowCode: "",
    nextFlowStep: "",
    forbidden: "",
    notes: "",
    sortOrder: 1,
    enabled: true,
    ...patch
  };
}
