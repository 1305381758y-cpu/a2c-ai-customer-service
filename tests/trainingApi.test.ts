import { describe, expect, it, vi } from "vitest";

import {
  buildTrainingMaterialsUrl,
  deleteTrainingMaterial,
  importTrainingMaterial,
  loadTrainingMaterials,
  loadTrainingMaterialDetail
} from "../frontend/src/training/trainingApi.js";

describe("training material API helpers", () => {
  it("builds scoped material list URLs", () => {
    expect(buildTrainingMaterialsUrl(false, {
      merchantId: "ignored",
      countryId: "country-1",
      sourceType: "docx",
      status: "enabled",
      limit: "100"
    })).toBe("/api/merchant/training-materials?countryId=country-1&sourceType=docx&status=enabled&limit=100");

    expect(buildTrainingMaterialsUrl(true, {
      merchantId: "merchant-1",
      countryId: "country-1",
      sourceType: "image",
      status: "disabled",
      limit: "50"
    })).toBe("/api/admin/training-materials?merchantId=merchant-1&countryId=country-1&sourceType=image&status=disabled&limit=50");
  });

  it("loads material list rows through the shared rows helper", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      rows: [{ id: 42, filename: "script.docx" }]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(loadTrainingMaterials("/api/merchant/training-materials")).resolves.toEqual([{ id: 42, filename: "script.docx" }]);
    expect(fetcher).toHaveBeenCalledWith("/api/merchant/training-materials", { headers: {} });
    fetcher.mockRestore();
  });

  it("loads material detail through the shared JSON client", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      material: { id: 42, filename: "script.docx" },
      items: [{ id: 1, kind: "knowledge", content: "规则说明" }]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(loadTrainingMaterialDetail("/api/merchant/training-materials", 42)).resolves.toMatchObject({
      material: { id: 42, filename: "script.docx" },
      items: [{ id: 1, kind: "knowledge" }]
    });

    expect(fetcher).toHaveBeenCalledWith("/api/merchant/training-materials/42", { headers: {} });
    fetcher.mockRestore();
  });

  it("deletes materials through the scoped material route", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(deleteTrainingMaterial("/api/merchant/training-materials", 42)).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenCalledWith("/api/merchant/training-materials/42", expect.objectContaining({
      method: "DELETE",
      headers: {}
    }));
    fetcher.mockRestore();
  });

  it("imports material files with multipart form data", async () => {
    const file = new File(["hello"], "sample.txt", { type: "text/plain" });
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      imported: 3,
      samples: 2,
      knowledge: 1
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(importTrainingMaterial("/api/merchant/training-materials/import", file, "country-1", fetcher as never)).resolves.toEqual({
      imported: 3,
      samples: 2,
      knowledge: 1
    });

    expect(fetcher).toHaveBeenCalledWith("/api/merchant/training-materials/import", expect.objectContaining({
      method: "POST",
      body: expect.any(FormData)
    }));
  });

  it("translates import API errors for operators", async () => {
    const file = new File(["hello"], "sample.txt", { type: "text/plain" });
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(importTrainingMaterial("/api/merchant/training-materials/import", file, "country-1", fetcher as never)).rejects.toThrow("未找到");
  });
});
