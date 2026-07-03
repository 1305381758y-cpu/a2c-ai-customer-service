import type { AppConfig } from "../config.js";
import type { AiTextOptions, AiTextPart } from "./aiProviderTypes.js";

export interface AiImageAnalysis {
  text: string;
  status: "ok" | "failed" | "skipped";
  error?: string;
}

export interface AiImageAnalysisRuntime {
  selectedProvider(config: AppConfig): "minimax" | "gemini" | "deepseek";
  hasMiniMaxKey(config: AppConfig): boolean;
  generateMiniMaxText(config: AppConfig, contents: string | AiTextPart[], options: AiTextOptions): Promise<string>;
}

export async function analyzeCustomerImage(
  config: AppConfig,
  imageUrl: string,
  runtime: AiImageAnalysisRuntime
): Promise<AiImageAnalysis> {
  if (!imageUrl) return { text: "", status: "skipped" };
  const provider = runtime.selectedProvider(config);
  if (provider === "deepseek") {
    return { text: "", status: "skipped", error: "DeepSeek 暂不支持图片理解，请切换 MiniMax/Gemini 或让客户补充文字说明" };
  }
  if (provider === "minimax" && !runtime.hasMiniMaxKey(config)) return { text: "", status: "skipped", error: "MiniMax Key 未配置" };
  try {
    const text = await runtime.generateMiniMaxText({ ...config, AI_PROVIDER: provider }, [
      { text: customerImageAnalysisPrompt() },
      { inlineData: { mimeType: "image/jpeg", data: imageUrl } }
    ], { temperature: 0, maxOutputTokens: 160, taskType: "customer_image_analysis" });
    return { text: text.slice(0, 160), status: text ? "ok" : "skipped" };
  } catch (error) {
    return { text: "", status: "failed", error: error instanceof Error ? error.message : "图片识别失败" };
  }
}

function customerImageAnalysisPrompt(): string {
  return `请分析这张客户发来的开户注册/Telegram 操作截图。
只输出一段很短的内部中文说明，30 字以内。
重点判断：客户是否遇到链接打不开、页面报错、验证码、邀请码、注册字段、Telegram 用户名等问题。
不要输出图片 URL，不要提取或猜测手机号，不要编造页面上没有的信息。`;
}
