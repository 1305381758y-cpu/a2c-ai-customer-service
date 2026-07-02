import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import type { MessageAnalysis } from "../src/domain/analyzer.js";
import { Repositories } from "../src/repositories.js";
import { buildAiConversationReplyContext } from "../src/services/aiConversationReplyContext.js";

function analysis(overrides: Partial<MessageAnalysis> = {}): MessageAnalysis {
  return {
    intent: "ask_link",
    language: "zh",
    stage: "need_platform_register",
    phone: "",
    telegram: "",
    whatsapp: "",
    ...overrides
  };
}

function setup() {
  const repos = new Repositories(openDb(":memory:"));
  const merchant = repos.createMerchant("AI上下文商户");
  const country = repos.createMerchantCountry(merchant.id, {
    name: "巴西",
    defaultLanguage: "zh",
    platformRegisterUrl: "https://register.example",
    requirePlatformAccount: true,
    requirePhone: true,
    requireTelegram: true
  });
  const account = repos.syncMerchantA2CAccounts(merchant.id, [{
    apiPhone: "agent-ai",
    verifiedName: "客服号"
  }])[0];
  repos.createInviteCodeForA2CAccount(account.id, {
    code: "INV-CONTEXT",
    registerUrl: "https://register.example/?code={code}",
    status: "available"
  }, merchant.id);
  const conversation = repos.getOrCreateConversation("customer-ai", "agent-ai", "客户", merchant.id, country.id);
  conversation.language = "zh";
  conversation.stage = "need_platform_register";
  repos.updateConversation(conversation);
  const sample = repos.createTrainingSample(merchant.id, {
    customerMessage: "注册链接怎么打开",
    standardReply: "请复制链接到浏览器打开。",
    stage: "need_platform_register",
    intent: "ask_link",
    language: "zh",
    keywords: "注册链接 打开",
    priority: 12,
    enabled: true
  }, country.id);
  const disabledSample = repos.createTrainingSample(merchant.id, {
    customerMessage: "禁用样本",
    standardReply: "不应出现",
    stage: "need_platform_register",
    intent: "ask_link",
    language: "zh",
    keywords: "注册链接",
    priority: 99,
    enabled: false
  }, country.id);
  const knowledge = repos.createKnowledgeItem(merchant.id, {
    countryId: country.id,
    title: "注册规则",
    content: "注册需要手机号。",
    type: "rule",
    language: "zh",
    enabled: true
  });
  const memory = repos.updateCustomerMemoryFromMessage(conversation, {
    intent: "ask_link",
    content: "注册链接怎么打开",
    direction: "inbound"
  });
  return { repos, merchant, country, conversation, sample, disabledSample, knowledge, memory };
}

describe("AI conversation reply context builder", () => {
  it("loads ranked merchant context and reserves an invite code only when registration details are allowed", () => {
    const context = setup();
    const result = buildAiConversationReplyContext({
      repos: context.repos,
      conversation: context.conversation,
      country: context.country,
      analysis: analysis(),
      customerText: "请发我注册链接，我要打开注册",
      inboundMemory: context.memory,
      agentProfile: context.repos.getMerchantAgentProfile(context.merchant.id)
    });

    expect(result.shouldIncludeRegistrationDetails).toBe(true);
    expect(result.inviteCode).toMatchObject({ code: "INV-CONTEXT", status: "reserved" });
    expect(result.samples.map((item) => item.id)).toContain(context.sample.id);
    expect(result.samples.map((item) => item.id)).not.toContain(context.disabledSample.id);
    expect(result.knowledge.map((item) => item.id)).toContain(context.knowledge.id);
    expect(result.replyInput).toMatchObject({
      customerText: "请发我注册链接，我要打开注册",
      conversation: { id: context.conversation.id },
      memory: { id: context.memory.id },
      country: { id: context.country.id },
      inviteCode: { code: "INV-CONTEXT" }
    });
  });

  it("keeps invite details out of the reply input for non-registration messages", () => {
    const context = setup();
    const result = buildAiConversationReplyContext({
      repos: context.repos,
      conversation: context.conversation,
      country: context.country,
      analysis: analysis({ intent: "trust_concern" }),
      customerText: "这个安全吗",
      inboundMemory: context.memory,
      agentProfile: context.repos.getMerchantAgentProfile(context.merchant.id)
    });

    expect(result.shouldIncludeRegistrationDetails).toBe(false);
    expect(result.inviteCode).toBeUndefined();
    expect(result.replyInput.inviteCode).toBeUndefined();
  });
});
