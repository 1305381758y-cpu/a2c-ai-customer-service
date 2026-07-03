import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import {
  getCustomerMemory,
  patchCustomerMemory,
  updateCustomerMemoryFromMessage
} from "../src/repositoryCustomerMemory.js";
import { Repositories } from "../src/repositories.js";

function setup() {
  const db = openDb(":memory:");
  const repos = new Repositories(db);
  const merchant = repos.createMerchant("记忆商户");
  const country = repos.createMerchantCountry(merchant.id, {
    name: "巴西",
    code: "BR",
    defaultLanguage: "pt-BR"
  });
  const conversation = repos.getOrCreateConversation("551199999", "a2c-1", "客户A", merchant.id, country.id);
  return { db, conversation };
}

describe("repositoryCustomerMemory", () => {
  it("creates memory facts from conversation messages", () => {
    const { db, conversation } = setup();

    const memory = updateCustomerMemoryFromMessage(db, conversation, {
      intent: "ask_platform_register",
      content: "Como faço o cadastro?",
      direction: "inbound"
    });

    expect(memory).toMatchObject({
      merchantId: conversation.merchantId,
      countryId: conversation.countryId,
      customerKey: conversation.customerPhone,
      lastIntent: "ask_platform_register"
    });
    expect(memory.facts).toMatchObject({
      customerPhone: "551199999",
      a2cAccountPhone: "a2c-1",
      nickname: "客户A",
      lastMessage: "Como faço o cadastro?"
    });
    expect(memory.facts.recentSignals).toEqual([
      expect.objectContaining({
        direction: "inbound",
        intent: "ask_platform_register",
        content: "Como faço o cadastro?"
      })
    ]);
  });

  it("patches operator notes and preserves last intent for unknown outbound messages", () => {
    const { db, conversation } = setup();
    updateCustomerMemoryFromMessage(db, conversation, {
      intent: "trust_concern",
      content: "Isso é seguro?",
      direction: "inbound"
    });

    const patched = patchCustomerMemory(db, conversation, {
      operatorNotes: "客户担心安全，需要人工温和解释",
      facts: { manualFlag: true }
    });
    expect(patched).toEqual(expect.objectContaining({
      lastIntent: "trust_concern",
      operatorNotes: "客户担心安全，需要人工温和解释",
      facts: { manualFlag: true }
    }));
    expect(patched?.summary).toContain("人工备注: 客户担心安全，需要人工温和解释");

    const afterOutbound = updateCustomerMemoryFromMessage(db, conversation, {
      intent: "unknown",
      content: "我来帮您看一下。",
      direction: "outbound"
    });
    expect(afterOutbound.lastIntent).toBe("trust_concern");
    expect(afterOutbound.operatorNotes).toBe("客户担心安全，需要人工温和解释");
    expect(getCustomerMemory(db, conversation.merchantId, conversation.countryId, conversation.customerPhone)?.lastIntent).toBe("trust_concern");
  });
});
