import { describe, expect, it } from "vitest";
import { mapScriptFlow, mapScriptFlowStep, mapScriptFlowVersion } from "../src/repositoryScriptFlowMappers.js";

describe("repositoryScriptFlowMappers", () => {
  it("maps script flows with country and status defaults", () => {
    expect(mapScriptFlow({
      id: 7,
      merchant_id: "m1",
      country_id: "m1:bo",
      country_code: "BO",
      country_name: "玻利维亚",
      name: "开户注册流程",
      status: "bad",
      active: 1,
      version: 3,
      step_count: 9
    })).toEqual({
      id: 7,
      merchantId: "m1",
      countryId: "m1:bo",
      countryCode: "BO",
      countryName: "玻利维亚",
      name: "开户注册流程",
      status: "draft",
      active: true,
      version: 3,
      sourceFilename: "",
      stepCount: 9,
      createdAt: "",
      updatedAt: ""
    });
  });

  it("maps script flow steps with boolean controls and routing fields", () => {
    expect(mapScriptFlowStep({
      id: 11,
      flow_id: 7,
      merchant_id: "m1",
      flow_code: "E",
      flow_name: "发送注册链接",
      flow_step: "wait_registration",
      standard_reply: "打开链接并填写邀请码",
      send_link: 1,
      send_invite: 1,
      send_tutorial_image: 1,
      next_flow_step: "telegram_confirm",
      sort_order: 5,
      enabled: 0
    })).toMatchObject({
      id: 11,
      flowId: 7,
      merchantId: "m1",
      countryId: "m1:default",
      flowCode: "E",
      flowName: "发送注册链接",
      flowStep: "wait_registration",
      standardReply: "打开链接并填写邀请码",
      sendLink: true,
      sendInvite: true,
      sendTutorialImage: true,
      nextFlowStep: "telegram_confirm",
      sortOrder: 5,
      enabled: false
    });
  });

  it("maps script flow versions with default author metadata", () => {
    expect(mapScriptFlowVersion({
      id: 3,
      flow_id: 7,
      merchant_id: "m1",
      version: 2,
      note: "修改节点"
    })).toEqual({
      id: 3,
      flowId: 7,
      merchantId: "m1",
      version: 2,
      note: "修改节点",
      createdBy: "",
      createdAt: ""
    });
  });
});
