import { describe, expect, it, vi } from "vitest";
import {
  buildCustomerConversationsUrl,
  buildCustomersUrl,
  deleteCustomer,
  loadCustomerConversations,
  loadCustomers
} from "../frontend/src/customers/customersApi.js";
import type { Customer } from "../frontend/src/types.js";

const customer: Customer = {
  id: 1,
  merchantId: "merchant-1",
  countryId: "country-1",
  countryCode: "BR",
  countryName: "巴西",
  customerKey: "5511913586749",
  nickname: "张三",
  firstA2CAccountPhone: "agent-1",
  lastA2CAccountPhone: "agent-2",
  language: "pt",
  stage: "wait_registration",
  extractedPhone: "",
  extractedTelegram: "",
  extractedWhatsApp: "",
  status: "active",
  conversationCount: 2,
  lastConversationId: "conversation-2",
  firstSeenAt: "",
  lastSeenAt: ""
};

describe("customers API helpers", () => {
  it("builds scoped customer list URLs", () => {
    expect(buildCustomersUrl(false, {
      merchantId: "ignored",
      countryId: "country-1",
      status: "active",
      language: "pt",
      limit: "50000"
    })).toBe("/api/merchant/customers?countryId=country-1&status=active&language=pt&limit=50000");

    expect(buildCustomersUrl(true, {
      merchantId: "merchant-1",
      countryId: "country-1",
      status: "active",
      language: "pt",
      limit: "50000"
    })).toBe("/api/admin/customers?merchantId=merchant-1&countryId=country-1&status=active&language=pt&limit=50000");
  });

  it("builds customer conversation history URLs", () => {
    expect(buildCustomerConversationsUrl(false, customer)).toBe("/api/merchant/conversations?customerPhone=5511913586749&limit=50000");
    expect(buildCustomerConversationsUrl(true, customer)).toBe("/api/admin/conversations?merchantId=merchant-1&customerPhone=5511913586749&limit=50000");
  });

  it("loads customers and conversation history rows", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ rows: [customer] }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ rows: [{ id: "conversation-1", customerPhone: customer.customerKey }] }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(loadCustomers("/api/merchant/customers")).resolves.toEqual([customer]);
    await expect(loadCustomerConversations("/api/merchant/conversations?customerPhone=5511913586749")).resolves.toEqual([
      { id: "conversation-1", customerPhone: customer.customerKey }
    ]);

    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/merchant/customers", { headers: {} });
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/merchant/conversations?customerPhone=5511913586749", { headers: {} });
    fetcher.mockRestore();
  });

  it("deletes customers through merchant or platform scoped routes", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ conversationsDeleted: 2, messagesDeleted: 9 }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ conversationsDeleted: 1, messagesDeleted: 4 }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(deleteCustomer(false, customer)).resolves.toEqual({ conversationsDeleted: 2, messagesDeleted: 9 });
    await expect(deleteCustomer(true, customer)).resolves.toEqual({ conversationsDeleted: 1, messagesDeleted: 4 });

    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/merchant/customers/5511913586749", expect.objectContaining({ method: "DELETE" }));
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/admin/customers/5511913586749?merchantId=merchant-1", expect.objectContaining({ method: "DELETE" }));
    fetcher.mockRestore();
  });
});
