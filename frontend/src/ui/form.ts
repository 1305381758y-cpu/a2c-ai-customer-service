export function coercePatch(input: Record<string, any>) {
  const patch = { ...input };
  if ("priority" in patch) patch.priority = Number(patch.priority || 0);
  if (patch.enabled === "true") patch.enabled = true;
  if (patch.enabled === "false") patch.enabled = false;
  for (const key of ["requirePlatformAccount", "requirePhone", "requireTelegram", "requireWhatsApp"]) {
    if (patch[key] === "true") patch[key] = true;
    if (patch[key] === "false") patch[key] = false;
  }
  return patch;
}
