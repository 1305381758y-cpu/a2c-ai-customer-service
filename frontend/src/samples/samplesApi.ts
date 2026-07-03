import { api, loadRows, withQuery } from "../app/api.js";
import type { Filters, Sample } from "../types.js";
import { coercePatch } from "../ui/form.js";
import { translateSystemMessage } from "../ui/formatters.js";

export type SampleTrainingImportResult = {
  imported: number;
  samples: number;
  knowledge: number;
  warnings?: string[];
};

export function samplesBase(platform: boolean): "/api/admin/training-samples" | "/api/merchant/training-samples" {
  return platform ? "/api/admin/training-samples" : "/api/merchant/training-samples";
}

export function buildSamplesUrl(platform: boolean, filters: Filters): string {
  return withQuery(
    samplesBase(platform),
    platform ? filters : {
      countryId: filters.countryId,
      language: filters.language,
      intent: filters.intent,
      stage: filters.stage,
      enabled: filters.enabled
    }
  );
}

export async function loadSamples(url: string): Promise<Sample[]> {
  return await loadRows<Sample>(url);
}

export async function importSampleTrainingFile(
  file: File,
  countryId: string,
  fetcher: typeof fetch = fetch
): Promise<SampleTrainingImportResult> {
  const body = new FormData();
  body.append("file", file);
  body.append("countryId", countryId);
  const response = await fetcher("/api/merchant/training-materials/import", { method: "POST", body });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(translateSystemMessage(payload.error || payload.message || "上传失败"));
  }
  return await response.json() as SampleTrainingImportResult;
}

export async function updateSample(base: string, sampleId: number, patch: Partial<Sample>): Promise<void> {
  await api(`${base}/${sampleId}`, { method: "PATCH", body: JSON.stringify(coercePatch(patch)) });
}

export async function deleteSample(base: string, sampleId: number): Promise<void> {
  await api(`${base}/${sampleId}`, { method: "DELETE" });
}
