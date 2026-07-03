import { describe, expect, it } from "vitest";

import { countryLabel, inferCountryProfile } from "../frontend/src/ui/country.js";

describe("country utilities", () => {
  it("localizes country names, codes, and prefixed values", () => {
    expect(countryLabel("br")).toBe("巴西");
    expect(countryLabel("Brazil")).toBe("巴西");
    expect(countryLabel("merchant:bo")).toBe("玻利维亚");
    expect(countryLabel("")).toBe("");
  });

  it("infers configured country profiles from Chinese names, codes, and aliases", () => {
    expect(inferCountryProfile("玻利维亚")).toEqual({ code: "bo", defaultLanguage: "es" });
    expect(inferCountryProfile("bolivia")).toEqual({ code: "bo", defaultLanguage: "es" });
    expect(inferCountryProfile("pt")).toEqual({ code: "pt", defaultLanguage: "en" });
    expect(inferCountryProfile("")).toEqual({ code: "default", defaultLanguage: "en" });
  });
});
