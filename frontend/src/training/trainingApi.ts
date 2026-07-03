import { api } from "../app/api.js";
import type { TrainingMaterial, TrainingMaterialItem } from "../types.js";
import { translateSystemMessage } from "../ui/formatters.js";

export type TrainingMaterialDetail = {
  material: TrainingMaterial;
  items: TrainingMaterialItem[];
};

export type TrainingMaterialImportResult = {
  imported: number;
  samples: number;
  knowledge: number;
  warnings?: string[];
};

export async function loadTrainingMaterialDetail(base: string, materialId: number): Promise<TrainingMaterialDetail> {
  return await api<TrainingMaterialDetail>(`${base}/${materialId}`);
}

export async function deleteTrainingMaterial(base: string, materialId: number): Promise<void> {
  await api(`${base}/${materialId}`, { method: "DELETE" });
}

export async function importTrainingMaterial(
  url: string,
  file: File,
  countryId: string,
  fetcher: typeof fetch = fetch
): Promise<TrainingMaterialImportResult> {
  const body = new FormData();
  body.append("file", file);
  body.append("countryId", countryId);
  const response = await fetcher(url, { method: "POST", body });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(translateSystemMessage(payload.error || payload.message || "上传失败"));
  }
  return await response.json() as TrainingMaterialImportResult;
}
