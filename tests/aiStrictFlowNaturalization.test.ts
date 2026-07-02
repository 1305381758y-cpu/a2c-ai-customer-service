import { describe, expect, it, vi } from "vitest";
import { naturalizeStrictFlowText, sanitizeNaturalizedText, type AiNaturalizeStrictFlowRuntime } from "../src/clients/aiStrictFlowNaturalization.js";
import { loadConfig } from "../src/config.js";

const config = loadConfig({});

describe("AI strict-flow naturalization task", () => {
  it("removes links and invite codes when the current flow step does not allow them", () => {
    const cleaned = sanitizeNaturalizedText(
      "好的，先继续。\n开户链接：https://register.example\n邀请码：INV-001",
      "请继续当前步骤。",
      false
    );

    expect(cleaned).toContain("好的");
    expect(cleaned).not.toContain("https://register.example");
    expect(cleaned).not.toContain("INV-001");
  });

  it("falls back when the naturalized text loses required registration details", () => {
    const fallback = "开户链接：https://register.example\n邀请码：INV-001";

    expect(sanitizeNaturalizedText("请打开链接注册。", fallback, true)).toBe(fallback);
  });

  it("falls back when the model exposes AI identity", () => {
    const fallback = "您好，我来协助您。";

    expect(sanitizeNaturalizedText("我是 AI，我来帮您。", fallback, false)).toBe(fallback);
  });

  it("uses the injected runtime and limits recent history", async () => {
    const generateText = vi.fn(async () => "嗯嗯，您先按这一步来，有问题直接发我。");
    const runtime: AiNaturalizeStrictFlowRuntime = {
      hasUsableAiKey: () => true,
      providerLabel: () => "MiniMax",
      generateText
    };

    const result = await naturalizeStrictFlowText(config, {
      customerText: "好的",
      draftReply: "请继续当前步骤。",
      language: "zh",
      flowStep: "wait_registration",
      questionType: "workflow",
      allowLinkOrInvite: false,
      recentHistory: Array.from({ length: 8 }, (_, index) => ({
        direction: index % 2 ? "inbound" : "outbound",
        content: `message-${index}`,
        intent: "unknown",
        createdAt: ""
      }))
    }, runtime);

    expect(result).toMatchObject({ text: "嗯嗯，您先按这一步来，有问题直接发我。", used: true });
    expect(generateText).toHaveBeenCalledWith(expect.any(Object), expect.stringContaining("请继续当前步骤"), expect.objectContaining({
      maxOutputTokens: 800,
      temperature: 0.55
    }));
    const firstCall = generateText.mock.calls[0] as unknown as [unknown, string, unknown];
    const payload = JSON.parse(firstCall[1]);
    expect(payload.recentHistory).toHaveLength(6);
    expect(payload.recentHistory[0].content).toBe("message-2");
  });

  it("keeps the draft reply when no usable key is configured", async () => {
    const result = await naturalizeStrictFlowText(config, {
      customerText: "好的",
      draftReply: "请继续当前步骤。",
      language: "zh",
      flowStep: "wait_registration",
      questionType: "workflow",
      allowLinkOrInvite: false,
      recentHistory: []
    }, {
      hasUsableAiKey: () => false,
      providerLabel: () => "MiniMax",
      generateText: vi.fn()
    });

    expect(result).toEqual({
      text: "请继续当前步骤。",
      used: false,
      error: "MiniMax Key 未配置"
    });
  });
});
