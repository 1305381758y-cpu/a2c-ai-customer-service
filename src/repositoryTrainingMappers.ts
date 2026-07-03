import { parseJsonArray } from "./repositoryJson.js";
import { normalizeKnowledgeType } from "./repositoryStatuses.js";
import type { KnowledgeItemRecord, TrainingMaterialItemRecord, TrainingMaterialRecord } from "./repositoryTypes.js";

export function mapKnowledgeItem(row: Record<string, unknown>): KnowledgeItemRecord {
  const merchantId = String(row.merchant_id ?? "default");
  return {
    id: Number(row.id),
    merchantId,
    countryId: String(row.country_id ?? `${merchantId}:default`),
    type: normalizeKnowledgeType(row.type),
    title: String(row.title ?? ""),
    content: String(row.content ?? ""),
    language: String(row.language ?? "zh"),
    priority: Number(row.priority ?? 0),
    enabled: Boolean(Number(row.enabled ?? 1))
  };
}

export function mapTrainingMaterial(row: Record<string, unknown>): TrainingMaterialRecord {
  const merchantId = String(row.merchant_id ?? "default");
  return {
    id: Number(row.id),
    merchantId,
    countryId: String(row.country_id ?? `${merchantId}:default`),
    countryCode: String(row.country_code ?? "default"),
    countryName: String(row.country_name ?? "默认国家"),
    sourceType: String(row.source_type ?? "txt"),
    filename: String(row.filename ?? ""),
    mimeType: String(row.mime_type ?? ""),
    status: String(row.status ?? "enabled") as "enabled" | "disabled",
    rawText: String(row.raw_text ?? ""),
    itemCount: Number(row.item_count ?? 0),
    sampleCount: Number(row.sample_count ?? 0),
    knowledgeCount: Number(row.knowledge_count ?? 0),
    warnings: parseJsonArray(row.warnings_json),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

export function mapTrainingMaterialItem(row: Record<string, unknown>): TrainingMaterialItemRecord {
  const merchantId = String(row.merchant_id ?? "default");
  return {
    id: Number(row.id),
    materialId: Number(row.material_id),
    merchantId,
    countryId: String(row.country_id ?? `${merchantId}:default`),
    kind: String(row.kind ?? "knowledge") as "sample" | "knowledge",
    sampleId: row.sample_id === null || row.sample_id === undefined ? null : Number(row.sample_id),
    knowledgeId: row.knowledge_id === null || row.knowledge_id === undefined ? null : Number(row.knowledge_id),
    title: String(row.title ?? ""),
    content: String(row.content ?? ""),
    intent: String(row.intent ?? "unknown"),
    stage: String(row.stage ?? ""),
    language: String(row.language ?? "zh"),
    enabled: Boolean(Number(row.enabled ?? 1))
  };
}
