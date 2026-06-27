import { describe, expect, it } from "vitest";
import { buildHandoffMessage } from "../src/services/handoff.js";
import type { Conversation } from "../src/repositories.js";

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "conv-1",
    merchantId: "merchant-1",
    countryId: "merchant-1:br",
    countryCode: "br",
    countryName: "巴西",
    customerPhone: "5511913586749",
    a2cAccountPhone: "18507251675",
    nickname: "张三",
    language: "zh",
    stage: "ready_for_handoff",
    flowStep: "human_handoff",
    extractedPhone: "123456789",
    extractedTelegram: "@qwea",
    extractedWhatsApp: "",
    status: "human_handoff",
    handoffStatus: "pending",
    handoffNotified: 0,
    unreadCount: 0,
    ...overrides
  };
}

describe("buildHandoffMessage", () => {
  it("uses the concise handoff format with customer sender and submitted contacts separated", () => {
    const message = buildHandoffMessage({
      conversation: conversation(),
      lastMessageId: "msg-1",
      lastMessageTime: "2026-06-13T10:00:00.000Z",
      summary: "inbound: hello"
    });

    expect(message).toBe(`客户已完成自动引导流程，请人工跟进。

客户定位信息：
- 客户发送账号名称：张三
- 客户发送账号号码：5511913586749
- 客户提交手机号：123456789
- 客户提交Telegram账号：@qwea
- 客户提交WhatsApp账号：未识别
- 客户语言：中文
- 国家/市场：巴西
- A2C客服账号：18507251675
- 最近消息时间：2026-06-13 18:00:00`);
    expect(message).not.toContain("A2C消息ID");
    expect(message).not.toContain("会话ID");
    expect(message).not.toContain("最近聊天摘要");
    expect(message).not.toContain("建议操作");
  });

  it("uses 未识别 and 未知 for missing values", () => {
    const message = buildHandoffMessage({
      conversation: conversation({
        countryCode: "",
        countryName: "",
        customerPhone: "",
        nickname: "",
        language: "unknown",
        extractedPhone: "",
        extractedTelegram: "",
        extractedWhatsApp: ""
      }),
      lastMessageId: "",
      lastMessageTime: "",
      summary: ""
    });

    expect(message).toContain("- 客户发送账号名称：未识别");
    expect(message).toContain("- 客户发送账号号码：未识别");
    expect(message).toContain("- 客户提交手机号：未识别");
    expect(message).toContain("- 客户提交Telegram账号：未识别");
    expect(message).toContain("- 客户提交WhatsApp账号：未识别");
    expect(message).toContain("- 客户语言：未知");
    expect(message).toContain("- 国家/市场：默认国家");
    expect(message).toContain("- 最近消息时间：未识别");
  });
});
