import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

describe("auth api", () => {
  it("logs in with bootstrap admin and protects merchant endpoints", async () => {
    const app = buildApp(loadConfig({
      DATABASE_URL: ":memory:",
      INTERNAL_API_KEY: "test-key",
      SESSION_SECRET: "test-secret",
      DEFAULT_ADMIN_EMAIL: "admin@test.local",
      DEFAULT_ADMIN_PASSWORD: "Admin123456"
    }));

    const unauthorized = await app.inject({ method: "GET", url: "/api/merchant/dashboard" });
    expect(unauthorized.statusCode).toBe(401);

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "admin@test.local", password: "Admin123456" }
    });
    expect(login.statusCode).toBe(200);
    expect(login.headers["set-cookie"]).toBeTruthy();

    const dashboard = await app.inject({
      method: "GET",
      url: "/api/merchant/dashboard",
      headers: { cookie: String(login.headers["set-cookie"]) }
    });
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.json()).toHaveProperty("conversations");

    await app.close();
  });
});
