import { describe, expect, it, vi } from "vitest";
import { sendOutboundMessage } from "../src/services/outboundMessageSender.js";

const payload = {
  to: "customer",
  senderPhoneNumber: "agent",
  type: "text" as const,
  content: "hello"
};

const idPolicy = {
  simulatedPrefix: "simulated_reply",
  sentFallbackPrefix: "a2c_sent",
  failedPrefix: "send_failed",
  contextId: "message-1"
};

describe("sendOutboundMessage", () => {
  it("records simulated sends without calling A2C", async () => {
    const a2c = { sendMessage: vi.fn() };

    const result = await sendOutboundMessage({ a2c, payload, idPolicy, simulation: true });

    expect(a2c.sendMessage).not.toHaveBeenCalled();
    expect(result.a2cSendStatus).toBe("simulated");
    expect(result.a2cSendError).toBe("");
    expect(result.externalId).toMatch(/^simulated_reply:message-1:/);
  });

  it("normalizes empty A2C success ids to a stable fallback prefix", async () => {
    const a2c = { sendMessage: vi.fn(async () => "") };

    const result = await sendOutboundMessage({ a2c, payload, idPolicy });

    expect(a2c.sendMessage).toHaveBeenCalledWith(payload);
    expect(result.a2cSendStatus).toBe("sent");
    expect(result.a2cSendError).toBe("");
    expect(result.externalId).toMatch(/^a2c_sent:message-1:/);
  });

  it("returns failed status and a diagnostic external id when A2C throws", async () => {
    const a2c = { sendMessage: vi.fn(async () => { throw new Error("A2C认证失败：访问过于频繁，请稍后再试"); }) };

    const result = await sendOutboundMessage({ a2c, payload, idPolicy });

    expect(result.a2cSendStatus).toBe("failed");
    expect(result.a2cSendError).toContain("访问过于频繁");
    expect(result.externalId).toMatch(/^send_failed:message-1:/);
  });
});
