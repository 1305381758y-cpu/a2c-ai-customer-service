import { describe, expect, it, vi } from "vitest";
import type { A2CClient } from "../src/clients/a2c.js";
import type { AiReply } from "../src/clients/aiReplyTypes.js";
import { loadConfig } from "../src/config.js";
import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";
import { sendAiConversationTextOutbound } from "../src/services/aiConversationTextOutbound.js";
import type { AiConversationReplyContext } from "../src/services/aiConversationReplyContext.js";

function runtimeConfig() {
  return loadConfig({
    DATABASE_URL: ":memory:",
    A2C_BASE_URL: "https://a2c.test",
    A2C_APP_ID: "app",
    A2C_APP_SECRET: "secret"
  });
}

function setupConversation() {
  const repos = new Repositories(openDb(":memory:"));
  const merchant = repos.createMerchant("AI文本出站商户");
  const country = repos.createMerchantCountry(merchant.id, {
    name: "巴西",
    defaultLanguage: "zh",
    platformRegisterUrl: "https://register.example",
    requirePlatformAccount: true,
    requirePhone: true,
    requireTelegram: true
  });
  const account = repos.syncMerchantA2CAccounts(merchant.id, [{
    apiPhone: "agent-ai-text",
    verifiedName: "客服号"
  }])[0];
  const inviteCode = repos.createInviteCodeForA2CAccount(account.id, {
    code: "AI-CODE",
    registerUrl: "https://register.example/?code={code}",
    status: "reserved"
  }, merchant.id);
  const conversation = repos.getOrCreateConversation("customer-ai-text", "agent-ai-text", "客户", merchant.id, country.id);
  conversation.language = "zh";
  conversation.stage = "need_platform_register";
  repos.updateConversation(conversation);
  const createdSample = repos.createTrainingSample(merchant.id, {
    customerMessage: "如何注册",
    standardReply: "打开链接并输入邀请码。",
    stage: "need_platform_register",
    intent: "ask_platform_register",
    language: "zh",
    keywords: "注册",
    priority: 10,
    enabled: true
  }, country.id);
  const [sample] = repos.listTrainingSamples({
    merchantId: merchant.id,
    countryId: country.id,
    enabled: true
  }).filter((item) => item.id === createdSample.id);
  const material = repos.createTrainingMaterial({
    merchantId: merchant.id,
    countryId: country.id,
    filename: "话本.txt",
    mimeType: "text/plain",
    sourceType: "txt",
    rawText: "注册说明",
    warnings: []
  });
  repos.addTrainingMaterialItem({
    materialId: material.id,
    merchantId: merchant.id,
    countryId: country.id,
    kind: "knowledge",
    title: "注册说明",
    content: "注册时请按页面提示输入邀请码。",
    intent: "ask_platform_register",
    stage: "need_platform_register",
    language: "zh",
    enabled: true
  });
  const [materialItem] = repos.listTrainingMaterialSnippets(merchant.id, 10, country.id);
  return {
    repos,
    merchant,
    country,
    inviteCode,
    conversation,
    sample,
    material,
    materialItem,
    agentProfile: repos.getMerchantAgentProfile(merchant.id)
  };
}

describe("AI conversation text outbound module", () => {
  it("records AI text replies with context debug payload in simulation", async () => {
    const context = setupConversation();
    const a2c = { sendMessage: vi.fn(async () => "real-message-id") } as unknown as A2CClient;
    const aiReply: AiReply = {
      reply: "请打开链接注册，完成后把手机号发我。",
      language: "zh",
      stage: "need_platform_register",
      extractedPhone: "",
      extractedTelegram: "",
      extractedWhatsApp: "",
      shouldHandoff: false
    };
    const replyContext = {
      shouldIncludeRegistrationDetails: true,
      inviteCode: context.inviteCode,
      samples: [context.sample],
      knowledge: [],
      trainingMaterials: [context.materialItem],
      history: [],
      replyInput: {} as never
    } satisfies AiConversationReplyContext;

    const outbound = await sendAiConversationTextOutbound({
      repos: context.repos,
      runtimeConfig: runtimeConfig(),
      a2c,
      conversation: context.conversation,
      country: context.country,
      aiReply,
      replyContext,
      agentProfile: context.agentProfile,
      data: {
        messageId: "inbound-ai-text",
        content: "如何注册",
        from: "customer-ai-text",
        to: "agent-ai-text",
        msgType: "text",
        timestamp: 1783010000
      },
      payloadId: "payload-ai-text",
      simulation: true,
      strictFlowEnabled: false,
      learnedIntent: { id: 1, suggestedIntent: "ask_platform_register", displayName: "询问注册", score: 0.9 }
    });

    expect(a2c.sendMessage).not.toHaveBeenCalled();
    expect(outbound.sendResult.a2cSendStatus).toBe("simulated");
    const message = context.repos.listConversationMessages(context.conversation.id, 10)
      .find((row) => row.direction === "outbound");
    expect(message?.rawPayload).toMatchObject({
      replyMode: "ai",
      strictFlowEnabled: false,
      samples: [context.sample.id],
      trainingMaterials: [context.materialItem.id],
      a2cSendStatus: "simulated",
      assignedInviteCode: expect.objectContaining({ code: "AI-CODE" })
    });
    const memory = context.repos.getCustomerMemoryByConversation(context.conversation.id);
    const recentSignals = memory?.facts.recentSignals as Array<{ content: string }> | undefined;
    expect(recentSignals?.map((signal) => signal.content).join("\n")).toContain("请打开链接注册");
  });
});
