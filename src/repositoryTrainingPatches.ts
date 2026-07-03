import { normalizeKnowledgeType } from "./repositoryStatuses.js";

export interface SqlPatch {
  assignments: string;
  values: Array<string | number | null>;
}

export function buildTrainingSamplePatch(patch: Record<string, unknown>): SqlPatch | undefined {
  return buildPatch(patch, {
    customerMessage: ["customer_message", passthrough],
    standardReply: ["standard_reply", passthrough],
    stage: ["stage", passthrough],
    intent: ["intent", passthrough],
    language: ["language", passthrough],
    keywords: ["keywords", passthrough],
    priority: ["priority", passthrough],
    enabled: ["enabled", booleanToInteger],
    countryId: ["country_id", passthrough]
  });
}

export function buildKnowledgeItemPatch(patch: Record<string, unknown>): SqlPatch | undefined {
  return buildPatch(patch, {
    type: ["type", normalizeKnowledgeType],
    title: ["title", stringify],
    content: ["content", stringify],
    language: ["language", stringify],
    priority: ["priority", toNumber],
    enabled: ["enabled", booleanToInteger],
    countryId: ["country_id", stringify]
  });
}

type PatchTransform = (value: unknown) => string | number | null;
type PatchSpec = Record<string, [column: string, transform: PatchTransform]>;

function buildPatch(patch: Record<string, unknown>, spec: PatchSpec): SqlPatch | undefined {
  const entries = Object.entries(patch).filter(([key]) => key in spec);
  if (!entries.length) return undefined;
  return {
    assignments: entries.map(([key]) => `${spec[key][0]} = ?`).join(", "),
    values: entries.map(([key, value]) => spec[key][1](value))
  };
}

function passthrough(value: unknown): string | number | null {
  return value as string | number | null;
}

function stringify(value: unknown): string {
  return String(value ?? "");
}

function toNumber(value: unknown): number {
  return Number(value || 0);
}

function booleanToInteger(value: unknown): number {
  return value ? 1 : 0;
}
