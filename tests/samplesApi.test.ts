import { describe, expect, it, vi } from "vitest";

import {
  buildSamplesUrl,
  deleteSample,
  importSampleTrainingFile,
  loadSamples,
  updateSample
} from "../frontend/src/samples/samplesApi.js";

describe("sample API helpers", () => {
  it("builds scoped sample list URLs", () => {
    expect(buildSamplesUrl(false, {
      merchantId: "ignored",
      countryId: "country-1",
      language: "pt",
      intent: "ask_link",
      stage: "wait_registration",
      enabled: "true"
    })).toBe("/api/merchant/training-samples?countryId=country-1&language=pt&intent=ask_link&stage=wait_registration&enabled=true");

    expect(buildSamplesUrl(true, {
      merchantId: "merchant-1",
      countryId: "country-1",
      language: "es",
      intent: "need_help",
      stage: "collect_telegram",
      enabled: "false"
    })).toBe("/api/admin/training-samples?merchantId=merchant-1&countryId=country-1&language=es&intent=need_help&stage=collect_telegram&enabled=false");
  });

  it("loads sample list rows through the shared rows helper", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      rows: [{ id: 12, customerMessage: "注册链接" }]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(loadSamples("/api/merchant/training-samples")).resolves.toEqual([{ id: 12, customerMessage: "注册链接" }]);
    expect(fetcher).toHaveBeenCalledWith("/api/merchant/training-samples", { headers: {} });
    fetcher.mockRestore();
  });

  it("imports training files through the shared material import route", async () => {
    const file = new File(["sample"], "samples.csv", { type: "text/csv" });
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      imported: 4,
      samples: 3,
      knowledge: 1
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(importSampleTrainingFile(file, "country-1", fetcher as never)).resolves.toEqual({
      imported: 4,
      samples: 3,
      knowledge: 1
    });

    expect(fetcher).toHaveBeenCalledWith("/api/merchant/training-materials/import", expect.objectContaining({
      method: "POST",
      body: expect.any(FormData)
    }));
  });

  it("translates training file import errors for operators", async () => {
    const file = new File(["sample"], "samples.csv", { type: "text/csv" });
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(importSampleTrainingFile(file, "country-1", fetcher as never)).rejects.toThrow("未找到");
  });

  it("updates samples with coerced patch values", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(updateSample("/api/merchant/training-samples", 12, {
      enabled: "false" as never,
      priority: "8" as never
    })).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenCalledWith("/api/merchant/training-samples/12", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ enabled: false, priority: 8 }),
      headers: { "Content-Type": "application/json" }
    }));
    fetcher.mockRestore();
  });

  it("deletes samples through the scoped sample route", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(deleteSample("/api/admin/training-samples", 12)).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenCalledWith("/api/admin/training-samples/12", expect.objectContaining({
      method: "DELETE",
      headers: {}
    }));
    fetcher.mockRestore();
  });
});
