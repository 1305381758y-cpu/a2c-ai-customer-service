import { withQuery } from "../app/api.js";
import type { Filters, MerchantCountry } from "../types.js";

export type TrainingImportResult = {
  imported: number;
  samples: number;
  knowledge: number;
  warnings?: string[];
};

export function trainingMaterialsBase(platform: boolean) {
  return platform ? "/api/admin/training-materials" : "/api/merchant/training-materials";
}

export function trainingMaterialsRowsUrl(platform: boolean, filters: Filters, page: number, pageSize: number) {
  const base = trainingMaterialsBase(platform);
  const scoped = platform ? filters : {
    countryId: filters.countryId,
    sourceType: filters.sourceType,
    status: filters.status
  };
  return withQuery(base, { ...scoped, limit: String(pageSize), offset: String((page - 1) * pageSize) });
}

export function trainingImportEndpoint(platform: boolean) {
  return platform ? "/api/admin/training-materials/import" : "/api/merchant/training-materials/import";
}

export function trainingSelectedCountryId(filters: Filters, countries: MerchantCountry[]) {
  return filters.countryId || countries[0]?.id || "";
}

export function trainingPasteFile(text: string) {
  return new File([text], "pasted-material.txt", { type: "text/plain" });
}

export function trainingMaterialColumns(platform: boolean, simple: boolean) {
  if (platform) return ["merchantId", "countryName", "filename", "sourceType", "itemCount", "sampleCount", "knowledgeCount", "status", "createdAt"];
  if (simple) return ["countryName", "filename", "sourceType", "itemCount", "status", "createdAt"];
  return ["countryName", "filename", "sourceType", "itemCount", "sampleCount", "knowledgeCount", "status", "createdAt"];
}

export function trainingImportMessage(result: TrainingImportResult, simple: boolean) {
  const warnings = result.warnings?.length ? `；${result.warnings.join("；")}` : "";
  if (simple) return `已学习 ${result.imported} 条内容，后续回复会自动参考${warnings}`;
  return `已导入 ${result.imported} 条：样本 ${result.samples}，知识 ${result.knowledge}${warnings}`;
}
