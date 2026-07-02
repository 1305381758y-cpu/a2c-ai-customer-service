import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { analyzeCustomerImage, type AiImageAnalysisRuntime } from "../src/clients/aiImageAnalysis.js";

function config() {
  return loadConfig({
    AI_PROVIDER: "minimax",
    MINIMAX_API_KEY: "sk-test",
    MINIMAX_MODEL: "MiniMax-M3"
  });
}

function runtime(overrides: Partial<AiImageAnalysisRuntime> = {}): AiImageAnalysisRuntime {
  return {
    selectedProvider: () => "minimax",
    hasMiniMaxKey: () => true,
    generateMiniMaxText: vi.fn(async () => "页面显示链接无法打开，请客户换浏览器"),
    ...overrides
  };
}

describe("AI customer image analysis task", () => {
  it("sends image urls to MiniMax with a bounded internal-analysis prompt", async () => {
    const generateMiniMaxText = vi.fn(async () => "页面显示链接无法打开，请客户换浏览器");

    const result = await analyzeCustomerImage(config(), "https://cdn.example/register.png", runtime({ generateMiniMaxText }));

    expect(result).toEqual({ text: "页面显示链接无法打开，请客户换浏览器", status: "ok" });
    expect(generateMiniMaxText).toHaveBeenCalledWith(expect.any(Object), [
      expect.objectContaining({ text: expect.stringContaining("不要提取或猜测手机号") }),
      { inlineData: { mimeType: "image/jpeg", data: "https://cdn.example/register.png" } }
    ], { temperature: 0, maxOutputTokens: 160 });
  });

  it("skips MiniMax image analysis when the merchant has no MiniMax key", async () => {
    const generateMiniMaxText = vi.fn();

    const result = await analyzeCustomerImage(config(), "https://cdn.example/register.png", runtime({
      hasMiniMaxKey: () => false,
      generateMiniMaxText
    }));

    expect(result).toEqual({ text: "", status: "skipped", error: "MiniMax Key 未配置" });
    expect(generateMiniMaxText).not.toHaveBeenCalled();
  });

  it("reports DeepSeek image support as skipped instead of throwing", async () => {
    const result = await analyzeCustomerImage(config(), "https://cdn.example/register.png", runtime({
      selectedProvider: () => "deepseek"
    }));

    expect(result.status).toBe("skipped");
    expect(result.error).toContain("DeepSeek 暂不支持图片理解");
  });

  it("returns failed image analysis without exposing provider exceptions to callers", async () => {
    const result = await analyzeCustomerImage(config(), "https://cdn.example/register.png", runtime({
      generateMiniMaxText: vi.fn(async () => {
        throw new Error("MiniMax timeout");
      })
    }));

    expect(result).toEqual({ text: "", status: "failed", error: "MiniMax timeout" });
  });
});
