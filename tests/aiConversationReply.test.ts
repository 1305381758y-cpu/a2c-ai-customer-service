import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { openDb } from "../src/db.js";
import type { MessageAnalysis } from "../src/domain/analyzer.js";
import type { ReplyInput } from "../src/clients/aiReplyTypes.js";
import { Repositories } from "../src/repositories.js";
import { generateAndRecordAiConversationReply } from "../src/services/aiConversationReply.js";

function config() {
  return loadConfig({
    DATABASE_URL: ":memory:",
    A2C_BASE_URL: "https://a2c.test",
    A2C_APP_ID: "app",
    A2C_APP_SECRET: "secret"
  });
}

function analysis(overrides: Partial<MessageAnalysis> = {}): MessageAnalysis {
  return {
    intent: "ask_platform_register",
    language: "zh",
    stage: "need_platform_register",
    phone: "",
    telegram: "",
    whatsapp: "",
    ...overrides
  };
}

describe("AI conversation reply module", () => {
  it("retrieves merchant context, generates an AI reply and records outbound conversation state", async () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("AI回复商户");
    const country = repos.createMerchantCountry(merchant.id, {
      name: "巴西",
      defaultLanguage: "zh",
      platformRegisterUrl: "https://register.example",
      requirePlatformAccount: true,
      requirePhone: true,
      requireTelegram: true
    });
    const conversation = repos.getOrCreateConversation("customer-ai", "agent-ai", "客户", merchant.id, country.id);
    conversation.language = "zh";
    conversation.stage = "need_platform_register";
    repos.updateConversation(conversation);
    const sample = repos.createTrainingSample(merchant.id, {
      customerMessage: "如何注册",
      standardReply: "请按链接注册。",
      stage: "need_platform_register",
      intent: "ask_platform_register",
      language: "zh",
      keywords: "注册",
      priority: 10,
      enabled: true
    }, country.id);
    const knowledge = repos.createKnowledgeItem(merchant.id, {
      countryId: country.id,
      title: "注册规则",
      content: "注册时需要手机号。",
      type: "rule",
      language: "zh",
      enabled: true
    });
    const memory = repos.updateCustomerMemoryFromMessage(conversation, { intent: "ask_platform_register", content: "如何注册", direction: "inbound" });
    const ai = {
      generateReply: vi.fn(async (_runtimeConfig, input: ReplyInput) => {
        expect(input.samples.map((item) => item.id)).toContain(sample.id);
        expect(input.knowledge.map((item) => item.id)).toContain(knowledge.id);
        expect(input.memory?.id).toBe(memory.id);
        return {
          reply: "您先打开链接注册，完成后把手机号发我。",
          language: "zh",
          stage: "need_platform_register",
          extractedPhone: "",
          extractedTelegram: "",
          extractedWhatsApp: "",
          shouldHandoff: false
        };
      })
    };
    const a2c = { sendMessage: vi.fn(async () => "ai-message-id") };
    const telegram = { sendHandoffMessage: vi.fn<(text: string) => Promise<void>>(async () => undefined) };

    const result = await generateAndRecordAiConversationReply({
      repos,
      ai,
      runtimeConfig: config(),
      conversation,
      country,
      analysis: analysis(),
      customerText: "如何注册",
      inboundMemory: memory,
      agentProfile: repos.getMerchantAgentProfile(merchant.id),
      a2c,
      telegram,
      data: {
        messageId: "incoming-1",
        content: "如何注册",
        from: "customer-ai",
        to: "agent-ai",
        msgType: "text",
        timestamp: 1783010000
      },
      payloadId: "payload-1",
      simulation: false,
      strictFlowEnabled: false,
      learnedIntent: null
    });

    expect(result).toEqual({ status: "replied", conversationId: conversation.id });
    expect(a2c.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      to: "customer-ai",
      senderPhoneNumber: "agent-ai",
      content: "您先打开链接注册，完成后把手机号发我。"
    }));
    const outbound = repos.listConversationMessages(conversation.id, 10).find((message) => message.direction === "outbound");
    expect(outbound?.rawPayload?.replyMode).toBe("ai");
    expect(outbound?.rawPayload?.samples).toEqual(expect.arrayContaining([sample.id]));
    expect(outbound?.rawPayload?.a2cSendStatus).toBe("sent");
  });

  it("completes handoff when AI extracts all required contact details", async () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("AI接管商户");
    const country = repos.createMerchantCountry(merchant.id, {
      name: "巴西",
      defaultLanguage: "zh",
      requirePlatformAccount: true,
      requirePhone: true,
      requireTelegram: true
    });
    const conversation = repos.getOrCreateConversation("customer-complete", "agent-complete", "", merchant.id, country.id);
    conversation.language = "zh";
    repos.updateConversation(conversation);
    const memory = repos.updateCustomerMemoryFromMessage(conversation, { intent: "provide_phone_and_telegram", content: "手机号 13800138000 TG @ok", direction: "inbound" });
    const ai = {
      generateReply: vi.fn(async () => ({
        reply: "收到。",
        language: "zh",
        stage: "ready_for_handoff",
        extractedPhone: "13800138000",
        extractedTelegram: "@ok",
        extractedWhatsApp: "",
        shouldHandoff: true
      }))
    };
    const a2c = { sendMessage: vi.fn(async () => "should-not-send-in-simulation") };
    const telegram = { sendHandoffMessage: vi.fn<(text: string) => Promise<void>>(async () => undefined) };
    const generateReview = vi.fn(async () => undefined);

    const result = await generateAndRecordAiConversationReply({
      repos,
      ai,
      runtimeConfig: config(),
      conversation,
      country,
      analysis: analysis({ intent: "provide_phone_and_telegram", stage: "ready_for_handoff" }),
      customerText: "手机号 13800138000 TG @ok",
      inboundMemory: memory,
      agentProfile: repos.getMerchantAgentProfile(merchant.id),
      a2c,
      telegram,
      data: {
        messageId: "incoming-complete",
        content: "手机号 13800138000 TG @ok",
        from: "customer-complete",
        to: "agent-complete",
        msgType: "text",
        timestamp: 1783010000
      },
      payloadId: "payload-complete",
      simulation: true,
      strictFlowEnabled: false,
      learnedIntent: null,
      generateReview
    });

    expect(result).toEqual({ status: "handoff_simulated", conversationId: conversation.id });
    expect(a2c.sendMessage).not.toHaveBeenCalled();
    expect(telegram.sendHandoffMessage).not.toHaveBeenCalled();
    expect(generateReview).toHaveBeenCalledOnce();
    const stored = repos.getConversation(conversation.id);
    expect(stored?.status).toBe("human_handoff");
    expect(stored?.extractedPhone).toBe("13800138000");
    expect(stored?.extractedTelegram).toBe("@ok");
  });
});
