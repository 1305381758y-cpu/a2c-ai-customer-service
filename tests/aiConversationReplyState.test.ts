import { describe, expect, it } from "vitest";
import type { AiReply } from "../src/clients/aiReplyTypes.js";
import type { Conversation, MerchantCountryRecord } from "../src/repositories.js";
import { applyAiReplyConversationState } from "../src/services/aiConversationReplyState.js";

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "conversation-1",
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
    updatedAt: "",
    ...overrides
  } as Conversation;
}

function country(overrides: Partial<MerchantCountryRecord> = {}): MerchantCountryRecord {
  return {
    id: "country-1",
    merchantId: "merchant-1",
    code: "BR",
    name: "巴西",
    defaultLanguage: "zh",
    platformRegisterUrl: "https://register.example",
    tgRegisterGuideUrl: "",
    requirePlatformAccount: true,
    requirePhone: true,
    requireTelegram: true,
    requireWhatsApp: false,
    status: "active",
    ...overrides
  };
}

function aiReply(overrides: Partial<AiReply> = {}): AiReply {
  return {
    reply: "收到",
    language: "zh",
    stage: "need_platform_register",
    extractedPhone: "",
    extractedTelegram: "",
    extractedWhatsApp: "",
    shouldHandoff: false,
    ...overrides
  };
}

describe("AI conversation reply state", () => {
  it("fills missing contact details without overwriting existing customer memory", () => {
    const conv = conversation({ extractedPhone: "old-phone" });
    const result = applyAiReplyConversationState({
      conversation: conv,
      country: country(),
      aiReply: aiReply({
        language: "es",
        extractedPhone: "new-phone",
        extractedTelegram: "@cliente"
      }),
      fallbackLanguage: "zh"
    });

    expect(conv.extractedPhone).toBe("old-phone");
    expect(conv.extractedTelegram).toBe("@cliente");
    expect(conv.language).toBe("es");
    expect(result).toEqual({ readyForHandoff: true, handoffLanguage: "es" });
  });

  it("marks handoff when the AI reply stage explicitly says ready even before all contacts are present", () => {
    const conv = conversation();
    const result = applyAiReplyConversationState({
      conversation: conv,
      country: country(),
      aiReply: aiReply({ language: "", stage: "ready_for_handoff" }),
      fallbackLanguage: "pt-BR"
    });

    expect(result).toEqual({ readyForHandoff: true, handoffLanguage: "pt-BR" });
  });

  it("waits when required contact details are still missing", () => {
    const conv = conversation({ extractedPhone: "13800138000" });
    const result = applyAiReplyConversationState({
      conversation: conv,
      country: country(),
      aiReply: aiReply(),
      fallbackLanguage: "zh"
    });

    expect(result.readyForHandoff).toBe(false);
  });
});
