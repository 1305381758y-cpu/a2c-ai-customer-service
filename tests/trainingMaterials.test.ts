import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { parseTrainingMaterial } from "../src/import/trainingMaterials.js";

describe("training material parser", () => {
  it("uses the AiTasks image text extraction interface for uploaded image materials", async () => {
    const ai = {
      extractTrainingImageText: vi.fn(async () => ({
        text: "第一步：打开注册链接\n第二步：输入邀请码完成注册",
        status: "ok" as const
      }))
    };
    const buffer = Buffer.from("fake image bytes");

    const parsed = await parseTrainingMaterial({
      buffer,
      filename: "register-guide.png",
      mimeType: "image/png",
      aiConfig: loadConfig({ MINIMAX_API_KEY: "minimax-test" }),
      ai
    });

    expect(ai.extractTrainingImageText).toHaveBeenCalledWith(expect.objectContaining({
      MINIMAX_API_KEY: "minimax-test"
    }), {
      buffer,
      filename: "register-guide.png",
      mimeType: "image/png"
    });
    expect(parsed.sourceType).toBe("image");
    expect(parsed.rawText).toContain("打开注册链接");
    expect(parsed.knowledge).toEqual(expect.arrayContaining([
      expect.objectContaining({
        content: expect.stringContaining("输入邀请码")
      })
    ]));
  });

  it("reports a clear warning when image OCR has no AI config", async () => {
    const ai = {
      extractTrainingImageText: vi.fn()
    };

    const parsed = await parseTrainingMaterial({
      buffer: Buffer.from("fake image bytes"),
      filename: "register-guide.png",
      mimeType: "image/png",
      ai
    });

    expect(ai.extractTrainingImageText).not.toHaveBeenCalled();
    expect(parsed.warnings).toContain("图片 OCR 需要配置支持图片的 MiniMax 或 Gemini Key；当前图片未提取到文字");
  });
});
