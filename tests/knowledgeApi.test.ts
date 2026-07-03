import { describe, expect, it, vi } from "vitest";

import {
  createKnowledgeItem,
  deleteKnowledgeItem,
  updateKnowledgeItem
} from "../frontend/src/knowledge/knowledgeApi.js";

describe("knowledge API helpers", () => {
  it("creates knowledge items with coerced draft values", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ id: 7 }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(createKnowledgeItem("/api/merchant/knowledge", {
      type: "faq",
      title: "注册问题",
      content: "先打开链接",
      language: "zh",
      priority: "5"
    }, "country-1")).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenCalledWith("/api/merchant/knowledge", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        type: "faq",
        title: "注册问题",
        content: "先打开链接",
        language: "zh",
        priority: 5,
        countryId: "country-1"
      }),
      headers: { "Content-Type": "application/json" }
    }));
    fetcher.mockRestore();
  });

  it("updates knowledge items with coerced patch values", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(updateKnowledgeItem("/api/admin/knowledge", 7, {
      enabled: "false" as never,
      priority: "9" as never
    })).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenCalledWith("/api/admin/knowledge/7", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ enabled: false, priority: 9 }),
      headers: { "Content-Type": "application/json" }
    }));
    fetcher.mockRestore();
  });

  it("deletes knowledge items through the scoped route", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(deleteKnowledgeItem("/api/merchant/knowledge", 7)).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenCalledWith("/api/merchant/knowledge/7", expect.objectContaining({
      method: "DELETE",
      headers: {}
    }));
    fetcher.mockRestore();
  });
});
