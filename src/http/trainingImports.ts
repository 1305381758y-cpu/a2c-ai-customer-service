import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import { parseTrainingMaterial } from "../import/trainingMaterials.js";
import { parseTrainingSamples } from "../import/trainingSamples.js";
import type { Repositories } from "../repositories.js";
import { appConfigForMerchant } from "../services/runtimeConfig.js";

export async function importSamples(request: FastifyRequest, reply: FastifyReply, deps: { repos: Repositories }, merchantId: string) {
  let uploadError = "";
  const file = await request.file().catch((error) => {
    uploadError = error instanceof Error ? error.message : "文件上传失败";
    return undefined;
  });
  if (uploadError) return reply.code(413).send({ error: "文件过大或上传失败", message: "当前单个文件最大支持 100MB，请压缩或拆分后重试。" });
  if (!file) return reply.code(400).send({ error: "file is required" });
  const countryId = deps.repos.defaultCountryId(merchantId);
  const buffer = await file.toBuffer().catch(() => null);
  if (!buffer) return reply.code(413).send({ error: "文件过大或读取失败", message: "当前单个文件最大支持 100MB，请压缩或拆分后重试。" });
  try {
    const samples = await parseTrainingSamples(buffer, file.filename);
    const imported = deps.repos.insertTrainingSamples(samples, merchantId, countryId);
    return { imported, enabled: imported };
  } catch (error) {
    return reply.code(400).send({ error: "invalid training sample file", message: error instanceof Error ? error.message : "unknown parse error" });
  }
}

export async function importMaterial(request: FastifyRequest, reply: FastifyReply, deps: { config: AppConfig; repos: Repositories }, merchantId: string) {
  let uploadError = "";
  const file = await request.file().catch((error) => {
    uploadError = error instanceof Error ? error.message : "文件上传失败";
    return undefined;
  });
  if (uploadError) return reply.code(413).send({ error: "文件过大或上传失败", message: "当前单个文件最大支持 100MB，请压缩或拆分后重试。" });
  if (!file) return reply.code(400).send({ error: "file is required" });
  const countryId = deps.repos.defaultCountryId(merchantId);
  const buffer = await file.toBuffer().catch(() => null);
  if (!buffer) return reply.code(413).send({ error: "文件过大或读取失败", message: "当前单个文件最大支持 100MB，请压缩或拆分后重试。" });
  try {
    const merchantConfig = deps.repos.getMerchantConfig(merchantId);
    const parsed = await parseTrainingMaterial({
      buffer,
      filename: file.filename,
      mimeType: file.mimetype,
      aiConfig: appConfigForMerchant(deps.config, merchantConfig)
    });
    const material = deps.repos.createTrainingMaterial({
      merchantId,
      countryId,
      sourceType: parsed.sourceType,
      filename: file.filename,
      mimeType: file.mimetype,
      rawText: parsed.rawText,
      warnings: parsed.warnings
    });

    let sampleCount = 0;
    let knowledgeCount = 0;
    for (const sample of parsed.samples) {
      const created = deps.repos.createTrainingSample(merchantId, sample, countryId);
      sampleCount += 1;
      deps.repos.addTrainingMaterialItem({
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
      const created = deps.repos.createKnowledgeItem(merchantId, { ...item, countryId });
      knowledgeCount += 1;
      deps.repos.addTrainingMaterialItem({
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

    const finalized = deps.repos.finalizeTrainingMaterial(material.id, merchantId, {
      itemCount: sampleCount + knowledgeCount,
      sampleCount,
      knowledgeCount,
      warnings: parsed.warnings
    });
    return { material: finalized, imported: sampleCount + knowledgeCount, samples: sampleCount, knowledge: knowledgeCount, warnings: finalized.warnings };
  } catch (error) {
    return reply.code(400).send({ error: "invalid training material file", message: error instanceof Error ? error.message : "unknown parse error" });
  }
}
