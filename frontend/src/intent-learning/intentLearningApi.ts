import { api, loadRows, withQuery } from "../app/api.js";
import type { Filters, IntentLearningEvent } from "../types.js";

export type IntentLearningPatch = Partial<Pick<IntentLearningEvent, "status" | "displayName" | "description">> & Record<string, unknown>;

export function intentLearningBase(platform: boolean): "/api/admin/intent-learning" | "/api/merchant/intent-learning" {
  return platform ? "/api/admin/intent-learning" : "/api/merchant/intent-learning";
}

export function intentLearningRowsUrl(platform: boolean, filters: Filters): string {
  return withQuery(
    intentLearningBase(platform),
    platform ? filters : {
      countryId: filters.countryId,
      status: filters.status,
      suggestedIntent: filters.suggestedIntent,
      limit: filters.limit
    }
  );
}

export async function loadIntentLearningEvents(url: string): Promise<IntentLearningEvent[]> {
  return await loadRows<IntentLearningEvent>(url);
}

export async function patchIntentLearningEvent(base: string, eventId: number, patch: IntentLearningPatch): Promise<IntentLearningEvent> {
  return await api<IntentLearningEvent>(`${base}/${eventId}`, { method: "PATCH", body: JSON.stringify(patch) });
}
