import { describe, expect, it, vi } from "vitest";

import { loadCurrentUser, login, logout } from "../frontend/src/auth/authApi.js";

const user = {
  id: "user-1",
  merchantId: "merchant-1",
  email: "admin@example.com",
  name: "管理员",
  role: "platform_admin",
  active: true,
  createdAt: "2026-07-03T10:00:00Z",
  updatedAt: "2026-07-03T10:00:00Z"
};

describe("auth API helpers", () => {
  it("loads the current user", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ user }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(loadCurrentUser()).resolves.toEqual(user);

    expect(fetcher).toHaveBeenCalledWith("/api/auth/me", { headers: {} });
    fetcher.mockRestore();
  });

  it("logs in with email and password", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ user }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(login({ email: "admin@example.com", password: "Admin123456" })).resolves.toEqual(user);

    expect(fetcher).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ email: "admin@example.com", password: "Admin123456" }),
      headers: { "Content-Type": "application/json" }
    }));
    fetcher.mockRestore();
  });

  it("logs out through the auth route", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(logout()).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({
      method: "POST",
      headers: {}
    }));
    fetcher.mockRestore();
  });
});
