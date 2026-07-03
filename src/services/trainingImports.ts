import type { AppConfig } from "../config.js";
import { parseTrainingMaterial } from "../import/trainingMaterials.js";
import { parseTrainingSamples } from "../import/trainingSamples.js";
import type { TrainingMaterialRecord, Repositories } from "../repositories.js";
import { appConfigForMerchant } from "./runtimeConfig.js";

export type TrainingImportResult<T> =
  | { ok: true; value: T }
  | { ok: false; statusCode: 400; error: string; message: string };

export async function importTrainingSamplesFromBuffer(
  repos: Repositories,
  merchantId: string,
  input: { buffer: Buffer; filename: string }
): Promise<TrainingImportResult<{ imported: number; enabled: number }>> {
  const countryId = repos.defaultCountryId(merchantId);
  try {
    const samples = await parseTrainingSamples(input.buffer, input.filename);
    const imported = repos.insertTrainingSamples(samples, merchantId, countryId);
    return { ok: true, value: { imported, enabled: imported } };
  } catch (error) {
    return invalidImport("invalid training sample file", error);
  }
}

export async function importTrainingMaterialFromBuffer(
  repos: Repositories,
  config: AppConfig,
  merchantId: string,
  input: { buffer: Buffer; filename: string; mimeType?: string }
): Promise<TrainingImportResult<{ material: TrainingMaterialRecord; imported: number; samples: number; knowledge: number; warnings: string[] }>> {
  const countryId = repos.defaultCountryId(merchantId);
  try {
    const merchantConfig = repos.getMerchantConfig(merchantId);
    const parsed = await parseTrainingMaterial({
      buffer: input.buffer,
      filename: input.filename,
      mimeType: input.mimeType,
      aiConfig: appConfigForMerchant(config, merchantConfig)
    });
    const material = repos.createTrainingMaterial({
      merchantId,
      countryId,
      sourceType: parsed.sourceType,
      filename: input.filename,
      mimeType: input.mimeType ?? "",
      rawText: parsed.rawText,
      warnings: parsed.warnings
    });

    let sampleCount = 0;
    let knowledgeCount = 0;
    for (const sample of parsed.samples) {
      const created = repos.createTrainingSample(merchantId, sample, countryId);
      sampleCount += 1;
      repos.addTrainingMaterialItem({
        materialId: material.id,
        merchantId,
        countryId,
        kind: "sample",
        sampleId: created.id,
        title: sample.customerMessage.slice(0, 80),
        content: `${sample.customerMessage}\n${sample.standardReply}`,
        intent: sample.intent,
        stage: sample.stage,
        language: sample.language,
        enabled: sample.enabled
      });
    }
    for (const item of parsed.knowledge) {
      const created = repos.createKnowledgeItem(merchantId, { ...item, countryId });
      knowledgeCount += 1;
      repos.addTrainingMaterialItem({
        materialId: material.id,
        merchantId,
        countryId,
        kind: "knowledge",
        knowledgeId: created.id,
        title: item.title,
        content: item.content,
        intent: "unknown",
        stage: "",
        language: item.language,
        enabled: item.enabled
      });
    }

    const finalized = repos.finalizeTrainingMaterial(material.id, merchantId, {
      itemCount: sampleCount + knowledgeCount,
      sampleCount,
      knowledgeCount,
      warnings: parsed.warnings
    });
    return { ok: true, value: { material: finalized, imported: sampleCount + knowledgeCount, samples: sampleCount, knowledge: knowledgeCount, warnings: finalized.warnings } };
  } catch (error) {
    return invalidImport("invalid training material file", error);
  }
}

function invalidImport(error: string, cause: unknown): TrainingImportResult<never> {
  return {
    ok: false,
    statusCode: 400,
    error,
    message: cause instanceof Error ? cause.message : "unknown parse error"
  };
}
