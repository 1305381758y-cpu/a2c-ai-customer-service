import { describe, expect, it, vi } from "vitest";

import {
  createScriptFlowStep,
  deleteScriptFlow,
  deleteScriptFlowStep,
  duplicateScriptFlowStep,
  importScriptFlow,
  loadScriptFlowDetail,
  scriptFlowBase,
  scriptFlowRowsUrl,
  scriptFlowStepBase,
  updateScriptFlowStep
} from "../frontend/src/script-flows/scriptFlowApi.js";

const flow = {
  id: 11,
  merchantId: "merchant-1",
  countryId: "country-1",
  countryName: "巴西",
  name: "开户注册流程",
  status: "active",
  active: true,
  version: 2,
  sourceFilename: "script.xlsx",
  stepCount: 3,
  createdAt: "2026-07-03T10:00:00Z",
  updatedAt: "2026-07-03T10:00:00Z"
};

const step = {
  id: 21,
  flowId: 11,
  flowCode: "A",
  flowName: "兴趣筛选",
  flowStep: "interest_screening",
  goal: "确认兴趣",
  triggerCondition: "",
  customerExpressions: "",
  standardReply: "您好，您是想了解兼职吗？",
  collectInfo: "",
  sendLink: false,
  sendInvite: false,
  nextCondition: "",
  nextFlowCode: "B",
  nextFlowStep: "registration_intent",
  forbidden: "",
  notes: "",
  sortOrder: 1,
  enabled: true
};

describe("script flow API helpers", () => {
  it("builds scoped base URLs and rows URLs", () => {
    expect(scriptFlowBase(false)).toBe("/api/merchant/script-flows");
    expect(scriptFlowBase(true)).toBe("/api/admin/script-flows");
    expect(scriptFlowStepBase(false)).toBe("/api/merchant/script-flow-steps");
    expect(scriptFlowStepBase(true)).toBe("/api/admin/script-flow-steps");

    expect(scriptFlowRowsUrl(false, { merchantId: "merchant-1", countryId: "country-1", status: "active" })).toBe(
      "/api/merchant/script-flows?countryId=country-1&status=active"
    );
    expect(scriptFlowRowsUrl(true, { merchantId: "merchant-1", countryId: "country-1", status: "" })).toBe(
      "/api/admin/script-flows?merchantId=merchant-1&countryId=country-1"
    );
  });

  it("loads script flow details", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      flow,
      steps: [step],
      versions: []
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(loadScriptFlowDetail("/api/merchant/script-flows", 11)).resolves.toMatchObject({
      flow: { id: 11 },
      steps: [{ id: 21 }]
    });

    expect(fetcher).toHaveBeenCalledWith("/api/merchant/script-flows/11", { headers: {} });
    fetcher.mockRestore();
  });

  it("imports script flow files with scoped query fields", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      flow,
      imported: 8
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const file = new File(["流程"], "flow.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    await expect(importScriptFlow({
      base: "/api/admin/script-flows",
      file,
      flowName: "巴西流程",
      countryId: "country-1",
      merchantId: "merchant-1"
    })).resolves.toMatchObject({ imported: 8 });

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toBe("/api/admin/script-flows/import?name=%E5%B7%B4%E8%A5%BF%E6%B5%81%E7%A8%8B&countryId=country-1&merchantId=merchant-1");
    expect(options).toMatchObject({ method: "POST" });
    expect(options?.body).toBeInstanceOf(FormData);
    fetcher.mockRestore();
  });

  it("creates and mutates script flow steps", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(step), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(createScriptFlowStep("/api/merchant/script-flows", 11, 4)).resolves.toMatchObject({ id: 21 });
    await expect(updateScriptFlowStep("/api/merchant/script-flow-steps", 21, { standardReply: "更新" })).resolves.toBeUndefined();
    await expect(duplicateScriptFlowStep("/api/merchant/script-flow-steps", 21)).resolves.toBeUndefined();
    await expect(deleteScriptFlowStep("/api/merchant/script-flow-steps", 21)).resolves.toBeUndefined();
    await expect(deleteScriptFlow("/api/merchant/script-flows", 11)).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/merchant/script-flows/11/steps", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" }
    }));
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/merchant/script-flow-steps/21", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ standardReply: "更新" })
    }));
    expect(fetcher).toHaveBeenNthCalledWith(3, "/api/merchant/script-flow-steps/21/duplicate", expect.objectContaining({ method: "POST" }));
    expect(fetcher).toHaveBeenNthCalledWith(4, "/api/merchant/script-flow-steps/21", expect.objectContaining({ method: "DELETE" }));
    expect(fetcher).toHaveBeenNthCalledWith(5, "/api/merchant/script-flows/11", expect.objectContaining({ method: "DELETE" }));
    fetcher.mockRestore();
  });
});
