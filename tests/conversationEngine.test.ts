import { describe, expect, it, vi } from "vitest";
import { ConversationEngine } from "../src/services/conversationEngine.js";
import type { A2CWebhookPayload } from "../src/services/inboundMessage.js";

function payload(type = "CUSTOMER_MESSAGE"): A2CWebhookPayload {
  return {
    id: `payload-${type}`,
    timestamp: 1,
    type,
    data: {
      messageId: `message-${type}`,
      content: "hello",
      from: "customer",
      to: "agent",
      msgType: "text",
      timestamp: 1
    }
  };
}

describe("ConversationEngine", () => {
  it("uses a narrow inbound interface for direct conversation handling", async () => {
    const processor = {
      process: vi.fn(async () => ({ status: "replied", conversationId: "conversation-1" })),
      processDueFollowUps: vi.fn()
    };
    const engine = new ConversationEngine(processor);

    await expect(engine.handleInboundMessage({
      payload: payload(),
      merchantId: "merchant-1",
      simulation: true
    })).resolves.toEqual({ status: "replied", conversationId: "conversation-1" });

    expect(processor.process).toHaveBeenCalledWith(payload(), "merchant-1", { simulation: true });
  });

  it("queues only customer messages and drains through the same inbound interface", async () => {
    const processor = {
      process: vi.fn(async () => ({ status: "replied" })),
      processDueFollowUps: vi.fn()
    };
    const engine = new ConversationEngine(processor, { concurrency: 1 });

    expect(engine.enqueueInboundMessage({ payload: payload("PING") })).toEqual({ status: "ignored", queueDepth: 0 });
    expect(engine.enqueueInboundMessage({ payload: payload(), merchantId: "merchant-2" })).toEqual({ status: "queued", queueDepth: 1 });

    await vi.waitFor(() => {
      expect(processor.process).toHaveBeenCalledWith(payload(), "merchant-2", { simulation: undefined });
    });
  });

  it("receives inbound messages synchronously when configured for direct handling", async () => {
    const processor = {
      process: vi.fn(async () => ({ status: "strict_flow_replied", conversationId: "conversation-sync" })),
      processDueFollowUps: vi.fn()
    };
    const engine = new ConversationEngine(processor, { asyncProcessing: false });

    await expect(engine.receiveInboundMessage({ payload: payload(), merchantId: "merchant-sync" })).resolves.toEqual({
      status: "strict_flow_replied",
      conversationId: "conversation-sync"
    });
    expect(processor.process).toHaveBeenCalledWith(payload(), "merchant-sync", { simulation: undefined });
  });

  it("receives inbound messages asynchronously when configured for queued handling", async () => {
    const processor = {
      process: vi.fn(async () => ({ status: "strict_flow_replied", conversationId: "conversation-async" })),
      processDueFollowUps: vi.fn()
    };
    const engine = new ConversationEngine(processor, { asyncProcessing: true, concurrency: 1 });

    await expect(engine.receiveInboundMessage({ payload: payload(), merchantId: "merchant-async" })).resolves.toEqual({
      status: "queued",
      queueDepth: 1
    });

    await vi.waitFor(() => {
      expect(processor.process).toHaveBeenCalledWith(payload(), "merchant-async", { simulation: undefined });
    });
  });

  it("handles simulator inbound messages synchronously with simulation enabled", async () => {
    const processor = {
      process: vi.fn(async () => ({ status: "reply_simulated", conversationId: "conversation-sim" })),
      processDueFollowUps: vi.fn()
    };
    const engine = new ConversationEngine(processor, { asyncProcessing: true });

    await expect(engine.simulateInboundMessage({ payload: payload(), merchantId: "merchant-sim" })).resolves.toEqual({
      status: "reply_simulated",
      conversationId: "conversation-sim"
    });

    expect(processor.process).toHaveBeenCalledWith(payload(), "merchant-sim", { simulation: true });
  });

  it("depends on a narrow conversation processor interface", async () => {
    const processor = {
      process: vi.fn(async () => ({ status: "replied" })),
      processDueFollowUps: vi.fn(async () => ({ scanned: 0, sent: 0, skipped: 0, failed: 0 }))
    };

    const engine = new ConversationEngine(processor, { asyncProcessing: false });

    await expect(engine.receiveInboundMessage({ payload: payload() })).resolves.toEqual({ status: "replied" });
    expect(processor.process).toHaveBeenCalledOnce();
  });

  it("keeps follow-up execution behind the engine interface", async () => {
    const processor = {
      process: vi.fn(),
      processDueFollowUps: vi.fn(async () => ({ scanned: 2, sent: 1, skipped: 1, failed: 0 }))
    };
    const engine = new ConversationEngine(processor);

    await expect(engine.processDueFollowUps(12)).resolves.toEqual({ scanned: 2, sent: 1, skipped: 1, failed: 0 });
    expect(processor.processDueFollowUps).toHaveBeenCalledWith(12);
  });
});
