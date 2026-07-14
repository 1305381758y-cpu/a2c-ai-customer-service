import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import type { Repositories } from "../repositories.js";
import { importTrainingMaterialFromBuffer, importTrainingSamplesFromBuffer, type TrainingImportResult } from "../services/trainingImports.js";

export async function importSamples(request: FastifyRequest, reply: FastifyReply, deps: { repos: Repositories }, merchantId: string) {
  let uploadError = "";
  const file = await request.file().catch((error) => {
    uploadError = error instanceof Error ? error.message : "文件上传失败";
    return undefined;
  });
  if (uploadError) return reply.code(413).send({ error: "文件过大或上传失败", message: "当前单个文件最大支持 100MB，请压缩或拆分后重试。" });
  if (!file) return reply.code(400).send({ error: "file is required" });
  const buffer = await file.toBuffer().catch(() => null);
  if (!buffer) return reply.code(413).send({ error: "文件过大或读取失败", message: "当前单个文件最大支持 100MB，请压缩或拆分后重试。" });
  return sendImportResult(reply, await importTrainingSamplesFromBuffer(deps.repos, merchantId, { buffer, filename: file.filename }));
}

export async function importMaterial(request: FastifyRequest, reply: FastifyReply, deps: { config: AppConfig; repos: Repositories }, merchantId: string) {
  let uploadError = "";
  const file = await request.file().catch((error) => {
    uploadError = error instanceof Error ? error.message : "文件上传失败";
    return undefined;
  });
  if (uploadError) return reply.code(413).send({ error: "文件过大或上传失败", message: "当前单个文件最大支持 100MB，请压缩或拆分后重试。" });
  if (!file) return reply.code(400).send({ error: "file is required" });
  const fields = (file as unknown as { fields?: Record<string, { value?: string }> }).fields || {};
  const countryId = fields.countryId?.value || "";
  const buffer = await file.toBuffer().catch(() => null);
  if (!buffer) return reply.code(413).send({ error: "文件过大或读取失败", message: "当前单个文件最大支持 100MB，请压缩或拆分后重试。" });
  return sendImportResult(reply, await importTrainingMaterialFromBuffer(deps.repos, deps.config, merchantId, { buffer, filename: file.filename, mimeType: file.mimetype, countryId }));
}

function sendImportResult<T>(reply: FastifyReply, result: TrainingImportResult<T>) {
  if (!result.ok) return reply.code(result.statusCode).send({ error: result.error, message: result.message });
  return result.value;
}
