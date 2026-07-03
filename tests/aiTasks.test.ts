import { describe, expect, it, vi } from "vitest";

import { loadConfig } from "../src/config.js";
import { AiTasks } from "../src/services/aiTasks.js";

const config = loadConfig({ AI_PROVIDER: "minimax", MINIMAX_API_KEY: "sk-test" });

describe("AiTasks", () => {
  it("delegates reply generation through an injected task port", async () => {
    const generateReply = vi.fn(async () => ({
      reply: "您好",
      language: "zh",
      stage: "active",
      extractedPhone: "",
      extractedTelegram: "",
      extractedWhatsApp: "",
      shouldHandoff: false
    }));
    const input = { customerText: "你好" } as never;
    const ai = new AiTasks({ generateReply });

    await expect(ai.generateReply(config, input)).resolves.toMatchObject({ reply: "您好", language: "zh" });

    expect(generateReply).toHaveBeenCalledWith(config, input);
  });

  it("delegates classification, translation and availability through injected task ports", async () => {
    const detectLanguage = vi.fn(async () => "es");
    const classifyIntent = vi.fn(async () => "ask_link" as const);
    const classifyContextualIntent = vi.fn(async () => ({
      intent: "ask_link" as const,
      answeredPreviousQuestion: true,
      isQuestion: true,
      shouldPause: false,
      questionType: "link",
      nextAction: "answer_link_problem",
      reason: "客户说链接打不开"
    }));
    const naturalizeStrictFlowText = vi.fn(async () => ({ text: "没事，我一步步带您。", used: true }));
    const translateText = vi.fn(async () => "你好");
    const checkAvailability = vi.fn(async () => undefined);
    const ai = new AiTasks({
      detectLanguage,
      classifyIntent,
      classifyContextualIntent,
      naturalizeStrictFlowText,
      translateText,
      checkAvailability
    });

    await expect(ai.detectLanguage(config, {
      customerText: "Hola",
      previousLanguage: "",
      countryDefaultLanguage: "es",
      recentHistory: []
    })).resolves.toBe("es");
    await expect(ai.classifyIntent(config, {
      customerText: "链接",
      language: "zh",
      flowStep: "wait_registration",
      recentHistory: []
    })).resolves.toBe("ask_link");
    await expect(ai.classifyContextualIntent(config, {
      customerText: "打不开",
      language: "zh",
      flowStep: "wait_registration",
      recentHistory: [],
      previousAssistantMessage: "请打开链接",
      knownPhone: "",
      knownTelegram: ""
    })).resolves.toMatchObject({ intent: "ask_link" });
    await expect(ai.naturalizeStrictFlowText(config, {
      customerText: "不会",
      draftReply: "请注册",
      language: "zh",
      flowStep: "wait_registration",
      questionType: "help",
      recentHistory: [],
      allowLinkOrInvite: true
    })).resolves.toMatchObject({ text: "没事，我一步步带您。", used: true });
    await expect(ai.translateText(config, {
      text: "Hola",
      targetLanguage: "zh",
      systemPrompt: "translate"
    })).resolves.toBe("你好");
    await expect(ai.checkAvailability(config)).resolves.toBeUndefined();

    expect(detectLanguage).toHaveBeenCalledOnce();
    expect(classifyIntent).toHaveBeenCalledOnce();
    expect(classifyContextualIntent).toHaveBeenCalledOnce();
    expect(naturalizeStrictFlowText).toHaveBeenCalledOnce();
    expect(translateText).toHaveBeenCalledOnce();
    expect(checkAvailability).toHaveBeenCalledWith(config);
  });

  it("delegates image analysis, OCR and conversation review through injected task ports", async () => {
    const analyzeImage = vi.fn(async () => ({ text: "无法打开", status: "ok" as const }));
    const extractTrainingImageText = vi.fn(async () => ({ text: "教程文字", status: "ok" as const }));
    const generateConversationReviewDraft = vi.fn(async () => ({
      score: 88,
      goalCompleted: true,
      summary: "完成目标",
      mainConcerns: ["链接打不开"],
      mistakes: [],
      goodReplies: ["我来帮您看截图。"],
      suggestedSamples: [],
      suggestedKnowledge: [],
      improvementActions: ["继续减少重复话术"]
    }));
    const ai = new AiTasks({
      analyzeImage,
      extractTrainingImageText,
      generateConversationReviewDraft
    });
    const buffer = Buffer.from("image");
    const reviewInput = { messages: [], agentProfile: undefined } as never;

    await expect(ai.analyzeImage(config, "https://example.test/screenshot.png")).resolves.toMatchObject({ text: "无法打开", status: "ok" });
    await expect(ai.extractTrainingImageText(config, {
      buffer,
      filename: "tutorial.png",
      mimeType: "image/png"
    })).resolves.toMatchObject({ text: "教程文字", status: "ok" });
    await expect(ai.generateConversationReviewDraft(config, reviewInput)).resolves.toMatchObject({ score: 88, goalCompleted: true });

    expect(analyzeImage).toHaveBeenCalledWith(config, "https://example.test/screenshot.png");
    expect(extractTrainingImageText).toHaveBeenCalledWith(config, {
      buffer,
      filename: "tutorial.png",
      mimeType: "image/png"
    });
    expect(generateConversationReviewDraft).toHaveBeenCalledWith(config, reviewInput);
  });
});
