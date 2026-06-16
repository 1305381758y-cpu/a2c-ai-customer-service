import { describe, expect, it } from "vitest";
import { analyzeMessage, detectLanguage, extractPhone, extractTelegram } from "../src/domain/analyzer.js";

describe("message analyzer", () => {
  it("extracts phone and telegram", () => {
    expect(extractPhone("my phone is +60 12-345 6789")).toBe("+60123456789");
    expect(extractTelegram("tg: @customer_123")).toBe("@customer_123");
  });

  it("does not extract phone numbers from media urls", () => {
    const url = "https://bucket-chatapp-file-internal.oss-ap-southeast-1.aliyuncs.com/1226109357673717760.jpg?Expires=1782043661";
    expect(extractPhone(url)).toBe("");
    expect(analyzeMessage(url).phone).toBe("");
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

  it("classifies natural first-contact consultation messages", () => {
    expect(analyzeMessage("你好，我想找一份工作").intent).toBe("greeting");
    expect(analyzeMessage("我想了解这份工作").intent).toBe("greeting");
    expect(analyzeMessage("介绍一下").intent).toBe("greeting");
    expect(analyzeMessage("可以聊聊吗").intent).toBe("greeting");
    expect(analyzeMessage("什么平台").intent).toBe("ask_platform_register");
    expect(analyzeMessage("哪个平台开户").intent).toBe("ask_platform_register");
    expect(analyzeMessage("我不会操作，你帮我").intent).toBe("need_help");
  });

  it("classifies common global greetings as greetings instead of spam", () => {
    const cases = [
      ["你好", "zh"],
      ["您好", "zh"],
      ["在吗", "zh"],
      ["hello", "en"],
      ["good morning", "en"],
      ["olá", "pt-BR"],
      ["oi", "pt-BR"],
      ["bom dia", "pt-BR"],
      ["hola", "es"],
      ["bonjour", "fr"],
      ["こんにちは", "ja"],
      ["안녕하세요", "ko"],
      ["สวัสดี", "th"],
      ["مرحبا", "ar"],
      ["привет", "ru"],
      ["xin chào", "vi"]
    ] as const;

    for (const [text, language] of cases) {
      const result = analyzeMessage(text);
      expect(result.intent, text).toBe("greeting");
      expect(result.intent, text).not.toBe("irrelevant_or_spam");
      expect(result.language, text).toBe(language);
    }
  });
});
