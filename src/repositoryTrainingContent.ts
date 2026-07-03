import { insertTrainingSamples } from "./db.js";
import type { Db } from "./db.js";
import type { TrainingSampleForSearch } from "./domain/sampleRetrieval.js";
import type { ImportedTrainingSample } from "./import/trainingSamples.js";
import { normalizeKnowledgeType } from "./repositoryStatuses.js";
import {
  buildKnowledgeItemWhere,
  buildTrainingMaterialWhere,
  buildTrainingSampleWhere,
  clampTrainingLimit
} from "./repositoryTrainingFilters.js";
import { deleteTrainingMaterialRecord } from "./repositoryTrainingMaterialDeletion.js";
import { buildKnowledgeItemPatch, buildTrainingSamplePatch } from "./repositoryTrainingPatches.js";
import {
  mapKnowledgeItem,
  mapTrainingMaterial,
  mapTrainingMaterialItem,
} from "./repositoryTrainingMappers.js";
import type {
  KnowledgeItemRecord,
  TrainingMaterialItemRecord,
  TrainingMaterialRecord
} from "./repositoryTypes.js";

export interface TrainingContentCountryResolver {
  defaultCountryId(merchantId: string): string;
  validCountryId(merchantId: string, countryId: string): string;
}

export class TrainingContentRepository {
  constructor(
    private readonly db: Db,
    private readonly countries: TrainingContentCountryResolver
  ) {}

  insertTrainingSamples(samples: ImportedTrainingSample[], merchantId = "default", countryId = this.countries.defaultCountryId(merchantId)): number {
    return insertTrainingSamples(this.db, samples, merchantId, countryId);
  }

