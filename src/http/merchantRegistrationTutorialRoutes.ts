import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { requireUser } from "../auth.js";
import type { AppConfig } from "../config.js";
import type { MerchantConfigRecord, Repositories } from "../repositories.js";
import { storeRegistrationTutorialImage } from "../services/registrationTutorialImages.js";
import { sendResult } from "./routeResponses.js";
import { scopedMerchantId } from "./routeHelpers.js";

type MerchantRegistrationTutorialRoutesDeps = {
  config: AppConfig;
  repos: Repositories;
  adminOnly: ReturnType<typeof requireUser>;
  merchantAdmins: ReturnType<typeof requireUser>;
  maskConfig: (config: MerchantConfigRecord) => Record<string, unknown>;
};

export function registerMerchantRegistrationTutorialRoutes(app: FastifyInstance, deps: MerchantRegistrationTutorialRoutesDeps): void {
  app.post<{ Params: { id: string } }>("/api/admin/merchants/:id/config/registration-tutorial-image", { preHandler: deps.adminOnly }, async (request, reply) => uploadRegistrationTutorialImage(request, reply, deps, request.params.id));
  app.post("/api/merchant/config/registration-tutorial-image", { preHandler: deps.merchantAdmins }, async (request, reply) => uploadRegistrationTutorialImage(request, reply, deps, scopedMerchantId(request)));
}

function requestOrigin(request: FastifyRequest): string {
  const proto = String(request.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = request.headers["x-forwarded-host"] || request.headers.host || "localhost";
  return `${proto}://${host}`;
}

async function uploadRegistrationTutorialImage(request: FastifyRequest, reply: FastifyReply, deps: MerchantRegistrationTutorialRoutesDeps, merchantId: string) {
  let uploadError = "";
  const file = await request.file().catch((error) => {
    uploadError = error instanceof Error ? error.message : "图片上传失败";
    return undefined;
  });
  if (uploadError) return reply.code(413).send({ error: "图片过大或上传失败", message: "注册教程图片上传失败，请压缩后重试。" });
  if (!file) return reply.code(400).send({ error: "请上传注册教程图片" });
  const buffer = await file.toBuffer().catch(() => null);
  if (!buffer) return reply.code(413).send({ error: "图片过大或读取失败", message: "注册教程图片读取失败，请压缩后重试。" });
  return sendResult(reply, storeRegistrationTutorialImage(deps.config, deps.repos, deps.maskConfig, {
    merchantId,
    filename: file.filename,
    mimeType: file.mimetype,
    buffer,
    origin: requestOrigin(request)
  }));
}
