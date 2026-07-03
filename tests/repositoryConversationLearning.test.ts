import { describe, expect, it } from "vitest";
import { buildConversationLearningSample } from "../src/repositoryConversationLearning.js";
import type { Conversation, MessageInput } from "../src/repositoryTypes.js";

const conversation: Conversation = {
  id: "conversation-1",
  merchantId: "merchant-1",
  countryId: "country-1",
  countryCode: "BR",
  countryName: "巴西",
  customerPhone: "551199999",
  a2cAccountPhone: "a2c-1",
  nickname: "客户A",
  language: "pt-BR",
  stage: "need_platform_register",
  flowStep: "wait_registration",
  extractedPhone: "",
  extractedTelegram: "",
  extractedWhatsApp: "",
  status: "active",
  handoffStatus: "pending",
  handoffNotified: 0,
  unreadCount: 0
};

const outbound: MessageInput = {
  conversationId: conversation.id,
  direction: "outbound",
  content: "Abra o link e use o código de convite.",
  msgType: "text",
  language: "pt-BR",
  intent: "ask_platform_register"
};

describe("repositoryConversationLearning", () => {
  it("builds a stable training sample from the latest inbound and outbound reply", () => {
    expect(buildConversationLearningSample(conversation, {
      id: 7,
      content: "Como faço o cadastro?",
      language: "pt-BR",
      intent: "need_help"
    }, outbound)).toEqual({
      marker: "conversation_sample:conversation-1:7",
      keywords: "conversation_sample:conversation-1:7,真实对话,自动沉淀,a2c-1,551199999",
      customerMessage: "Como faço o cadastro?",
      standardReply: "Abra o link e use o código de convite.",
      language: "pt-BR",
      intent: "need_help",
      stage: "need_platform_register"
    });
  });

  it("falls back to outbound and conversation metadata when inbound fields are missing", () => {
    expect(buildConversationLearningSample(conversation, {
      id: 8,
      content: "OK"
    }, outbound)).toMatchObject({
      language: "pt-BR",
      intent: "ask_platform_register"
    });
  });

  it("skips samples with too little customer or reply text", () => {
    expect(buildConversationLearningSample(conversation, {
      id: 9,
      content: "?"
    }, outbound)).toBeUndefined();
    expect(buildConversationLearningSample(conversation, {
      id: 10,
      content: "Como?"
    }, {
      ...outbound,
      content: " "
    })).toBeUndefined();
  });
});
