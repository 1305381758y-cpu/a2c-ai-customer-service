import { describe, expect, it, vi } from "vitest";
import {
  loadUnreadSummary,
  markAllConversationsRead,
  markConversationRead,
  setConversationPinned,
  syncMerchantA2CAccounts
} from "../frontend/src/conversations/conversationApi.js";

describe("merchant conversation API helpers", () => {
  it("loads unread summary rows through the shared JSON client", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      rows: [{ a2cAccountPhone: "agent-1", conversationId: "conversation-1", unreadCount: 2 }]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(loadUnreadSummary()).resolves.toEqual([
      { a2cAccountPhone: "agent-1", conversationId: "conversation-1", unreadCount: 2 }
    ]);
    expect(fetcher).toHaveBeenCalledWith("/api/merchant/conversations/unread-summary", { headers: {} });
    fetcher.mockRestore();
  });

  it("marks all conversations read with the selected A2C account scope", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ updated: 3 }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(markAllConversationsRead("agent-1")).resolves.toEqual({ updated: 3 });
    expect(fetcher).toHaveBeenCalledWith("/api/merchant/conversations/read-all", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ a2cAccountPhone: "agent-1" }),
      headers: { "Content-Type": "application/json" }
    }));
    fetcher.mockRestore();
  });

  it("keeps conversation mutations behind focused helpers", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(markConversationRead("conversation-1")).resolves.toBeUndefined();
    await expect(setConversationPinned("conversation-1", true)).resolves.toBeUndefined();
    await expect(syncMerchantA2CAccounts()).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/merchant/conversations/conversation-1/read", expect.objectContaining({
      method: "POST",
      headers: {}
    }));
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/merchant/conversations/conversation-1/pin", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ pinned: true }),
      headers: { "Content-Type": "application/json" }
    }));
    expect(fetcher).toHaveBeenNthCalledWith(3, "/api/merchant/a2c/accounts/sync", expect.objectContaining({
      method: "POST",
      headers: {}
    }));
    fetcher.mockRestore();
  });
});
