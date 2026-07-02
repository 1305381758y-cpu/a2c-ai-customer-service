import { describe, expect, it } from "vitest";
import {
  isNegativeTelegramAnswer,
  shouldAcknowledgeTelegramInstalled,
  shouldCollectTelegramUsername,
  shouldGuideTelegramDownload,
  shouldPauseTelegramFlow,
  shouldWaitForTelegramUsername,
  telegramUsernameHelpScriptKey
} from "../src/domain/strictFlowTelegram.js";

describe("strictFlowTelegram", () => {
  it("chooses Android-specific username setup guidance when the customer mentions Android", () => {
    expect(telegramUsernameHelpScriptKey("我的安卓手机，没看到@开头的用户名")).toBe("telegram_username_android_help");
    expect(telegramUsernameHelpScriptKey("怎么找用户名")).toBe("telegram_username_help");
  });

  it("recognizes answers that mean the customer does not have Telegram", () => {
    expect(isNegativeTelegramAnswer("no_telegram", "我没有")).toBe(true);
    expect(isNegativeTelegramAnswer("unknown", "我没有Telegram")).toBe(true);
    expect(isNegativeTelegramAnswer("acknowledgement", "好的")).toBe(false);
  });

  it("keeps Telegram download help decisions in one place", () => {
    expect(shouldGuideTelegramDownload("no_telegram")).toBe(true);
    expect(shouldGuideTelegramDownload("need_help")).toBe(true);
    expect(shouldGuideTelegramDownload("workflow_question")).toBe(true);
    expect(shouldGuideTelegramDownload("ask_tg_register")).toBe(true);
    expect(shouldGuideTelegramDownload("telegram_installed")).toBe(false);
  });

  it("knows when Telegram confirmation should proceed to username collection", () => {
    expect(shouldCollectTelegramUsername("telegram_installed", "unknown", "unknown", false)).toBe(true);
    expect(shouldCollectTelegramUsername("ask_tg_register", "unknown", "unknown", false)).toBe(true);
    expect(shouldCollectTelegramUsername("unknown", "ask_tg_register", "unknown", false)).toBe(true);
    expect(shouldCollectTelegramUsername("unknown", "unknown", "ask_tg_register", false)).toBe(true);
    expect(shouldCollectTelegramUsername("unknown", "unknown", "unknown", true)).toBe(true);
    expect(shouldCollectTelegramUsername("unknown", "unknown", "unknown", false)).toBe(false);
  });

  it("separates installed acknowledgements, pauses, and waiting replies", () => {
    expect(shouldAcknowledgeTelegramInstalled("telegram_installed", false)).toBe(true);
    expect(shouldAcknowledgeTelegramInstalled("acknowledgement", false)).toBe(true);
    expect(shouldAcknowledgeTelegramInstalled("unknown", true)).toBe(true);
    expect(shouldAcknowledgeTelegramInstalled("unknown", false)).toBe(false);

    expect(shouldPauseTelegramFlow("negative_refusal", "unknown")).toBe(true);
    expect(shouldPauseTelegramFlow("unknown", "negative_refusal")).toBe(true);
    expect(shouldPauseTelegramFlow("acknowledgement", "unknown")).toBe(false);

    expect(shouldWaitForTelegramUsername("acknowledgement", false)).toBe(true);
    expect(shouldWaitForTelegramUsername("unknown", true)).toBe(true);
    expect(shouldWaitForTelegramUsername("unknown", false)).toBe(false);
  });
});
