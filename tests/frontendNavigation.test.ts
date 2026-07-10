import { describe, expect, it } from "vitest";

import { navigationForRole, portalViewLabel, resolvePortalView, roleName } from "../frontend/src/app/navigation.js";

describe("portal navigation", () => {
  it("keeps platform-only pages out of merchant navigation", () => {
    const merchantViews = navigationForRole("merchant_admin").map((item) => item.key);
    expect(merchantViews).not.toContain("merchants");
    expect(merchantViews).not.toContain("users");
    expect(merchantViews).toContain("training");
  });

  it("maps legacy merchant training links to the training center", () => {
    expect(resolvePortalView("merchant_admin", "materials")).toBe("training");
    expect(resolvePortalView("merchant_operator", "knowledge")).toBe("training");
    expect(resolvePortalView("merchant_admin", "samples")).toBe("training");
  });

  it("falls back safely when a role requests an unavailable page", () => {
    expect(resolvePortalView("merchant_operator", "merchants")).toBe("dashboard");
    expect(resolvePortalView("platform_admin", "unknown-page")).toBe("dashboard");
  });

  it("provides Chinese role and page labels from one interface", () => {
    expect(roleName("platform_admin")).toBe("平台管理员");
    expect(roleName("merchant_operator")).toBe("商户运营");
    expect(portalViewLabel("merchant_admin", "config")).toBe("设置");
  });
});
