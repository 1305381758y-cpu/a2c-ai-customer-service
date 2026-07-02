import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { chooseTrainingImageProvider, extractTrainingImageTextWithAi } from "../src/clients/aiTrainingImageTextTask.js";

function runtime(overrides: Partial<Parameters<typeof extractTrainingImageTextWithAi>[2]> = {}) {
  return {
    hasMiniMaxKey: vi.fn(() => false),
    hasGeminiKey: vi.fn(() => false),
    generateText: vi.fn(async () => "第一步：打开链接"),
    ...overrides
  };
}

describe("AI training image text task", () => {
  it("skips OCR with a clear warning when no image-capable provider key is configured", async () => {
    const generateText = vi.fn(async () => "ignored");

    const result = await extractTrainingImageTextWithAi(
      loadConfig({}),
      { buffer: Buffer.from("image"), filename: "guide.png", mimeType: "image/png" },
      runtime({ generateText })
    );

    expect(result).toEqual({
      text: "",
      status: "skipped",
      error: "图片 OCR 需要配置支持图片的 MiniMax 或 Gemini Key；当前图片未提取到文字"
    });
    expect(generateText).not.toHaveBeenCalled();
  });

  it("uses MiniMax by default when MiniMax is configured", async () => {
    const generateText = vi.fn(async () => "第一步：打开链接");

    const result = await extractTrainingImageTextWithAi(
      loadConfig({ AI_PROVIDER: "minimax", MINIMAX_API_KEY: "sk-test" }),
      { buffer: Buffer.from("image"), filename: "guide.jpg" },
      runtime({
        hasMiniMaxKey: vi.fn(() => true),
        generateText
      })
    );

    expect(result).toEqual({ text: "第一步：打开链接", status: "ok" });
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({ AI_PROVIDER: "minimax" }), [
      { inlineData: { mimeType: "image/jpeg", data: Buffer.from("image").toString("base64") } },
      { text: "请只提取图片中的全部可读文字，保持原语言和换行，不要解释。" }
    ]);
  });

  it("honors Gemini when Gemini is selected and configured", async () => {
    expect(chooseTrainingImageProvider(loadConfig({ AI_PROVIDER: "gemini" }), true, true)).toBe("gemini");
  });

  it("returns skipped when OCR succeeds with empty text", async () => {
    const result = await extractTrainingImageTextWithAi(
      loadConfig({ MINIMAX_API_KEY: "sk-test" }),
      { buffer: Buffer.from("image"), filename: "guide.webp" },
      runtime({
        hasMiniMaxKey: vi.fn(() => true),
        generateText: vi.fn(async () => "   ")
      })
    );

    expect(result).toEqual({
      text: "",
      status: "skipped",
      error: "图片 OCR 未提取到可读文字"
    });
  });
});
