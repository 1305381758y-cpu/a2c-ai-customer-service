import { describe, expect, it, vi } from "vitest";
import type { ReplyInput } from "../src/clients/aiReplyTypes.js";
import { loadConfig } from "../src/config.js";
import { openDb } from "../src/db.js";
import type { AiConversationReplyContext } from "../src/services/aiConversationReplyContext.js";
import { Repositories } from "../src/repositories.js";
import { generateAiConversationReplyDraft } from "../src/services/aiConversationReplyGeneration.js";

function runtimeConfig() {
  return loadConfig({
    DATABASE_URL: ":memory:",
    PLATFORM_REGISTER_URL: "https://fallback.example/register"
  });
}

function setupContext(shouldIncludeRegistrationDetails: boolean) {
  const repos = new Repositories(openDb(":memory:"));
  const merchant = repos.createMerchant("AI回复生成商户");
  const country = repos.createMerchantCountry(merchant.id, {
    name: "巴西",
    defaultLanguage: "zh",
    platformRegisterUrl: "https://register.example/?code={code}",
    requirePlatformAccount: true,
    requirePhone: true,
    requireTelegram: true
  });
  const conversation = repos.getOrCreateConversation("customer-generation", "agent-generation", "客户", merchant.id, country.id);
  conversation.language = "zh";
  conversation.stage = "need_platform_register";
  repos.updateConversation(conversation);
  const replyInput = {
    customerText: "你好",
    conversation,
    history: [],
    samples: [],
    knowledge: [],
    trainingMaterials: [],
    country,
    agentProfile: repos.getMerchantAgentProfile(merchant.id)
  } satisfies ReplyInput;
  const replyContext = {
    shouldIncludeRegistrationDetails,
    samples: [],
    knowledge: [],
    trainingMaterials: [],
    history: [],
    replyInput
  } satisfies AiConversationReplyContext;
  return { conversation, country, replyContext };
}

describe("AI conversation reply generation", () => {
  it("removes registration links and invite codes when the current turn is not allowed to send them", async () => {
    const context = setupContext(false);
    const ai = {
      generateReply: vi.fn(async () => ({
        reply: "请打开注册链接：https://register.example/?code=INV123 邀请码：INV123。完成后告诉我。",
        language: "zh",
        stage: "need_platform_register",
        extractedPhone: "",
        extractedTelegram: "",
        extractedWhatsApp: "",
        shouldHandoff: false
      }))
    };

    const reply = await generateAiConversationReplyDraft({
      ai,
      runtimeConfig: runtimeConfig(),
      ...context
    });

    expect(reply.reply).not.toContain("https://register.example");
    expect(reply.reply).not.toContain("INV123");
    expect(reply.reply).toContain("完成后告诉我");
  });

  it("preserves registration details when the current turn allows them", async () => {
    const context = setupContext(true);
    const ai = {
      generateReply: vi.fn(async () => ({
        reply: "开户链接：https://register.example/?code=INV456 邀请码：INV456",
        language: "zh",
        stage: "need_platform_register",
        extractedPhone: "",
        extractedTelegram: "",
        extractedWhatsApp: "",
        shouldHandoff: false
      }))
    };

    const reply = await generateAiConversationReplyDraft({
      ai,
      runtimeConfig: runtimeConfig(),
      ...context
    });

    expect(reply.reply).toContain("https://register.example/?code=INV456");
    expect(reply.reply).toContain("邀请码：INV456");
  });
});
