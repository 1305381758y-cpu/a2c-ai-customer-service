import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { translateForCustomer, translateForOperator } from "../src/services/translation.js";

const config = loadConfig({});

describe("operator translation", () => {
  it("uses local fallback translations for common short Spanish messages", async () => {
    await expect(translateForOperator(config, "Información", "es")).resolves.toMatchObject({
      translatedText: "信息",
      status: "translated"
    });
    await expect(translateForOperator(config, "X favor", "es")).resolves.toMatchObject({
      translatedText: "请问",
      status: "translated"
    });
    await expect(translateForOperator(config, "Si", "es")).resolves.toMatchObject({
      translatedText: "是的",
      status: "translated"
    });
  });

  it("does not mistranslate short Spanish phrases when the source language was stale English", async () => {
    await expect(translateForOperator(config, "X favor", "en")).resolves.toMatchObject({
      translatedText: "请问",
      status: "translated"
    });
    await expect(translateForOperator(config, "Información", "en")).resolves.toMatchObject({
      translatedText: "信息",
      status: "translated"
    });
  });

  it("uses context-safe local translations for common Portuguese flow replies", async () => {
    await expect(translateForOperator(config, "Tenho", "pt-BR")).resolves.toMatchObject({
      translatedText: "我有",
      status: "translated"
    });
    await expect(translateForOperator(config, "Estou disponível", "pt-BR")).resolves.toMatchObject({
      translatedText: "我现在有空",
      status: "translated"
    });
    await expect(translateForOperator(config, "O cadastro deu certo", "pt-BR")).resolves.toMatchObject({
      translatedText: "注册成功了",
      status: "translated"
    });
  });

  it("uses the AiTasks translation interface for provider-backed operator translations", async () => {
    const ai = {
      translateText: vi.fn(async () => "我要了解注册步骤")
    };

    const result = await translateForOperator(
      loadConfig({ MINIMAX_API_KEY: "test-key" }),
      "Quiero información del registro",
      "es",
      ai
    );

    expect(ai.translateText).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      targetLanguage: "zh-CN",
      text: "Quiero información del registro",
      systemPrompt: expect.stringContaining("Simplified Chinese")
    }));
    expect(result).toMatchObject({
      translatedText: "我要了解注册步骤",
      status: "translated"
    });
  });

  it("uses the AiTasks translation interface for customer-facing translations", async () => {
    const ai = {
      translateText: vi.fn(async () => "Hola, siga este paso.")
    };

    const result = await translateForCustomer(
      loadConfig({ MINIMAX_API_KEY: "test-key" }),
      "您好，请按这一步操作。",
      "es",
      ai
    );

    expect(ai.translateText).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      targetLanguage: "es",
      text: "您好，请按这一步操作。",
      systemPrompt: expect.stringContaining("target language")
    }));
    expect(result).toMatchObject({
      translatedText: "Hola, siga este paso.",
      status: "translated"
    });
  });

  it("unwraps provider JSON envelopes instead of showing JSON to customers", async () => {
    const ai = {
      translateText: vi.fn(async () => JSON.stringify({
        translatedText: "Olá, posso ajudar você.",
        language: "pt-BR"
      }))
    };

    const result = await translateForCustomer(
      loadConfig({ DEEPSEEK_API_KEY: "test-key", AI_PROVIDER: "deepseek" }),
      "您好，我可以帮助您。",
      "pt-BR",
      ai
    );

    expect(result.translatedText).toBe("Olá, posso ajudar você.");
    expect(result.translatedText).not.toContain("translatedText");
  });
});
