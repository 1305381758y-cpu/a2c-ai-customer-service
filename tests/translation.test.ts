import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { translateForOperator } from "../src/services/translation.js";

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
});
