import { translateSystemMessage } from "../ui/formatters.js";
import type { ConfigForm } from "./types.js";

export type RegistrationTutorialUploadResult = {
  imageUrl: string;
  config: ConfigForm;
};

export async function uploadRegistrationTutorialImage(
  url: string,
  file: File,
  fetcher: typeof fetch = fetch
): Promise<RegistrationTutorialUploadResult> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetcher(url, { method: "POST", body });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(translateSystemMessage(payload.message || payload.error || "注册教程图片上传失败"));
  }
  return await response.json() as RegistrationTutorialUploadResult;
}
