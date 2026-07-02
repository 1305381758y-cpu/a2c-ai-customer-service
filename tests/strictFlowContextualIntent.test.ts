import { describe, expect, it } from "vitest";
import { analyzeMessage } from "../src/domain/analyzer.js";
import { buildRuleContextualIntent } from "../src/domain/strictFlowContextualIntent.js";
import type { Conversation } from "../src/repositories.js";

function conversation(flowStep: Conversation["flowStep"], overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "conversation-1",
    merchantId: "merchant-1",
    countryId: "country-1",
    countryCode: "BR",
    countryName: "巴西",
    customerPhone: "customer-1",
    a2cAccountPhone: "agent-1",
    nickname: "客户",
    flowStep,
    language: "zh",
    stage: "need_platform_register",
    extractedPhone: "",
    extractedTelegram: "",
    extractedWhatsApp: "",
    status: "active",
    handoffStatus: "pending",
    handoffNotified: 0,
    unreadCount: 0,
    ...overrides
  };
}

describe("strictFlowContextualIntent", () => {
  it("prioritizes submitted contact data over conversational interpretation", () => {
    const phone = buildRuleContextualIntent({
      conversation: conversation("collect_telegram"),
      analysis: analyzeMessage("我的号码是 5511913586749", "zh"),
      customerText: "我的号码是 5511913586749"
    });
    expect(phone.intent).toBe("phone_submission");
    expect(phone.nextAction).toBe("save phone and continue telegram step");

    const telegram = buildRuleContextualIntent({
      conversation: conversation("wait_registration"),
      analysis: analyzeMessage("@customer_123", "zh"),
      customerText: "@customer_123"
    });
    expect(telegram.intent).toBe("telegram_submission");
    expect(telegram.nextAction).toBe("save telegram and check handoff");
  });

  it("understands short answers from the current Telegram step", () => {
    const noTelegram = buildRuleContextualIntent({
      conversation: conversation("telegram_confirm"),
      analysis: analyzeMessage("我没有", "zh"),
      customerText: "我没有"
    });
    expect(noTelegram.intent).toBe("no_telegram");
    expect(noTelegram.answeredPreviousQuestion).toBe(true);

    const installed = buildRuleContextualIntent({
      conversation: conversation("telegram_download"),
      analysis: analyzeMessage("装好了", "zh"),
      customerText: "装好了"
    });
    expect(installed.intent).toBe("telegram_installed");
    expect(installed.nextAction).toBe("collect telegram username");
  });

  it("keeps registration acknowledgement distinct from registration completion", () => {
    const acknowledgement = buildRuleContextualIntent({
      conversation: conversation("wait_registration"),
      analysis: analyzeMessage("好的", "zh"),
      customerText: "好的",
    }, [{ direction: "outbound", content: "完成注册后把手机号发我。" }]);

    expect(acknowledgement.intent).toBe("acknowledgement");
    expect(acknowledgement.nextAction).toBe("wait_registration_ack");
    expect(acknowledgement.shouldPause).toBe(false);
  });

  it("keeps incomplete phone numbers in the registration step", () => {
    const result = buildRuleContextualIntent({
      conversation: conversation("wait_registration"),
      analysis: analyzeMessage("4567890 注册好了", "zh"),
      customerText: "4567890 注册好了"
    });

    expect(result.intent).toBe("incomplete_phone");
    expect(result.nextAction).toBe("need_complete_phone");
  });
});
