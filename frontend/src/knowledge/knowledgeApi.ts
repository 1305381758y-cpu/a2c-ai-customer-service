import { api, loadRows, withQuery } from "../app/api.js";
import type { Filters, Knowledge } from "../types.js";
import { coercePatch } from "../ui/form.js";

export type KnowledgeDraft = Record<string, string>;
export type KnowledgePatch = Partial<Knowledge> & Record<string, unknown>;

export function knowledgeBase(platform: boolean): "/api/admin/knowledge" | "/api/merchant/knowledge" {
  return platform ? "/api/admin/knowledge" : "/api/merchant/knowledge";
}

export function buildKnowledgeUrl(platform: boolean, filters: Filters): string {
  return withQuery(
    knowledgeBase(platform),
    platform ? filters : { countryId: filters.countryId, type: filters.type, enabled: filters.enabled }
  );
}

export async function loadKnowledgeItems(url: string): Promise<Knowledge[]> {
  return await loadRows<Knowledge>(url);
}

export async function createKnowledgeItem(base: string, draft: KnowledgeDraft, countryId: string): Promise<void> {
  await api(base, {
    method: "POST",
    body: JSON.stringify(coercePatch({ ...draft, countryId }))
  });
}

export async function updateKnowledgeItem(base: string, knowledgeId: number, patch: KnowledgePatch): Promise<void> {
  await api(`${base}/${knowledgeId}`, { method: "PATCH", body: JSON.stringify(coercePatch(patch)) });
}

export async function deleteKnowledgeItem(base: string, knowledgeId: number): Promise<void> {
  await api(`${base}/${knowledgeId}`, { method: "DELETE" });
}
