import { describe, expect, it } from "vitest";
import { mapConversation, mapConversationExportRecord, mapConversationMessage, mapCustomerMemory } from "../src/repositoryConversationMappers.js";

describe("repositoryConversationMappers", () => {
  it("maps conversations with country and handoff defaults", () => {
    expect(mapConversation({
      id: "c1",
      merchant_id: "m1",
      customer_phone: "5511",
      a2c_account_phone: "a2c"
    })).toMatchObject({
      id: "c1",
      merchantId: "m1",
      countryId: "m1:default",
      countryName: "默认国家",
      customerPhone: "5511",
      a2cAccountPhone: "a2c",
      stage: "need_platform_register",
      status: "active",
      handoffStatus: "pending"
    });
  });

  it("maps messages and exported content from raw payload", () => {
    expect(mapConversationMessage({
      id: 12,
      direction: "outbound",
      raw_payload: "{\"replyMode\":\"strict_flow\"}"
    })).toMatchObject({
      id: 12,
      direction: "outbound",
      rawPayload: { replyMode: "strict_flow" }
    });

    expect(mapConversationExportRecord({
      raw_payload: "{\"originalContent\":\"Hola\",\"translatedContent\":\"你好\",\"replyMode\":\"strict_flow\"}",
      content: "Hola"
    })).toMatchObject({
      originalContent: "Hola",
      translatedContent: "你好",
      replyMode: "strict_flow"
    });
  });

  it("maps customer memory facts safely", () => {
    expect(mapCustomerMemory({
      id: 3,
      merchant_id: "m1",
      customer_key: "customer-1",
      facts_json: "{\"lastQuestion\":\"Telegram是什么\"}"
    })).toMatchObject({
      id: 3,
      merchantId: "m1",
      countryId: "m1:default",
      facts: { lastQuestion: "Telegram是什么" }
    });
  });
});
