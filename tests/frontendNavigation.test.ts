import { describe, expect, it } from "vitest";
import { navForUser, navTitle, resolveActiveView, roleName, shouldRedirectViewForRole } from "../frontend/src/app/navigation.js";
import type { User } from "../frontend/src/types.js";

const platformUser: User = {
  id: "platform-1",
  email: "admin@example.com",
  name: "平台管理员",
  role: "platform_admin",
  merchantId: ""
};

const merchantUser: User = {
  id: "merchant-1",
  email: "merchant@example.com",
  name: "商户管理员",
  role: "merchant_admin",
  merchantId: "merchant-1"
};

describe("portal navigation model", () => {
  it("keeps platform-only training subpages visible for platform admins", () => {
    const nav = navForUser(platformUser);

    expect(nav.map((item) => item.key)).toEqual(expect.arrayContaining(["materials", "knowledge", "samples", "conversations"]));
    expect(resolveActiveView(platformUser, "knowledge")).toBe("knowledge");
    expect(navTitle(nav, "knowledge")).toBe("知识库");
  });

  it("collapses legacy merchant training subpages into the training center", () => {
    const nav = navForUser(merchantUser);

    expect(nav.map((item) => item.key)).toEqual(expect.arrayContaining(["training", "simulator", "config"]));
    expect(nav.map((item) => item.key)).not.toContain("knowledge");
    expect(resolveActiveView(merchantUser, "samples")).toBe("training");
    expect(shouldRedirectViewForRole(merchantUser, "samples")).toBe(true);
  });

  it("normalizes unknown views and localizes roles", () => {
    expect(resolveActiveView(merchantUser, "missing")).toBe("dashboard");
    expect(roleName("merchant_operator")).toBe("商户运营");
    expect(roleName("custom_role")).toBe("custom_role");
  });
});
