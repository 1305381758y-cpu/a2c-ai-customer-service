import { describe, expect, it, vi } from "vitest";

import { dashboardEndpoint, loadDashboardMetrics } from "../frontend/src/dashboard/dashboardApi.js";

describe("dashboard API helpers", () => {
  it("selects the scoped dashboard endpoint", () => {
    expect(dashboardEndpoint(false)).toBe("/api/merchant/dashboard");
    expect(dashboardEndpoint(true)).toBe("/api/admin/dashboard");
  });

  it("loads merchant dashboard metrics", async () => {
    const metrics = { customers: 12, conversations: 30, aiReplies: 18 };
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(metrics), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(loadDashboardMetrics(false)).resolves.toEqual(metrics);

    expect(fetcher).toHaveBeenCalledWith("/api/merchant/dashboard", { headers: {} });
    fetcher.mockRestore();
  });

  it("loads platform dashboard metrics", async () => {
    const metrics = { merchants: 3, users: 8, handoffs: 2 };
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(metrics), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(loadDashboardMetrics(true)).resolves.toEqual(metrics);

    expect(fetcher).toHaveBeenCalledWith("/api/admin/dashboard", { headers: {} });
    fetcher.mockRestore();
  });
});
