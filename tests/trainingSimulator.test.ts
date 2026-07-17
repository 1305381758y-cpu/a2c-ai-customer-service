import { describe, expect, it, vi } from "vitest";
import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";
import { runMerchantTrainingSimulation } from "../src/services/trainingSimulator.js";

describe("training simulator service", () => {
  it("builds a simulation webhook payload from merchant defaults and enabled A2C account", async () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("模拟训练商户");
    repos.patchMerchantConfig(merchant.id, { a2cAccountPhone: "configured-a2c" });
    repos.syncMerchantA2CAccounts(merchant.id, [{ apiPhone: "enabled-a2c", verifiedName: "默认客服" }]);
    const conversationEngine = {
      simulateInboundMessage: vi.fn(async () => ({ status: "strict_flow_simulated", conversationId: "conversation-missing" }))
    };

    const result = await runMerchantTrainingSimulation(
      repos,
      conversationEngine as never,
      merchant.id,
      { customerPhone: "sim-customer-1", content: "你好" },
      { now: 1783068000000, randomSuffix: "abc12345" }
    );

    expect(result).toMatchObject({
      ok: true,
      value: { status: "strict_flow_simulated", conversation: undefined, rows: [] }
    });
    expect(conversationEngine.simulateInboundMessage).toHaveBeenCalledWith({
      merchantId: merchant.id,
      payload: {
        id: `sim:sim_in:${merchant.id}:sim-customer-1:1783068000000:abc12345`,
        timestamp: 1783068000,
        type: "CUSTOMER_MESSAGE",
        data: expect.objectContaining({
          messageId: `sim_in:${merchant.id}:sim-customer-1:1783068000000:abc12345`,
          content: "你好",
          from: "sim-customer-1",
          to: "enabled-a2c",
          msgType: "text",
          nickname: "模拟客户"
        })
      }
    });
  });

  it("uses configured A2C account and media defaults when no enabled account exists", async () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("模拟媒体商户");
    repos.patchMerchantConfig(merchant.id, { a2cAccountPhone: "configured-a2c,other-a2c" });
    const conversationEngine = {
      simulateInboundMessage: vi.fn(async () => ({ status: "reply_simulated" }))
    };

    const result = await runMerchantTrainingSimulation(
      repos,
      conversationEngine as never,
      merchant.id,
      { customerPhone: "sim-customer-2", url: "https://example.com/a.png", caption: "你看看", fileName: "a.png" },
      { now: 1783068000000, randomSuffix: "img12345" }
    );

    expect(result).toMatchObject({ ok: true, value: { status: "reply_simulated", rows: [] } });
    expect(conversationEngine.simulateInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          data: expect.objectContaining({
            content: "你看看",
            to: "configured-a2c",
            msgType: "image",
            url: "https://example.com/a.png",
            caption: "你看看",
            fileName: "a.png"
          })
        })
      })
    );
  });

  it("rejects empty simulator text and media messages before reaching the engine", async () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("空消息商户");
    const conversationEngine = {
      simulateInboundMessage: vi.fn()
    };

    await expect(runMerchantTrainingSimulation(repos, conversationEngine as never, merchant.id, { content: "  " })).resolves.toEqual({
      ok: false,
      statusCode: 400,
      error: "请输入客户消息"
    });
    await expect(runMerchantTrainingSimulation(repos, conversationEngine as never, merchant.id, { msgType: "image" })).resolves.toEqual({
      ok: false,
      statusCode: 400,
      error: "请输入媒体链接或说明"
    });
    expect(conversationEngine.simulateInboundMessage).not.toHaveBeenCalled();
  });

  it("forces the mock A2C account when a production snapshot is bound", async () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("快照隔离商户");
    repos.patchMerchantConfig(merchant.id, { a2cAccountPhone: "real-configured-a2c" });
    const conversationEngine = {
      simulateInboundMessage: vi.fn(async () => ({ status: "strict_flow_simulated" }))
    };
    const snapshots = {
      get: () => ({
        snapshotId: "snapshot-1",
        merchantId: merchant.id,
        nodeCount: 11,
        validation: { valid: true },
        configHash: "hash-1"
      }),
      compareProduction: () => true
    };

    const result = await runMerchantTrainingSimulation(
      repos,
      conversationEngine as never,
      merchant.id,
      {
        snapshotId: "snapshot-1",
        customerPhone: "snapshot-customer",
        a2cAccountPhone: "real-request-a2c",
        content: "你好"
      },
      { now: 1783068000000, randomSuffix: "snapshot" },
      snapshots as never
    );

    expect(result.ok).toBe(true);
    expect(conversationEngine.simulateInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          data: expect.objectContaining({ to: "simulation-a2c" })
        })
      })
    );
  });
});
