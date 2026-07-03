import { describe, expect, it, vi } from "vitest";

import {
  adminUsersUrl,
  createAdminUser,
  deleteAdminUser,
  loadAdminUsers,
  updateAdminUser
} from "../frontend/src/admin/adminUsersApi.js";

const user = {
  id: "user-1",
  email: "merchant@example.com",
  name: "商户管理员",
  role: "merchant_admin",
  merchantId: "merchant-1"
};

describe("admin users API helpers", () => {
  it("builds filtered admin user URLs", () => {
    expect(adminUsersUrl()).toBe("/api/admin/users");
    expect(adminUsersUrl({ merchantId: "merchant-1" })).toBe("/api/admin/users?merchantId=merchant-1");
    expect(adminUsersUrl({ merchantId: "" })).toBe("/api/admin/users");
  });

  it("loads admin users", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      rows: [user]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(loadAdminUsers({ merchantId: "merchant-1" })).resolves.toEqual([user]);

    expect(fetcher).toHaveBeenCalledWith("/api/admin/users?merchantId=merchant-1", { headers: {} });
    fetcher.mockRestore();
  });

  it("creates admin users", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(user), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(createAdminUser({
      email: "merchant@example.com",
      name: "商户管理员",
      password: "Merchant123456",
      role: "merchant_admin",
      merchantId: "merchant-1"
    })).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenCalledWith("/api/admin/users", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        email: "merchant@example.com",
        name: "商户管理员",
        password: "Merchant123456",
        role: "merchant_admin",
        merchantId: "merchant-1"
      }),
      headers: { "Content-Type": "application/json" }
    }));
    fetcher.mockRestore();
  });

  it("updates admin users without sending an empty password", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      ...user,
      name: "新名称"
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(updateAdminUser("user-1", {
      name: "新名称",
      password: ""
    })).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenCalledWith("/api/admin/users/user-1", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ name: "新名称" }),
      headers: { "Content-Type": "application/json" }
    }));
    fetcher.mockRestore();
  });

  it("deletes admin users", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(deleteAdminUser("user-1")).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenCalledWith("/api/admin/users/user-1", expect.objectContaining({ method: "DELETE" }));
    fetcher.mockRestore();
  });
});
