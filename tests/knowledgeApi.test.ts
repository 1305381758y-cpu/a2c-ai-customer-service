import { describe, expect, it, vi } from "vitest";

import {
  buildKnowledgeUrl,
  createKnowledgeItem,
  deleteKnowledgeItem,
  knowledgeBase,
  loadKnowledgeItems,
  updateKnowledgeItem
} from "../frontend/src/knowledge/knowledgeApi.js";

describe("knowledge API helpers", () => {
  it("builds scoped knowledge list routes", () => {
    expect(knowledgeBase(true)).toBe("/api/admin/knowledge");
    expect(knowledgeBase(false)).toBe("/api/merchant/knowledge");

    expect(buildKnowledgeUrl(true, {
      merchantId: "merchant-1",
      countryId: "country-1",
      type: "faq",
      enabled: "true"
    })).toBe("/api/admin/knowledge?merchantId=merchant-1&countryId=country-1&type=faq&enabled=true");

    expect(buildKnowledgeUrl(false, {
      merchantId: "merchant-1",
      countryId: "country-1",
      type: "rule",
      enabled: "false"
    })).toBe("/api/merchant/knowledge?countryId=country-1&type=rule&enabled=false");
  });

  it("loads knowledge list rows", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      rows: [{ id: 7, title: "FAQ" }]
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(loadKnowledgeItems("/api/merchant/knowledge?type=faq")).resolves.toEqual([{ id: 7, title: "FAQ" }]);

    expect(fetcher).toHaveBeenCalledWith("/api/merchant/knowledge?type=faq", expect.objectContaining({
      headers: {}
    }));
    fetcher.mockRestore();
  });

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
