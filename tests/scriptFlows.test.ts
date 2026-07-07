import { describe, expect, it } from "vitest";

import { parseScriptFlowCsv, parseScriptFlowText } from "../src/import/scriptFlows.js";

describe("script flow import", () => {
  it("splits Word document text into editable script steps", () => {
    const steps = parseScriptFlowText(`
      您好，您是想了解一份兼职在线工作吗？
      好的，我先简单介绍一下这份工作，具体收益以页面规则为准。您现在方便继续开户注册吗？
      开户链接和邀请码我发给您，请按注册步骤填写手机号、用户名和密码。
      如果没有 Telegram，可以在 Play Store 或 App Store 搜索下载 Telegram。
      完成后把 @ 开头的 Telegram 用户名发给我。
    `);

    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(steps[0].flowStep).toBe("interest_screening");
    expect(steps.some((step) => step.flowStep === "wait_registration" && step.sendLink && step.sendInvite)).toBe(true);
    expect(steps.some((step) => step.flowStep === "telegram_download")).toBe(true);
    expect(steps.some((step) => step.flowStep === "collect_telegram")).toBe(true);
  });

  it("parses explicit free-form script blocks into editable fields", () => {
    const steps = parseScriptFlowText(`
      A. 首次问候
      触发条件：客户首次打招呼
      客服标准话术：您好，您是想了解一份兼职在线工作吗？
      下一流程编号：B

      B. 发送注册链接
      当前节点目标：发送开户链接和邀请码
      客户常见表达：方便，可以开始，发链接
      客服标准话术：好的，现在我会把链接和邀请码发给您。{{INVITE_DISPLAY}}
      是否发链接：是
      是否发邀请码：是
      需要收集的信息：注册手机号
    `);

    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({
      flowCode: "A",
      flowName: "首次问候",
      flowStep: "interest_screening",
      nextFlowCode: "B"
    });
    expect(steps[1]).toMatchObject({
      flowCode: "B",
      flowName: "发送注册链接",
      flowStep: "wait_registration",
      sendLink: true,
      sendInvite: true,
      collectInfo: "注册手机号"
    });
  });

  it("turns mermaid-style flow graphs into draft nodes", () => {
    const steps = parseScriptFlowText(`
      A[首次问候] --> B[兴趣筛选]
      B[兴趣筛选] --> C[项目介绍]
      C[项目介绍] --> D[发送链接]
    `);

    expect(steps.map((step) => step.flowCode)).toEqual(["A", "B", "C", "D"]);
    expect(steps[0].nextFlowCode).toBe("B");
    expect(steps[3].flowStep).toBe("wait_registration");
    expect(steps[3].sendInvite).toBe(true);
  });

  it("imports standard CSV script flows", () => {
    const steps = parseScriptFlowCsv(Buffer.from([
      "流程编号,流程名称,客服标准话术,是否发链接,是否发邀请码,需要收集的信息",
      "A,问候,您好，您是想了解兼职吗？,否,否,",
      "B,注册,开户链接：{{REGISTER_URL}} 邀请码：{{INVITE_CODE}},是,是,注册手机号"
    ].join("\n"), "utf8"));

    expect(steps).toHaveLength(2);
    expect(steps[1].sendLink).toBe(true);
    expect(steps[1].sendInvite).toBe(true);
    expect(steps[1].collectInfo).toBe("注册手机号");
  });

  it("accepts Chinese system step labels from plain text templates", () => {
    const steps = parseScriptFlowText(`
      A. 兴趣筛选
      系统步骤：兴趣筛选
      客服标准话术：您好，您是想了解一份兼职在线工作吗？
      下一系统步骤：确认注册意向

      B. 发送链接邀请码
      系统步骤：发送链接邀请码
      客服标准话术：开户链接：{{REGISTER_URL}} 邀请码：{{INVITE_CODE}}
      是否发链接：是
      是否发邀请码：是
      下一系统步骤：确认TG

      C. 收集 Telegram 用户名
      系统步骤：收集TG用户名
      客服标准话术：请把 @ 开头的 Telegram 用户名发给我。
      下一系统步骤：人工接管
    `);

    expect(steps.map((step) => step.flowStep)).toEqual([
      "interest_screening",
      "send_register_link",
      "collect_telegram"
    ]);
    expect(steps[0].nextFlowStep).toBe("registration_intent");
    expect(steps[1].nextFlowStep).toBe("telegram_confirm");
    expect(steps[2].nextFlowStep).toBe("human_handoff");
  });
});
