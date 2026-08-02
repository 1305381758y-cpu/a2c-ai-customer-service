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
    expect(installed.nextAction).toBe("send teacher Telegram link");
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

  it("recognizes registration in progress and does not ask for the phone early", () => {
    const result = buildRuleContextualIntent({
      conversation: conversation("wait_registration"),
      analysis: analyzeMessage("我正在注册，不要催我", "zh"),
      customerText: "我正在注册，不要催我"
    });

    expect(result.intent).toBe("acknowledgement");
    expect(result.nextAction).toBe("wait for registration to finish without asking for phone");
    expect(result.reason).toContain("still registering");
  });

  it("does not treat a request for a few minutes as registration approval", () => {
    const result = buildRuleContextualIntent({
      conversation: conversation("registration_intent"),
      analysis: analyzeMessage("要等我几分钟", "zh"),
      customerText: "要等我几分钟",
      inferredIntent: "positive_confirmation"
    });

    expect(result.intent).toBe("not_available");
    expect(result.shouldPause).toBe(true);
    expect(result.nextAction).toBe("pause politely");
  });

  it("recognizes a temporary unavailability followed by a concrete wait duration", () => {
    const result = buildRuleContextualIntent({
      conversation: conversation("registration_intent"),
      analysis: analyzeMessage("暂时没有，需要等待十分钟", "zh"),
      customerText: "暂时没有，需要等待十分钟",
      inferredIntent: "positive_confirmation"
    });

    expect(result.intent).toBe("not_available");
    expect(result.shouldPause).toBe(true);
    expect(result.nextAction).toBe("pause politely");
  });

  it.each([
    "我手头还有点事，晚一点再弄",
    "先让我忙完这边再说",
    "现在不太方便，回头联系你",
    "给我一点时间，等会继续",
    "ok，不过我得过会儿才能操作",
    "我这会儿抽不开身",
    "Agora não posso, falamos mais tarde",
    "Estou ocupado, pode esperar um pouco?",
    "Me dá um tempinho e depois continuamos",
    "Sim, mas só consigo fazer isso mais tarde",
    "No momento estou sem tempo",
    "Ahora no puedo, seguimos más tarde",
    "Estoy ocupado, espérame un momento",
    "Dame un poco de tiempo y luego continuamos",
    "Sí, pero lo haré después",
    "I'm busy right now, give me a moment",
    "yes, but I can only do it later",
    "hold on, I'll come back in a bit",
    "can we continue later?",
    "ok 我先忙一下 later"
  ])("recognizes semantic temporary pauses without requiring a fixed sentence: %s", (customerText) => {
    const result = buildRuleContextualIntent({
      conversation: conversation("registration_intent"),
      analysis: analyzeMessage(customerText, "pt-BR"),
      customerText,
      inferredIntent: "positive_confirmation"
    });

    expect(result.intent).toBe("not_available");
    expect(result.shouldPause).toBe(true);
    expect(result.nextAction).toBe("pause politely");
  });

  it("keeps a short acknowledgement paused after the customer gives a later time", () => {
    const result = buildRuleContextualIntent({
      conversation: conversation("registration_intent"),
      analysis: analyzeMessage("ok", "pt-BR"),
      customerText: "ok"
    }, [
      { direction: "outbound", content: "Tudo bem, não vou incomodar você agora." },
      { direction: "inbound", content: "暂时没有时间，要等到晚上九点" }
    ]);

    expect(result.intent).toBe("acknowledgement");
    expect(result.shouldPause).toBe(true);
    expect(result.nextAction).toBe("wait until customer says ready");
  });

  it("prioritizes explicit registration completion over an AI help label", () => {
    const result = buildRuleContextualIntent({
      conversation: conversation("wait_registration"),
      analysis: analyzeMessage("注册好了", "zh"),
      customerText: "注册好了",
      inferredIntent: "need_help"
    });

    expect(result.intent).toBe("platform_register_done");
    expect(result.nextAction).toBe("ask for registered phone");
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

  it("keeps a Telegram explanation question in the Telegram step", () => {
    const result = buildRuleContextualIntent({
      conversation: conversation("telegram_confirm"),
      analysis: analyzeMessage("为什么要用Telegram", "zh"),
      customerText: "为什么要用Telegram",
      inferredIntent: "ask_tg_register"
    });

    expect(result.intent).toBe("ask_tg_register");
    expect(result.nextAction).toBe("answer Telegram question and keep current step");
    expect(result.isQuestion).toBe(true);
  });

  it("uses the previous availability question to understand short Portuguese answers", () => {
    const result = buildRuleContextualIntent({
      conversation: conversation("registration_intent", { language: "pt-BR" }),
      analysis: analyzeMessage("Tenho", "pt-BR"),
      customerText: "Tenho"
    }, [{ direction: "outbound", content: "Você tem tempo livre em casa?" }]);

    expect(result.intent).toBe("positive_confirmation");
    expect(result.nextAction).toBe("continue registration flow");
    expect(result.shouldPause).toBe(false);
  });

  it.each(["Estou disponível", "Estou livre", "Podemos continuar"])("resumes a persisted Portuguese pause: %s", (customerText) => {
    const result = buildRuleContextualIntent({
      conversation: conversation("registration_intent", { language: "pt-BR", flowHoldReason: "temporary_pause" }),
      analysis: analyzeMessage(customerText, "pt-BR"),
      customerText
    });

    expect(result.intent).toBe("positive_confirmation");
    expect(result.nextAction).toBe("resume held flow");
    expect(result.shouldPause).toBe(false);
  });

  it("resumes a pause when sim answers an explicit follow-up question", () => {
    const result = buildRuleContextualIntent({
      conversation: conversation("registration_intent", { language: "pt-BR", flowHoldReason: "temporary_pause" }),
      analysis: analyzeMessage("Sim", "pt-BR"),
      customerText: "Sim"
    }, [{ direction: "outbound", content: "Você está livre para continuar agora?" }]);

    expect(result.intent).toBe("positive_confirmation");
    expect(result.nextAction).toBe("resume held flow");
  });

  it("does not treat a repeated greeting as consent at the interest step", () => {
    const result = buildRuleContextualIntent({
      conversation: conversation("interest_screening", { language: "pt-BR" }),
      analysis: analyzeMessage("Bom dia", "pt-BR"),
      customerText: "Bom dia"
    });

    expect(result.intent).toBe("chat");
    expect(result.nextAction).toBe("repeat the interest question without advancing");
  });

  it("distinguishes bare Portuguese Telegram yes and no answers", () => {
    const missing = buildRuleContextualIntent({
      conversation: conversation("telegram_confirm", { language: "pt-BR" }),
      analysis: analyzeMessage("Não", "pt-BR"),
      customerText: "Não"
    });
    const installed = buildRuleContextualIntent({
      conversation: conversation("telegram_confirm", { language: "pt-BR" }),
      analysis: analyzeMessage("Tenho", "pt-BR"),
      customerText: "Tenho"
    });

    expect(missing.intent).toBe("no_telegram");
    expect(installed.intent).toBe("telegram_installed");
  });
});
