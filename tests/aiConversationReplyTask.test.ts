import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { generateConversationReply, sanitizeCustomerVisibleReply } from "../src/clients/aiConversationReplyTask.js";
import type { ReplyInput } from "../src/clients/aiReplyTypes.js";

function config() {
  return loadConfig({
    DATABASE_URL: ":memory:",
    PLATFORM_REGISTER_URL: "https://register.example"
  });
}

function replyInput(overrides: Partial<ReplyInput> = {}): ReplyInput {
  return {
    customerText: "请发我注册链接",
    conversation: {
      id: "conv-1",
      merchantId: "merchant-1",
      countryId: "country-1",
      countryCode: "BR",
      countryName: "巴西",
      customerPhone: "customer-1",
      a2cAccountPhone: "agent-1",
      nickname: "",
      language: "zh",
      stage: "need_platform_register",
      flowStep: "",
      status: "active",
      handoffStatus: "pending",
      handoffNotified: 0,
      unreadCount: 0,
      extractedPhone: "",
      extractedTelegram: "",
      extractedWhatsApp: "",
      updatedAt: ""
    } as unknown as ReplyInput["conversation"],
    history: [],
    samples: [],
    knowledge: [],
    trainingMaterials: [],
    country: {
      id: "country-1",
      merchantId: "merchant-1",
      name: "巴西",
      code: "BR",
      defaultLanguage: "zh",
      platformRegisterUrl: "https://country-register.example",
      tgRegisterGuideUrl: "",
      requirePlatformAccount: true,
      requirePhone: true,
      requireTelegram: true,
      requireWhatsApp: false,
      status: "active"
    } as unknown as ReplyInput["country"],
    inviteCode: {
      id: 1,
      merchantId: "merchant-1",
      countryId: "country-1",
      countryCode: "BR",
      countryName: "巴西",
      a2cAccountId: 1,
      a2cAccountPhone: "agent-1",
      code: "INV-1",
      registerUrl: "https://country-register.example?code={code}",
      status: "reserved",
      assignedCustomerKey: "customer-1",
      assignedConversationId: "conv-1",
      platformAccount: "",
      assignedAt: "",
      usedAt: "",
      createdAt: "",
      updatedAt: ""
    } as unknown as ReplyInput["inviteCode"],
    ...overrides
  };
}

describe("AI conversation reply task", () => {
  it("normalizes provider JSON and strips customer-visible AI identity claims", async () => {
    const generateText = vi.fn(async () => JSON.stringify({
      reply: "我是AI助手，请继续注册。",
      language: "zh",
      stage: "need_platform_register",
      extractedPhone: "",
      extractedTelegram: "",
      extractedWhatsApp: "",
      shouldHandoff: false
    }));

    const result = await generateConversationReply(config(), replyInput(), { generateText });

    expect(result.reply).not.toMatch(/AI|机器人|自动客服|自动回复/i);
    expect(result.reply).toContain("开户链接和邀请码");
    expect(result.reply).toContain("INV-1");
    expect(result.fallback).toBeUndefined();
    expect(generateText).toHaveBeenCalledWith(expect.any(Object), expect.stringContaining("customerText"), expect.objectContaining({
      temperature: 0.45,
      maxOutputTokens: 900,
      systemInstruction: expect.stringContaining("输出必须是 JSON")
    }));
  });

  it("falls back with the reserved invite code when provider output fails", async () => {
    const result = await generateConversationReply(config(), replyInput(), {
      generateText: vi.fn(async () => {
        throw new Error("provider unavailable");
      })
    });

    expect(result.fallback).toBe(true);
    expect(result.error).toBe("provider unavailable");
    expect(result.reply).toContain("开户链接和邀请码");
    expect(result.reply).toContain("https://country-register.example?code=INV-1");
  });

  it("keeps samples from claiming registration does not need an invite code", async () => {
    const result = await generateConversationReply(config(), replyInput({
      samples: [{
        id: 10,
        customerMessage: "注册链接",
        standardReply: "这个注册链接不需要邀请码。",
        stage: "need_platform_register",
        intent: "ask_link",
        language: "zh",
        keywords: "",
        priority: 10
      }]
    }), {
      generateText: vi.fn(async () => "{")
    });

    expect(result.reply).not.toContain("不需要邀请码");
    expect(result.reply).toContain("INV-1");
  });

  it("removes explicit model identity words from direct sanitizer use", () => {
    expect(sanitizeCustomerVisibleReply("As a robot model, I can help.", "en")).not.toMatch(/robot|model/i);
  });
});