  deleteAllTrainingSamples(): { samplesDeleted: number; materialItemsDeleted: number } {
    this.db.sqlite.exec("BEGIN");
    try {
      const materialItems = this.db.sqlite.prepare("DELETE FROM training_material_items WHERE sample_id IS NOT NULL OR kind = 'sample'").run();
      const samples = this.db.sqlite.prepare("DELETE FROM training_samples").run();
      this.db.sqlite.exec("COMMIT");
      return {
        samplesDeleted: Number(samples.changes ?? 0),
        materialItemsDeleted: Number(materialItems.changes ?? 0)
      };
    } catch (error) {
      this.db.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  createTrainingSample(merchantId: string, sample: ImportedTrainingSample, countryId = this.countries.defaultCountryId(merchantId)): { id: number } {
    this.db.sqlite
      .prepare(`
        INSERT INTO training_samples
          (merchant_id, country_id, customer_message, standard_reply, stage, intent, language, keywords, priority, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        merchantId,
        countryId,
        sample.customerMessage,
        sample.standardReply,
        sample.stage,
        sample.intent,
        sample.language,
        sample.keywords,
        sample.priority,
        sample.enabled ? 1 : 0
      );
    const row = this.db.sqlite.prepare("SELECT last_insert_rowid() AS id").get() as { id: number };
    return { id: Number(row.id) };
  }

  listTrainingSamples(filters: { merchantId?: string; countryId?: string; language?: string; intent?: string; stage?: string; enabled?: boolean } = {}): TrainingSampleForSearch[] {
    const { where, params } = buildTrainingSampleWhere(filters);
    return this.db.sqlite
      .prepare(`
        SELECT id, country_id AS countryId, customer_message AS customerMessage, standard_reply AS standardReply,
               stage, intent, language, keywords, priority, enabled
        FROM training_samples
        ${where}
        ORDER BY priority DESC, id DESC
        LIMIT 500
      `)
      .all(...params) as unknown as TrainingSampleForSearch[];
  }

  patchTrainingSample(id: number, patch: Record<string, unknown>, merchantId?: string): Record<string, unknown> | undefined {
    const sqlPatch = buildTrainingSamplePatch(patch);
    if (sqlPatch) {
      const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
      this.db.sqlite.prepare(`UPDATE training_samples SET ${sqlPatch.assignments}, updated_at = CURRENT_TIMESTAMP ${where}`).run(...sqlPatch.values, id, ...(merchantId ? [merchantId] : []));
    }
    const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
    return this.db.sqlite.prepare(`SELECT * FROM training_samples ${where}`).get(id, ...(merchantId ? [merchantId] : [])) as Record<string, unknown> | undefined;
  }

  deleteTrainingSample(id: number, merchantId?: string): boolean {
    const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
    const row = this.db.sqlite.prepare(`SELECT id FROM training_samples ${where}`).get(id, ...(merchantId ? [merchantId] : [])) as { id: number } | undefined;
    if (!row) return false;
    this.db.sqlite.prepare("DELETE FROM training_material_items WHERE sample_id = ?").run(id);
    const result = this.db.sqlite.prepare(`DELETE FROM training_samples ${where}`).run(id, ...(merchantId ? [merchantId] : []));
    return result.changes > 0;
  }

  listKnowledgeItems(filters: { merchantId?: string; countryId?: string; type?: string; enabled?: boolean } = {}): KnowledgeItemRecord[] {
    const { where, params } = buildKnowledgeItemWhere(filters);
    return this.db.sqlite
      .prepare(`
        SELECT id, merchant_id, country_id, type, title, content, language, priority, enabled
        FROM knowledge_items
        ${where}
        ORDER BY priority DESC, id DESC
        LIMIT 500
      `)
      .all(...params)
      .map((row) => mapKnowledgeItem(row as Record<string, unknown>));
  }

  createKnowledgeItem(merchantId: string, input: Record<string, unknown>): KnowledgeItemRecord {
    const title = String(input.title || "").trim();
    const content = String(input.content || "").trim();
    if (!title || !content) throw new Error("title and content are required");
    const countryId = this.countries.validCountryId(merchantId, String(input.countryId || "")) || this.countries.defaultCountryId(merchantId);
    this.db.sqlite
      .prepare(`
        INSERT INTO knowledge_items (merchant_id, country_id, type, title, content, language, priority, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        merchantId,
        countryId,
        normalizeKnowledgeType(input.type),
        title,
        content,
        String(input.language || "zh"),
        Number(input.priority || 0),
        input.enabled === false ? 0 : 1
      );
    const row = this.db.sqlite.prepare("SELECT * FROM knowledge_items WHERE id = last_insert_rowid()").get() as Record<string, unknown>;
    return mapKnowledgeItem(row);
  }

  patchKnowledgeItem(id: number, patch: Record<string, unknown>, merchantId?: string): KnowledgeItemRecord | undefined {
    const sqlPatch = buildKnowledgeItemPatch(patch);
    if (sqlPatch) {
      const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
      this.db.sqlite.prepare(`UPDATE knowledge_items SET ${sqlPatch.assignments}, updated_at = CURRENT_TIMESTAMP ${where}`).run(...sqlPatch.values, id, ...(merchantId ? [merchantId] : []));
    }
    const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
    const row = this.db.sqlite.prepare(`SELECT * FROM knowledge_items ${where}`).get(id, ...(merchantId ? [merchantId] : [])) as Record<string, unknown> | undefined;
    return row ? mapKnowledgeItem(row) : undefined;
  }

  deleteKnowledgeItem(id: number, merchantId?: string): boolean {
    const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
    const row = this.db.sqlite.prepare(`SELECT id FROM knowledge_items ${where}`).get(id, ...(merchantId ? [merchantId] : [])) as { id: number } | undefined;
    if (!row) return false;
    this.db.sqlite.prepare("DELETE FROM training_material_items WHERE knowledge_id = ?").run(id);
    const result = this.db.sqlite.prepare(`DELETE FROM knowledge_items ${where}`).run(id, ...(merchantId ? [merchantId] : []));
    return result.changes > 0;
  }

  createTrainingMaterial(input: {
    merchantId: string;
    countryId?: string;
    sourceType: string;
    filename: string;
    mimeType: string;
    rawText: string;
    warnings: string[];
  }): TrainingMaterialRecord {
    const countryId = this.countries.validCountryId(input.merchantId, input.countryId || "") || this.countries.defaultCountryId(input.merchantId);
    this.db.sqlite
      .prepare(`
        INSERT INTO training_materials
          (merchant_id, country_id, source_type, filename, mime_type, raw_text, warnings_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(input.merchantId, countryId, input.sourceType, input.filename, input.mimeType, input.rawText, JSON.stringify(input.warnings));
    const row = this.db.sqlite.prepare("SELECT * FROM training_materials WHERE id = last_insert_rowid()").get() as Record<string, unknown>;
    return mapTrainingMaterial(row);
  }

  addTrainingMaterialItem(input: {
    materialId: number;
    merchantId: string;
    countryId?: string;
    kind: "sample" | "knowledge";
    sampleId?: number;
    knowledgeId?: number;
    title: string;
    content: string;
    intent?: string;
    stage?: string;
    language?: string;
    enabled?: boolean;
  }): TrainingMaterialItemRecord {
    const countryId = this.countries.validCountryId(input.merchantId, input.countryId || "") || this.countries.defaultCountryId(input.merchantId);
    this.db.sqlite
      .prepare(`
        INSERT INTO training_material_items
          (material_id, merchant_id, country_id, kind, sample_id, knowledge_id, title, content, intent, stage, language, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        input.materialId,
        input.merchantId,
        countryId,
        input.kind,
        input.sampleId ?? null,
        input.knowledgeId ?? null,
        input.title,
        input.content,
        input.intent ?? "unknown",
        input.stage ?? "",
        input.language ?? "zh",
        input.enabled === false ? 0 : 1
      );
    const row = this.db.sqlite.prepare("SELECT * FROM training_material_items WHERE id = last_insert_rowid()").get() as Record<string, unknown>;
    return mapTrainingMaterialItem(row);
  }

  finalizeTrainingMaterial(id: number, merchantId: string, counts: { itemCount: number; sampleCount: number; knowledgeCount: number; warnings?: string[] }): TrainingMaterialRecord {
    this.db.sqlite
      .prepare(`
        UPDATE training_materials
        SET item_count = ?, sample_count = ?, knowledge_count = ?, warnings_json = COALESCE(?, warnings_json), updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND merchant_id = ?
      `)
      .run(
        counts.itemCount,
        counts.sampleCount,
        counts.knowledgeCount,
        counts.warnings ? JSON.stringify(counts.warnings) : null,
        id,
        merchantId
      );
    return this.getTrainingMaterial(id, merchantId)!;
  }

  deleteTrainingMaterial(id: number, merchantId?: string): boolean {
    return deleteTrainingMaterialRecord(this.db, id, merchantId);
  }

  listTrainingMaterials(filters: { merchantId?: string; countryId?: string; sourceType?: string; status?: string; limit?: number } = {}): TrainingMaterialRecord[] {
    const { where, params } = buildTrainingMaterialWhere(filters);
    const limit = clampTrainingLimit(filters.limit, 100, 500);
    params.push(limit);
    return this.db.sqlite
      .prepare(`
        SELECT tm.*, co.code AS country_code, co.name AS country_name
        FROM training_materials tm
        LEFT JOIN merchant_countries co ON co.id = tm.country_id
        ${where}
        ORDER BY tm.id DESC
        LIMIT ?
      `)
      .all(...params)
      .map((row) => mapTrainingMaterial(row as Record<string, unknown>));
  }

  getTrainingMaterial(id: number, merchantId?: string): TrainingMaterialRecord | undefined {
    const where = merchantId ? "WHERE tm.id = ? AND tm.merchant_id = ?" : "WHERE tm.id = ?";
    const row = this.db.sqlite.prepare(`
      SELECT tm.*, co.code AS country_code, co.name AS country_name
      FROM training_materials tm
      LEFT JOIN merchant_countries co ON co.id = tm.country_id
      ${where}
    `).get(id, ...(merchantId ? [merchantId] : [])) as Record<string, unknown> | undefined;
    return row ? mapTrainingMaterial(row) : undefined;
  }

  listTrainingMaterialItems(materialId: number, merchantId?: string): TrainingMaterialItemRecord[] {
    const where = merchantId ? "WHERE material_id = ? AND merchant_id = ?" : "WHERE material_id = ?";
    return this.db.sqlite
      .prepare(`
        SELECT *
        FROM training_material_items
        ${where}
        ORDER BY id ASC
      `)
      .all(materialId, ...(merchantId ? [merchantId] : []))
      .map((row) => mapTrainingMaterialItem(row as Record<string, unknown>));
  }

  listTrainingMaterialSnippets(merchantId: string, limit = 12, countryId?: string): TrainingMaterialItemRecord[] {
    const countryClause = countryId ? "AND country_id = ?" : "";
    const params: Array<string | number> = countryId ? [merchantId, countryId, limit] : [merchantId, limit];
    return this.db.sqlite
      .prepare(`
        SELECT *
        FROM training_material_items
        WHERE merchant_id = ? AND enabled = 1 ${countryClause}
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(...params)
      .map((row) => mapTrainingMaterialItem(row as Record<string, unknown>));
  }
}
