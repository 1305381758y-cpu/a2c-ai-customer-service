import { describe, expect, it } from "vitest";

import { configFieldsForGroup } from "../frontend/src/settings/ConfigCredentialFields.js";

describe("settings credential groups", () => {
  it("keeps A2C, Telegram and fallback fields in separate groups", () => {
    expect(configFieldsForGroup("a2c")).toEqual(["a2cBaseUrl", "a2cAppId", "a2cAppSecret", "a2cAccountPhone"]);
    expect(configFieldsForGroup("telegram")).toEqual(["telegramBotToken"]);
    expect(configFieldsForGroup("fallback")).toEqual(["platformRegisterUrl", "tgRegisterGuideUrl"]);
  });

  it("shows only the selected model provider credentials", () => {
    expect(configFieldsForGroup("ai", "minimax")).toEqual(["aiProvider", "minimaxApiKey", "minimaxModel"]);
    expect(configFieldsForGroup("ai", "deepseek")).toEqual(["aiProvider", "deepseekApiKey", "deepseekModel"]);
    expect(configFieldsForGroup("ai", "gemini")).toEqual(["aiProvider", "googleAiApiKey", "googleAiModel"]);
  });
});
