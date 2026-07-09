export type TrainingImportResult = {
  imported: number;
  samples: number;
  knowledge: number;
  warnings?: string[];
};

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
