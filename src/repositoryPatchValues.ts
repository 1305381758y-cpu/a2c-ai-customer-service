export function booleanPatchValue(value: unknown, fallback: boolean): number {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (normalized === "true" || normalized === "1") return 1;
    if (normalized === "false" || normalized === "0") return 0;
  }
  return fallback ? 1 : 0;
}
