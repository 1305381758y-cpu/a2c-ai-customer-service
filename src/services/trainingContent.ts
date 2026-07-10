import type { TrainingSampleForSearch } from "../domain/sampleRetrieval.js";
import type {
  KnowledgeItemRecord,
  Repositories,
  TrainingMaterialItemRecord,
  TrainingMaterialRecord
} from "../repositories.js";

type TrainingContentResult<T> =
  | { ok: true; value: T }
  | { ok: false; statusCode: 400 | 404; error: string };

export type KnowledgeListQuery = {
  merchantId?: string;
  countryId?: string;
  type?: string;
  enabled?: string;
  limit?: string;
  offset?: string;
};

export type TrainingMaterialListQuery = {
  merchantId?: string;
  countryId?: string;
  sourceType?: string;
  status?: string;
  limit?: string;
  offset?: string;
};

export type TrainingSampleListQuery = {
  merchantId?: string;
  countryId?: string;
  language?: string;
  intent?: string;
  stage?: string;
  enabled?: string;
  limit?: string;
  offset?: string;
};

export function listKnowledgeItems(repos: Repositories, query: KnowledgeListQuery = {}): { rows: KnowledgeItemRecord[]; total: number } {
  const filters = {
    merchantId: query.merchantId,
    countryId: query.countryId,
    type: query.type,
    enabled: parseOptionalBoolean(query.enabled)
  };
  return {
    rows: repos.listKnowledgeItems({ ...filters, limit: parseLimit(query.limit), offset: parseOffset(query.offset) }),
    total: repos.countKnowledgeItems(filters)
  };
}

export function createKnowledgeItem(
  repos: Repositories,
  merchantId: string,
  body: Record<string, unknown>
): TrainingContentResult<KnowledgeItemRecord> {
  try {
    return { ok: true, value: repos.createKnowledgeItem(merchantId, body) };
  } catch (error) {
    return { ok: false, statusCode: 400, error: error instanceof Error ? error.message : "invalid knowledge item" };
  }
}

export function patchKnowledgeItem(
  repos: Repositories,
  idParam: string,
  body: Record<string, unknown>,
  merchantId?: string
): TrainingContentResult<KnowledgeItemRecord> {
  const id = parseId(idParam);
  if (id === undefined) return invalidId();
  const row = repos.patchKnowledgeItem(id, body, merchantId);
  if (!row) return { ok: false, statusCode: 404, error: "knowledge item not found" };
  return { ok: true, value: row };
}

export function deleteKnowledgeItem(
  repos: Repositories,
  idParam: string,
  merchantId?: string
): TrainingContentResult<{ ok: true }> {
  const id = parseId(idParam);
  if (id === undefined) return invalidId();
  const ok = repos.deleteKnowledgeItem(id, merchantId);
  if (!ok) return { ok: false, statusCode: 404, error: "knowledge item not found" };
  return { ok: true, value: { ok: true } };
}

export function listTrainingMaterials(
  repos: Repositories,
  query: TrainingMaterialListQuery = {}
): { rows: TrainingMaterialRecord[]; total: number } {
  const filters = {
    merchantId: query.merchantId,
    countryId: query.countryId,
    sourceType: query.sourceType,
    status: query.status
  };
  return {
    rows: repos.listTrainingMaterials({ ...filters, limit: parseLimit(query.limit), offset: parseOffset(query.offset) }),
    total: repos.countTrainingMaterials(filters)
  };
}

export function getTrainingMaterialWithItems(
  repos: Repositories,
  idParam: string,
  merchantId?: string
): TrainingContentResult<{ material: TrainingMaterialRecord; items: TrainingMaterialItemRecord[] }> {
  const id = parseId(idParam);
  if (id === undefined) return invalidId();
  const material = repos.getTrainingMaterial(id, merchantId);
  if (!material) return { ok: false, statusCode: 404, error: "material not found" };
  return { ok: true, value: { material, items: repos.listTrainingMaterialItems(id, merchantId) } };
}

export function deleteTrainingMaterial(
  repos: Repositories,
  idParam: string,
  merchantId?: string
): TrainingContentResult<{ ok: true }> {
  const id = parseId(idParam);
  if (id === undefined) return invalidId();
  const ok = repos.deleteTrainingMaterial(id, merchantId);
  if (!ok) return { ok: false, statusCode: 404, error: "material not found" };
  return { ok: true, value: { ok: true } };
}

export function listTrainingSamples(
  repos: Repositories,
  query: TrainingSampleListQuery = {}
): { rows: TrainingSampleForSearch[]; total: number } {
  const filters = {
    merchantId: query.merchantId,
    countryId: query.countryId,
    language: query.language,
    intent: query.intent,
    stage: query.stage,
    enabled: parseOptionalBoolean(query.enabled)
  };
  return {
    rows: repos.listTrainingSamples({ ...filters, limit: parseLimit(query.limit), offset: parseOffset(query.offset) }),
    total: repos.countTrainingSamples(filters)
  };
}

export function patchTrainingSample(
  repos: Repositories,
  idParam: string,
  body: Record<string, unknown>,
  merchantId?: string
): TrainingContentResult<Record<string, unknown>> {
  const id = parseId(idParam);
  if (id === undefined) return invalidId();
  const row = repos.patchTrainingSample(id, body, merchantId);
  if (!row) return { ok: false, statusCode: 404, error: "sample not found" };
  return { ok: true, value: row };
}

export function deleteTrainingSample(
  repos: Repositories,
  idParam: string,
  merchantId?: string
): TrainingContentResult<{ ok: true }> {
  const id = parseId(idParam);
  if (id === undefined) return invalidId();
  const ok = repos.deleteTrainingSample(id, merchantId);
  if (!ok) return { ok: false, statusCode: 404, error: "sample not found" };
  return { ok: true, value: { ok: true } };
}

function parseOptionalBoolean(value?: string): boolean | undefined {
  return value === undefined ? undefined : value === "true" || value === "1";
}

function parseLimit(value?: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseOffset(value?: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parseId(value: string): number | undefined {
  const id = Number(value);
  return Number.isInteger(id) ? id : undefined;
}

function invalidId(): TrainingContentResult<never> {
  return { ok: false, statusCode: 400, error: "invalid id" };
}
