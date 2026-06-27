import { describe, expect, it } from "vitest";

import { parseScriptFlowText } from "../src/import/scriptFlows.js";

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
});
