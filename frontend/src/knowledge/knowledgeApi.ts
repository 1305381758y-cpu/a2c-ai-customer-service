import { api } from "../app/api.js";
import type { Knowledge } from "../types.js";
import { coercePatch } from "../ui/form.js";

export type KnowledgeDraft = Record<string, string>;
export type KnowledgePatch = Partial<Knowledge> & Record<string, unknown>;

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
