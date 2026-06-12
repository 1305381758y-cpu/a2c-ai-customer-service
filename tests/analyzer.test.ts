import { describe, expect, it } from "vitest";
import { analyzeMessage, detectLanguage, extractPhone, extractTelegram } from "../src/domain/analyzer.js";

describe("message analyzer", () => {
  it("extracts phone and telegram", () => {
    expect(extractPhone("my phone is +60 12-345 6789")).toBe("+60123456789");
    expect(extractTelegram("tg: @customer_123")).toBe("@customer_123");
  });

  it("detects languages", () => {
    expect(detectLanguage("你好")).toBe("zh");
    expect(detectLanguage("hello")).toBe("en");
    expect(detectLanguage("こんにちは")).toBe("ja");
    expect(detectLanguage("登録したいです")).toBe("ja");
    expect(detectLanguage("saya mahu daftar")).toBe("ms");
    expect(detectLanguage("olá, quero fazer cadastro")).toBe("pt-BR");
  });

  it("classifies phone and telegram completion", () => {
    const result = analyzeMessage("phone +60123456789 tg @customer_123");
    expect(result.intent).toBe("provide_phone_and_telegram");
    expect(result.stage).toBe("ready_for_handoff");
  });

  it("classifies registration questions before generic help", () => {
    expect(analyzeMessage("我要怎么注册").intent).toBe("ask_platform_register");
    expect(analyzeMessage("how to register").intent).toBe("ask_platform_register");
    expect(analyzeMessage("como faço o cadastro?").intent).toBe("ask_platform_register");
    expect(analyzeMessage("isso é seguro?").intent).toBe("trust_concern");
    expect(analyzeMessage("こんにちは").intent).toBe("greeting");
  });
});
