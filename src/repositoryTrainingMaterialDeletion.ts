import type { Db } from "./db.js";

export function deleteTrainingMaterialRecord(db: Db, id: number, merchantId?: string): boolean {
  const where = merchantId ? "WHERE id = ? AND merchant_id = ?" : "WHERE id = ?";
  const material = db.sqlite.prepare(`SELECT id FROM training_materials ${where}`).get(id, ...(merchantId ? [merchantId] : [])) as { id: number } | undefined;
  if (!material) return false;

  const sampleIds = listTrainingMaterialLinkedIds(db, id, "sample_id");
  const knowledgeIds = listTrainingMaterialLinkedIds(db, id, "knowledge_id");
  db.sqlite.prepare("DELETE FROM training_material_items WHERE material_id = ?").run(id);
  deleteLinkedRecords(db, "training_samples", sampleIds);
  deleteLinkedRecords(db, "knowledge_items", knowledgeIds);
  db.sqlite.prepare(`DELETE FROM training_materials ${where}`).run(id, ...(merchantId ? [merchantId] : []));
  return true;
}

function listTrainingMaterialLinkedIds(db: Db, materialId: number, column: "sample_id" | "knowledge_id"): number[] {
  return db.sqlite
    .prepare(`SELECT ${column} AS id FROM training_material_items WHERE material_id = ? AND ${column} IS NOT NULL`)
    .all(materialId)
    .map((row) => Number((row as { id: number }).id));
}

function deleteLinkedRecords(db: Db, table: "training_samples" | "knowledge_items", ids: number[]): void {
  if (!ids.length) return;
  db.sqlite.prepare(`DELETE FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`).run(...ids);
}
