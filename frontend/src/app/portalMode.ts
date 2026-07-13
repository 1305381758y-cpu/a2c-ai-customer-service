export type PortalMode = "admin" | "merchant" | "shared";

export function portalModeForPath(pathname: string): PortalMode {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/admin" || path.startsWith("/admin/")) return "admin";
  if (path === "/merchant" || path.startsWith("/merchant/")) return "merchant";
  return "shared";
}

export function portalModeLabel(mode: PortalMode): string {
  return mode === "admin" ? "平台管理端" : mode === "merchant" ? "商户工作台" : "智能客服工作台";
}

export function canAccessPortal(mode: PortalMode, role: string): boolean {
  if (mode === "admin") return role === "platform_admin";
  if (mode === "merchant") return role === "merchant_admin" || role === "merchant_operator";
  return true;
}
