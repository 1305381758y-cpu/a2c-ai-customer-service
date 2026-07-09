import { describe, expect, it } from "vitest";

import { trainingImportEndpoint, trainingImportMessage, trainingMaterialColumns, trainingMaterialsBase, trainingMaterialsRowsUrl, trainingPasteFile, trainingSelectedCountryId } from "../frontend/src/training/TrainingMaterialsPageHelpers.js";
import type { MerchantCountry } from "../frontend/src/types.js";

describe("frontend training materials page helpers", () => {
  it("builds platform and merchant material endpoints", () => {
    expect(trainingMaterialsBase(false)).toBe("/api/merchant/training-materials");
    expect(trainingMaterialsBase(true)).toBe("/api/admin/training-materials");
    expect(trainingImportEndpoint(false)).toBe("/api/merchant/training-materials/import");
    expect(trainingImportEndpoint(true)).toBe("/api/admin/training-materials/import");
  });

  it("keeps merchant list filters scoped to supported fields", () => {
    expect(trainingMaterialsRowsUrl(false, { merchantId: "m-1", countryId: "bo", sourceType: "txt", status: "enabled", limit: "100" })).toBe(
      "/api/merchant/training-materials?countryId=bo&sourceType=txt&status=enabled&limit=100"
    );
    expect(trainingMaterialsRowsUrl(true, { merchantId: "m-1", countryId: "bo", limit: "100" })).toBe(
      "/api/admin/training-materials?merchantId=m-1&countryId=bo&limit=100"
    );
  });

  it("uses the selected country or falls back to the first configured country", () => {
    expect(trainingSelectedCountryId({ countryId: "selected" }, [country("first")])).toBe("selected");
    expect(trainingSelectedCountryId({}, [country("first")])).toBe("first");
    expect(trainingSelectedCountryId({}, [])).toBe("");
  });

  it("builds paste imports and user-facing import messages", async () => {
    const file = trainingPasteFile("hello");
    expect(file.name).toBe("pasted-material.txt");
    expect(file.type).toBe("text/plain");
    expect(await file.text()).toBe("hello");

    expect(trainingImportMessage({ imported: 2, samples: 1, knowledge: 1 }, false)).toBe("已导入 2 条：样本 1，知识 1");
    expect(trainingImportMessage({ imported: 2, samples: 1, knowledge: 1, warnings: ["有一行为空"] }, true)).toBe("已学习 2 条内容，后续回复会自动参考；有一行为空");
  });

  it("keeps table columns aligned with platform and simplified views", () => {
    expect(trainingMaterialColumns(true, false)).toContain("merchantId");
    expect(trainingMaterialColumns(false, true)).not.toContain("sampleCount");
    expect(trainingMaterialColumns(false, false)).toContain("knowledgeCount");
  });
});

function country(id: string): MerchantCountry {
  return {
    id,
    merchantId: "merchant-1",
    code: "bo",
    name: "玻利维亚",
    defaultLanguage: "es",
    platformRegisterUrl: "",
    tgRegisterGuideUrl: "",
    requirePlatformAccount: true,
    requirePhone: true,
    requireTelegram: true,
    requireWhatsApp: false,
    status: "active"
  };
}
