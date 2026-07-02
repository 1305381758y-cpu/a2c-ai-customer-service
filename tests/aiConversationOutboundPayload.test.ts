import { describe, expect, it } from "vitest";
import type { AiReply } from "../src/clients/aiReplyTypes.js";
import type { TrainingSampleForSearch } from "../src/domain/sampleRetrieval.js";
import type { A2CInviteCodeRecord, MerchantAgentProfileRecord, MerchantCountryRecord, TrainingMaterialItemRecord } from "../src/repositories.js";
import { buildAiConversationOutboundRawPayload } from "../src/services/aiConversationOutboundPayload.js";

function aiReply(overrides: Partial<AiReply> = {}): AiReply {
  return {
    reply: "请继续注册",
    language: "zh",
    stage: "need_platform_register",
    extractedPhone: "",
    extractedTelegram: "",
    extractedWhatsApp: "",
    shouldHandoff: false,
    ...overrides
  };
}

function agentProfile(): MerchantAgentProfileRecord {
  return {
    merchantId: "merchant-1",
    agentName: "接待专员",
    roleDefinition: "",
    toneStyle: "",
    coreGoal: "",
    mustFollow: "",
    forbidden: "",
    uncertaintyPolicy: "",
    handoffPolicy: "",
    enabled: true,
    createdAt: "",
    updatedAt: ""
  };
}

function country(overrides: Partial<MerchantCountryRecord> = {}): MerchantCountryRecord {
  return {
    id: "country-1",
    merchantId: "merchant-1",
    code: "BR",
    name: "巴西",
    defaultLanguage: "pt-BR",
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

function sample(id: number): TrainingSampleForSearch {
  return {
    id,
    customerMessage: "如何注册",
    standardReply: "请按链接注册",
    stage: "need_platform_register",
    intent: "ask_platform_register",
    language: "zh",
    keywords: "注册",
    priority: 10
  };
}

function material(id: number): TrainingMaterialItemRecord {
  return {
    id,
    materialId: 20,
    merchantId: "merchant-1",
    countryId: "country-1",
    kind: "knowledge",
    sampleId: null,
    knowledgeId: 30,
    title: "注册话术",
    content: "注册步骤",
    intent: "ask_platform_register",
    stage: "need_platform_register",
    language: "zh",
    enabled: true
  };
}

function inviteCode(): A2CInviteCodeRecord {
  return {
    id: 9,
    merchantId: "merchant-1",
    countryId: "country-1",
    countryCode: "BR",
    countryName: "巴西",
    a2cAccountId: 11,
    a2cAccountPhone: "agent-1",
    code: "INV-9",
    registerUrl: "https://register.example/?code=INV-9",
    status: "reserved",
    assignedCustomerKey: "customer-1",
    assignedConversationId: "conversation-1",
    platformAccount: "",
    assignedAt: "",
    usedAt: "",
    createdAt: "",
    updatedAt: ""
  };
}

describe("AI conversation outbound payload builder", () => {
  it("centralizes AI reply debug fields for recorded outbound messages", () => {
    const payload = buildAiConversationOutboundRawPayload({
      aiReply: aiReply(),
      strictFlowEnabled: false,
      agentProfile: agentProfile(),
      learnedIntent: { id: 5, suggestedIntent: "ask_platform_register", displayName: "询问注册", score: 0.8 },
      samples: [sample(1), sample(2)],
      trainingMaterials: [material(10)],
      country: country(),
      inviteCode: inviteCode()
    });

    expect(payload).toMatchObject({
      replyMode: "ai",
      strictFlowEnabled: false,
      agentProfileName: "接待专员",
      learnedIntent: { id: 5, suggestedIntent: "ask_platform_register" },
      samples: [1, 2],
      trainingMaterials: [10],
      aiFallback: false,
      aiError: "",
      inviteCodeRequired: true,
      inviteCodeMissing: false,
      assignedInviteCode: {
        id: 9,
        code: "INV-9",
        registerUrl: "https://register.example/?code=INV-9",
        status: "reserved"
      }
    });
  });

  it("marks fallback replies and missing invite codes without exposing undefined values", () => {
    const payload = buildAiConversationOutboundRawPayload({
      aiReply: aiReply({ fallback: true, error: "provider unavailable" }),
      strictFlowEnabled: true,
      agentProfile: agentProfile(),
      learnedIntent: null,
      samples: [],
      trainingMaterials: [],
      country: country(),
      inviteCode: undefined
    });

    expect(payload).toMatchObject({
      replyMode: "fallback",
      strictFlowEnabled: true,
      learnedIntent: null,
      samples: [],
      trainingMaterials: [],
      aiFallback: true,
      aiError: "provider unavailable",
      inviteCodeRequired: true,
      inviteCodeMissing: true,
      assignedInviteCode: null
    });
  });
});
