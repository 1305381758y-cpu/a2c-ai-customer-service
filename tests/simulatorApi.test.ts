import { describe, expect, it, vi } from "vitest";

import {
  loadSimulatorA2CAccounts,
  sendSimulatorMessage
} from "../frontend/src/simulator/simulatorApi.js";

describe("training simulator API helpers", () => {
  it("loads available A2C accounts for simulator selection", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      rows: [{ id: 1, apiPhone: "10086", verifiedName: "客服号" }]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(loadSimulatorA2CAccounts()).resolves.toEqual([
      { id: 1, apiPhone: "10086", verifiedName: "客服号" }
    ]);

    expect(fetcher).toHaveBeenCalledWith("/api/merchant/a2c/accounts", { headers: {} });
    fetcher.mockRestore();
  });

  it("sends simulator messages through the internal simulator route", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      status: "strict_flow_simulated",
      rows: [{ id: 1, direction: "inbound", content: "你好" }]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(sendSimulatorMessage({
      customerPhone: "sim-001",
      nickname: "模拟客户",
      a2cAccountPhone: "10086",
      content: "你好"
    })).resolves.toMatchObject({ status: "strict_flow_simulated" });

    expect(fetcher).toHaveBeenCalledWith("/api/merchant/training-simulator/messages", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        customerPhone: "sim-001",
        nickname: "模拟客户",
        a2cAccountPhone: "10086",
        content: "你好",
        msgType: "text"
      }),
      headers: { "Content-Type": "application/json" }
    }));
    fetcher.mockRestore();
  });

  it("omits empty A2C account values so backend can use simulator defaults", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      status: "reply_simulated",
      rows: []
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(sendSimulatorMessage({
      customerPhone: "sim-002",
      nickname: "模拟客户",
      a2cAccountPhone: "",
      content: "链接打不开"
    })).resolves.toMatchObject({ status: "reply_simulated" });

    expect(fetcher).toHaveBeenCalledWith("/api/merchant/training-simulator/messages", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        customerPhone: "sim-002",
        nickname: "模拟客户",
        content: "链接打不开",
        msgType: "text"
      })
    }));
    fetcher.mockRestore();
  });
});
