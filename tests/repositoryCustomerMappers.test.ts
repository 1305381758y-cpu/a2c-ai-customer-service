import { describe, expect, it } from "vitest";
import { mapCustomer } from "../src/repositoryCustomerMappers.js";

describe("repositoryCustomerMappers", () => {
  it("maps customers with country and lifecycle fallbacks", () => {
    expect(mapCustomer({
      id: 7,
      merchant_id: "m1",
      customer_key: "5511999",
      nickname: "Ana",
      first_a2c_account_phone: "1001",
      last_a2c_account_phone: "1002",
      extracted_phone: "5511888",
      conversation_count: 3
    })).toEqual({
      id: 7,
      merchantId: "m1",
      countryId: "m1:default",
      countryCode: "default",
      countryName: "默认国家",
      customerKey: "5511999",
      nickname: "Ana",
      firstA2CAccountPhone: "1001",
      lastA2CAccountPhone: "1002",
      language: "unknown",
      stage: "need_platform_register",
      extractedPhone: "5511888",
      extractedTelegram: "",
      extractedWhatsApp: "",
      status: "active",
      conversationCount: 3,
      lastConversationId: "",
      firstSeenAt: "",
      lastSeenAt: ""
    });
  });
});
