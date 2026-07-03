import { describe, expect, it, vi } from "vitest";
import {
  applyConversationReviewItem,
  deleteConversation,
  generateConversationReview,
  loadConversationMessages,
  loadConversationReview,
  loadCustomerMemory,
  loadUnreadSummary,
  markAllConversationsRead,
  markConversationRead,
  saveCustomerMemoryNotes,
  sendConversationMessage,
  sendProactiveConversationMessage,
  setConversationPinned,
  syncMerchantA2CAccounts,
  updateConversationHandoffStatus
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

  it("loads conversation detail data from platform or merchant scoped routes", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ rows: [{ id: 1, content: "你好" }] }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 7, operatorNotes: "重点客户" }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ review: null, items: [] }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(loadConversationMessages(true, "conversation-1", 20)).resolves.toEqual([{ id: 1, content: "你好" }]);
    await expect(loadCustomerMemory(false, "conversation-1")).resolves.toMatchObject({ operatorNotes: "重点客户" });
    await expect(loadConversationReview(true, "conversation-1")).resolves.toEqual({ review: null, items: [] });

    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/admin/conversations/conversation-1/messages?limit=20", { headers: {} });
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/merchant/conversations/conversation-1/memory", { headers: {} });
    expect(fetcher).toHaveBeenNthCalledWith(3, "/api/admin/conversations/conversation-1/review", { headers: {} });
    fetcher.mockRestore();
  });

  it("saves detail edits and review actions with stable request payloads", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 7, operatorNotes: "已备注" }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(saveCustomerMemoryNotes(false, "conversation-1", "已备注")).resolves.toMatchObject({ operatorNotes: "已备注" });
    await expect(generateConversationReview(true, "conversation-1")).resolves.toBeUndefined();
    await expect(applyConversationReviewItem("conversation-1", 12)).resolves.toBeUndefined();
    await expect(updateConversationHandoffStatus("conversation-1", "done")).resolves.toBeUndefined();
    await expect(deleteConversation(true, "conversation-1")).resolves.toBeUndefined();
    await expect(sendConversationMessage("conversation-1", { type: "text", content: "您好", url: "", caption: "", fileName: "" })).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/merchant/conversations/conversation-1/memory", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ operatorNotes: "已备注" })
    }));
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/admin/conversations/conversation-1/review", expect.objectContaining({ method: "POST" }));
    expect(fetcher).toHaveBeenNthCalledWith(3, "/api/merchant/conversations/conversation-1/review/apply", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ itemId: 12 })
    }));
    expect(fetcher).toHaveBeenNthCalledWith(4, "/api/merchant/handoffs/conversation-1", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ handoffStatus: "done" })
    }));
    expect(fetcher).toHaveBeenNthCalledWith(5, "/api/admin/conversations/conversation-1", expect.objectContaining({ method: "DELETE" }));
    expect(fetcher).toHaveBeenNthCalledWith(6, "/api/merchant/conversations/conversation-1/send", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ type: "text", content: "您好", url: "", caption: "", fileName: "" })
    }));
    fetcher.mockRestore();
  });

  it("starts proactive conversations through the selected A2C account", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      conversation: { id: "conversation-new", customerPhone: "5511913586749" }
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(sendProactiveConversationMessage("agent +55", {
      type: "text",
      content: "您好",
      url: "",
      caption: "",
      fileName: "",
      customerPhone: "5511913586749",
      nickname: "张三"
    })).resolves.toMatchObject({ id: "conversation-new" });

    expect(fetcher).toHaveBeenCalledWith("/api/merchant/a2c/accounts/agent%20%2B55/send", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        type: "text",
        content: "您好",
        url: "",
        caption: "",
        fileName: "",
        customerPhone: "5511913586749",
        nickname: "张三"
      })
    }));
    fetcher.mockRestore();
  });
});
