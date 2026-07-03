import type { FastifyReply, FastifyRequest } from "fastify";
import { requestUser } from "../auth.js";
import { parseScriptFlowFile } from "../import/scriptFlows.js";
import type { Repositories } from "../repositories.js";

export async function importScriptFlow(request: FastifyRequest, reply: FastifyReply, deps: { repos: Repositories }, scopedMerchantId?: string) {
  let uploadError = "";
  const file = await request.file().catch((error) => {
    uploadError = error instanceof Error ? error.message : "文件上传失败";
    return undefined;
  });
  if (uploadError) return reply.code(413).send({ error: "文件过大或上传失败", message: "当前单个文件最大支持 100MB，请压缩或拆分后重试。" });
  if (!file) return reply.code(400).send({ error: "file is required" });
  const query = request.query as Record<string, string | undefined>;
  const fields = (file as unknown as { fields?: Record<string, { value?: string }> }).fields || {};
  const merchantId = scopedMerchantId || query.merchantId || fields.merchantId?.value || "default";
  const countryId = query.countryId || fields.countryId?.value || deps.repos.defaultCountryId(merchantId);
  const name = query.name || fields.name?.value || file.filename.replace(/\.(xlsx|xls|docx|txt|md|csv)$/i, "") || "话本流程";
  const buffer = await file.toBuffer().catch(() => null);
  if (!buffer) return reply.code(413).send({ error: "文件过大或读取失败", message: "当前单个文件最大支持 100MB，请压缩或拆分后重试。" });
  try {
    const steps = await parseScriptFlowFile(buffer, file.filename, file.mimetype);
    const result = deps.repos.createScriptFlow(merchantId, {
      name,
      countryId,
      sourceFilename: file.filename,
      steps: steps as unknown as Array<Record<string, unknown>>,
      createdBy: requestUser(request).name
    });
    return { ...result, imported: steps.length };
  } catch (error) {
    return reply.code(400).send({ error: "invalid script flow file", message: error instanceof Error ? error.message : "unknown parse error" });
  }
}
