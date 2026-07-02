import { describe, expect, it, vi } from "vitest";
import { detectAiLanguage, normalizeAiLanguageCode } from "../src/clients/aiLanguageDetection.js";
import { loadConfig } from "../src/config.js";

const config = loadConfig({});

describe("AI language detection task", () => {
  it("normalizes provider language aliases into supported reply language codes", () => {
    expect(normalizeAiLanguageCode(" Spanish ")).toBe("es");
    expect(normalizeAiLanguageCode("español")).toBe("es");
    expect(normalizeAiLanguageCode("Português")).toBe("pt-BR");
    expect(normalizeAiLanguageCode("ptbr")).toBe("pt-BR");
    expect(normalizeAiLanguageCode("klingon")).toBe("unknown");
  });

  it("does not call the provider runtime without a usable key", async () => {
    const generateText = vi.fn(async () => "es");

    const result = await detectAiLanguage(config, {
      customerText: "Si",
      previousLanguage: "en",
      countryDefaultLanguage: "es",
      recentHistory: []
    }, {
      hasUsableAiKey: () => false,
      generateText
    });

    expect(result).toBe("unknown");
    expect(generateText).not.toHaveBeenCalled();
  });

  it("uses the injected runtime and normalizes the provider result", async () => {
    const generateText = vi.fn(async () => "Spanish");

    const result = await detectAiLanguage(config, {
      customerText: "X favor",
      previousLanguage: "unknown",
      countryDefaultLanguage: "es",
      recentHistory: [{ direction: "inbound", content: "Información", intent: "unknown", createdAt: "" }]
    }, {
      hasUsableAiKey: () => true,
      generateText
    });

    expect(result).toBe("es");
    expect(generateText).toHaveBeenCalledWith(expect.any(Object), expect.stringContaining("X favor"), expect.objectContaining({
      maxOutputTokens: 24,
      temperature: 0
    }));
  });
});
