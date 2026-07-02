import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { requireUser } from "../auth.js";
import type { AppConfig } from "../config.js";
import type { MerchantConfigRecord, Repositories } from "../repositories.js";
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
  if (!isAllowedTutorialImage(file.filename, file.mimetype)) {
    return reply.code(400).send({ error: "只支持图片文件", message: "请上传 PNG、JPG、JPEG、WEBP 或 GIF 图片。" });
  }
  const buffer = await file.toBuffer().catch(() => null);
  if (!buffer) return reply.code(413).send({ error: "图片过大或读取失败", message: "注册教程图片读取失败，请压缩后重试。" });
  const ext = tutorialImageExtension(file.filename, file.mimetype);
  const uploadDir = registrationUploadDir(deps.config);
  mkdirSync(uploadDir, { recursive: true });
  const filename = `${merchantId.replace(/[^a-zA-Z0-9_-]/g, "_")}-${Date.now()}-${randomUUID()}${ext}`;
  writeFileSync(join(uploadDir, filename), buffer);
  const imageUrl = `${requestOrigin(request)}/uploads/${encodeURIComponent(filename)}`;
  const config = deps.repos.patchMerchantConfig(merchantId, { registrationTutorialImageUrl: imageUrl });
  return { ok: true, imageUrl, config: deps.maskConfig(config) };
}

function registrationUploadDir(config: AppConfig): string {
  return config.DATABASE_URL === ":memory:" ? join(process.cwd(), "data", "uploads") : join(dirname(resolve(config.DATABASE_URL)), "uploads");
}

function isAllowedTutorialImage(filename: string, mimeType = ""): boolean {
  const mime = mimeType.toLowerCase();
  const name = filename.toLowerCase();
  return /^(image\/)(png|jpe?g|webp|gif)$/.test(mime) || /\.(png|jpe?g|webp|gif)$/i.test(name);
}

function tutorialImageExtension(filename: string, mimeType = ""): string {
  const ext = extname(filename).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext)) return ext;
  const mime = mimeType.toLowerCase();
  if (mime.includes("png")) return ".png";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("gif")) return ".gif";
  return ".jpg";
}
