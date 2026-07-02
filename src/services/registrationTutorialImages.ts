import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import type { AppConfig } from "../config.js";
import type { MerchantConfigRecord, Repositories } from "../repositories.js";

export type RegistrationTutorialImageInput = {
  merchantId: string;
  filename: string;
  mimeType?: string;
  buffer: Buffer;
  origin: string;
};

export type RegistrationTutorialImageResult =
  | {
      ok: true;
      value: {
        ok: true;
        imageUrl: string;
        config: Record<string, unknown>;
      };
    }
  | {
      ok: false;
      statusCode: 400 | 413;
      error: string;
      message?: string;
    };

export function storeRegistrationTutorialImage(
  config: AppConfig,
  repos: Repositories,
  maskConfig: (config: MerchantConfigRecord) => Record<string, unknown>,
  input: RegistrationTutorialImageInput
): RegistrationTutorialImageResult {
  if (!isAllowedTutorialImage(input.filename, input.mimeType)) {
    return {
      ok: false,
      statusCode: 400,
      error: "只支持图片文件",
      message: "请上传 PNG、JPG、JPEG、WEBP 或 GIF 图片。"
    };
  }

  if (!input.buffer.length) {
    return {
      ok: false,
      statusCode: 413,
      error: "图片过大或读取失败",
      message: "注册教程图片读取失败，请压缩后重试。"
    };
  }

  const ext = tutorialImageExtension(input.filename, input.mimeType);
  const uploadDir = registrationUploadDir(config);
  mkdirSync(uploadDir, { recursive: true });
  const filename = `${input.merchantId.replace(/[^a-zA-Z0-9_-]/g, "_")}-${Date.now()}-${randomUUID()}${ext}`;
  writeFileSync(join(uploadDir, filename), input.buffer);
  const imageUrl = `${input.origin}/uploads/${encodeURIComponent(filename)}`;
  const merchantConfig = repos.patchMerchantConfig(input.merchantId, { registrationTutorialImageUrl: imageUrl });

  return {
    ok: true,
    value: {
      ok: true,
      imageUrl,
      config: maskConfig(merchantConfig)
    }
  };
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
