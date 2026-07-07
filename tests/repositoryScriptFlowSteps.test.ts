import { describe, expect, it } from "vitest";
import { normalizeScriptFlowStep, normalizeScriptFlowStepValue } from "../src/repositoryScriptFlowSteps.js";

describe("repositoryScriptFlowSteps", () => {
  it("normalizes imported flow labels into strict flow steps", () => {
    expect(normalizeScriptFlowStep("A")).toBe("interest_screening");
    expect(normalizeScriptFlowStep("项目介绍")).toBe("project_intro");
    expect(normalizeScriptFlowStep("发送注册链接")).toBe("send_register_link");
    expect(normalizeScriptFlowStep("TG确认")).toBe("telegram_confirm");
    expect(normalizeScriptFlowStep("获取Telegram账号")).toBe("collect_telegram");
  });

  it("keeps custom flow step names when there is no known mapping", () => {
    expect(normalizeScriptFlowStep("Custom Step")).toBe("custom_step");
  });

  it("normalizes patch values for editable script flow steps", () => {
    expect(normalizeScriptFlowStepValue("sendLink", "false")).toBe(0);
    expect(normalizeScriptFlowStepValue("sortOrder", "7")).toBe(7);
    expect(normalizeScriptFlowStepValue("nextFlowStep", "Telegram下载")).toBe("telegram_download");
    expect(normalizeScriptFlowStepValue("notes", null)).toBe("");
  });
});
