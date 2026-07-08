import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import type { MessageAnalysis } from "../src/domain/analyzer.js";
import type { StrictContextualIntent } from "../src/domain/strictFlow.js";
import type {
  Conversation,
  CustomerMemoryRecord,
  MerchantAgentProfileRecord,
  MerchantConfigRecord,
  MerchantCountryRecord,
  MerchantRecord,
  Repositories
} from "../src/repositories.js";
import { respondToInboundTurn } from "../src/services/inboundTurnResponder.js";

const runtimeConfig = loadConfig({ DATABASE_URL: ":memory:" });

const merchant: MerchantRecord = { id: "merchant-1", name: "商户", status: "active" };

function merchantConfig(overrides: Partial<MerchantConfigRecord> = {}): MerchantConfigRecord {
  return {
    merchantId: "merchant-1",
    a2cBaseUrl: "",
    a2cAppId: "",
    a2cAppSecret: "",
    a2cAccountPhone: "",
    openaiApiKey: "",
    openaiModel: "",
    aiProvider: "gemini",
    minimaxApiKey: "",
    minimaxModel: "",
    deepseekApiKey: "",
    deepseekModel: "",
    googleAiApiKey: "",
    googleAiModel: "",
    telegramBotToken: "",
    telegramHandoffChatId: "",
    telegramHandoffChatTitle: "",
    telegramHandoffChatStatus: "unbound",
    telegramHandoffChatError: "",
    a2cTokenCacheKey: "",
    a2cAccessToken: "",
    a2cTokenExpiresAt: 0,
    a2cAuthBlockedUntil: 0,
    smartReplyEnabled: true,
    trainingSimulationEnabled: false,
    strictScriptFlowEnabled: true,
    platformRegisterUrl: "",
    tgRegisterGuideUrl: "",
    registrationTutorialImageUrl: "",
    ...overrides
  };
}

const country: MerchantCountryRecord = {
  id: "country-1",
  merchantId: "merchant-1",
  code: "BR",
  name: "巴西",
  defaultLanguage: "zh",
  platformRegisterUrl: "",
  tgRegisterGuideUrl: "",
  requirePlatformAccount: true,
  requirePhone: true,
  requireTelegram: true,
  requireWhatsApp: false,
  status: "active"
};

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "conversation-1",
    merchantId: "merchant-1",
    countryId: "country-1",
    countryCode: "BR",
    countryName: "巴西",
    customerPhone: "customer-1",
    a2cAccountPhone: "agent-1",
    nickname: "客户",
    language: "zh",
    stage: "need_platform_register",
    flowStep: "interest_screening",
    extractedPhone: "",
    extractedTelegram: "",
    extractedWhatsApp: "",
    status: "active",
    handoffStatus: "pending",
    handoffNotified: 0,
    unreadCount: 0,
    ...overrides
  };
}

const analysis: MessageAnalysis = {
  intent: "greeting",
  language: "zh",
  stage: "need_platform_register",
  phone: "",
  telegram: "",
  whatsapp: ""
};

const contextualIntent: StrictContextualIntent = {
  intent: "positive_confirmation",
  answeredPreviousQuestion: true,
  isSubmission: false,
  isQuestion: false,
  shouldPause: false,
  questionType: "none",
  nextAction: "continue",
  reason: "rule",
  source: "rule"
};

function baseInput(overrides: Partial<Parameters<typeof respondToInboundTurn>[0]> = {}): Parameters<typeof respondToInboundTurn>[0] {
  const repos = {
    updateConversation: vi.fn(),
    upsertCustomerFromConversation: vi.fn()
  } as unknown as Repositories;
  return {
    repos,
    ai: {} as never,
    runtimeConfig,
    merchant,
    merchantConfig: merchantConfig(),
    country,
    conversation: conversation(),
    analysis,
    customerTextForAi: "是的",
    inboundMemory: { id: 1 } as CustomerMemoryRecord,
    agentProfile: { agentName: "客服" } as MerchantAgentProfileRecord,
    a2c: { sendMessage: vi.fn() } as never,
    telegram: { sendHandoffMessage: vi.fn() },
    data: {
      messageId: "incoming-1",
      content: "是的",
      from: "customer-1",
      to: "agent-1",
      msgType: "text",
      timestamp: 1783010000
    },
    payloadId: "payload-1",
    simulation: false,
    strictFlowEnabled: true,
    inferredIntent: "positive_confirmation",
    contextualIntent,
    learnedIntentDebug: null,
    historyForIntent: [],
    ...overrides
  };
}

describe("inboundTurnResponder", () => {
  it("does not reply again after a conversation is already in handoff", async () => {
    const input = baseInput({ conversation: conversation({ status: "human_handoff" }) });
    const strictFlowReply = vi.fn();
    const aiReply = vi.fn();

    await expect(respondToInboundTurn(input, { strictFlowReply: strictFlowReply as never, aiReply: aiReply as never })).resolves.toEqual({
      status: "already_handoff",
      conversationId: "conversation-1"
    });

    expect(input.repos.updateConversation).toHaveBeenCalledWith(input.conversation);
    expect(input.repos.upsertCustomerFromConversation).toHaveBeenCalledWith(input.conversation);
    expect(strictFlowReply).not.toHaveBeenCalled();
    expect(aiReply).not.toHaveBeenCalled();
  });

  it("stops before reply generation when smart replies are disabled outside simulation", async () => {
    const input = baseInput({ merchantConfig: merchantConfig({ smartReplyEnabled: false }) });
    const strictFlowReply = vi.fn();
    const aiReply = vi.fn();

    await expect(respondToInboundTurn(input, { strictFlowReply: strictFlowReply as never, aiReply: aiReply as never })).resolves.toEqual({
      status: "auto_reply_disabled",
      conversationId: "conversation-1"
    });

    expect(strictFlowReply).not.toHaveBeenCalled();
    expect(aiReply).not.toHaveBeenCalled();
  });

  it("uses strict flow before ordinary AI replies", async () => {
    const input = baseInput();
    const strictFlowReply = vi.fn(async () => ({ handled: true, status: "strict_flow_replied", conversationId: "conversation-1" }));
    const aiReply = vi.fn();

    await expect(respondToInboundTurn(input, { strictFlowReply: strictFlowReply as never, aiReply: aiReply as never })).resolves.toEqual({
      status: "strict_flow_replied",
      conversationId: "conversation-1"
    });

    expect(strictFlowReply).toHaveBeenCalledWith(expect.objectContaining({
      merchant,
      conversation: input.conversation,
      customerText: "是的",
      strictFlowEnabled: true
    }));
    expect(aiReply).not.toHaveBeenCalled();
  });

  it("falls back to ordinary AI when strict flow does not handle the turn", async () => {
    const input = baseInput();
    const strictFlowReply = vi.fn(async () => ({ handled: false, status: "not_strict_flow", conversationId: "conversation-1" }));
    const aiReply = vi.fn(async () => ({ status: "replied", conversationId: "conversation-1" }));

    await expect(respondToInboundTurn(input, { strictFlowReply: strictFlowReply as never, aiReply: aiReply as never })).resolves.toEqual({
      status: "replied",
      conversationId: "conversation-1"
    });

    expect(strictFlowReply).toHaveBeenCalledOnce();
    expect(aiReply).toHaveBeenCalledWith(expect.objectContaining({
      conversation: input.conversation,
      inboundMemory: input.inboundMemory,
      strictFlowEnabled: true
    }));
  });
});
