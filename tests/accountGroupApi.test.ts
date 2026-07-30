import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

function testConfig() {
  return loadConfig({
    DATABASE_URL: ":memory:",
    INTERNAL_API_KEY: "test-key",
    SESSION_SECRET: "test-secret",
    DEFAULT_ADMIN_EMAIL: "admin@test.local",
    DEFAULT_ADMIN_PASSWORD: "Admin123456",
    GOOGLE_AI_API_KEY: "",
    A2C_APP_ID: "",
    A2C_APP_SECRET: "",
    TEST_SNAPSHOT_DATABASE_URL: ":memory:",
    TEST_SIMULATION_DATABASE_URL: ":memory:"
  });
}

async function login(app: ReturnType<typeof buildApp>, email: string, password: string): Promise<string> {
  const response = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password } });
  expect(response.statusCode).toBe(200);
  return String(response.headers["set-cookie"]);
}

describe("客服分组配置接口", () => {
  it("商户可配置分组成员、可复用邀请码和多个导师绑定", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/open/auth/token")) return Response.json({ code: 200, data: { accessToken: "group-api-token", expireIn: 3600 } });
      if (url.endsWith("/v1/accounts")) return Response.json({ code: 200, data: [
        { apiPhone: "14303103499", verifiedName: "客服一" },
        { apiPhone: "14303103500", verifiedName: "客服二" }
      ] });
      return Response.json({ code: 200, data: "ok" });
    }) as typeof fetch;

    const app = buildApp(testConfig());
    try {
      const adminCookie = await login(app, "admin@test.local", "Admin123456");
      const merchantResponse = await app.inject({ method: "POST", url: "/api/admin/merchants", headers: { cookie: adminCookie }, payload: { name: "分组接口商户" } });
      const merchantId = merchantResponse.json().id as string;
      await app.inject({ method: "POST", url: "/api/admin/users", headers: { cookie: adminCookie }, payload: { merchantId, email: "groups@test.local", name: "分组管理员", password: "Merchant123456", role: "merchant_admin" } });
      const cookie = await login(app, "groups@test.local", "Merchant123456");
      await app.inject({ method: "PATCH", url: "/api/merchant/config", headers: { cookie }, payload: { a2cBaseUrl: "https://group-a2c.test", a2cAppId: "app", a2cAppSecret: "secret" } });
      expect((await app.inject({ method: "POST", url: "/api/merchant/a2c/accounts/sync", headers: { cookie } })).statusCode).toBe(200);

      const countries = (await app.inject({ method: "GET", url: "/api/merchant/countries", headers: { cookie } })).json().rows;
      const accounts = (await app.inject({ method: "GET", url: "/api/merchant/a2c/accounts", headers: { cookie } })).json().rows;
      const groupResponse = await app.inject({ method: "POST", url: "/api/merchant/a2c/account-groups", headers: { cookie }, payload: { name: "巴西客服组", countryId: countries[0].id } });
      expect(groupResponse.statusCode).toBe(200);
      const groupId = groupResponse.json().id as number;
      expect((await app.inject({ method: "PUT", url: `/api/merchant/a2c/account-groups/${groupId}/accounts`, headers: { cookie }, payload: { accountIds: accounts.map((row: { id: number }) => row.id) } })).statusCode).toBe(200);

      const teacherA = (await app.inject({ method: "POST", url: "/api/merchant/teacher-tg-links", headers: { cookie }, payload: { countryId: countries[0].id, label: "导师A", url: "https://t.me/a" } })).json();
      const teacherB = (await app.inject({ method: "POST", url: "/api/merchant/teacher-tg-links", headers: { cookie }, payload: { countryId: countries[0].id, label: "导师B", url: "https://t.me/b" } })).json();
      const imported = await app.inject({ method: "POST", url: `/api/merchant/a2c/account-groups/${groupId}/invite-codes/import`, headers: { cookie }, payload: { codes: "BR-ONE\nBR-TWO", registerUrl: "https://register.test/{code}", reusable: true } });
      expect(imported.statusCode).toBe(200);
      expect(imported.json().rows).toHaveLength(2);
      expect(imported.json().rows[0].reusable).toBe(true);
      const inviteId = imported.json().rows[0].id as number;

      const binding = await app.inject({ method: "PUT", url: `/api/merchant/a2c/invite-codes/group/${inviteId}/teacher-links`, headers: { cookie }, payload: { teacherTgLinkIds: [teacherA.id, teacherB.id] } });
      expect(binding.statusCode).toBe(200);
      expect(binding.json().rows.map((row: { teacherTgLinkId: number }) => row.teacherTgLinkId).sort()).toEqual([teacherA.id, teacherB.id].sort());

      const groupedAccounts = (await app.inject({ method: "GET", url: "/api/merchant/a2c/accounts", headers: { cookie } })).json().rows;
      expect(groupedAccounts.every((row: { groupId: number }) => row.groupId === groupId)).toBe(true);
      const adminView = await app.inject({ method: "GET", url: `/api/admin/merchants/${merchantId}/a2c/account-groups`, headers: { cookie: adminCookie } });
      expect(adminView.json().rows[0]).toMatchObject({ name: "巴西客服组", accountCount: 2, inviteCodeCount: 2 });
    } finally {
      globalThis.fetch = originalFetch;
      await app.close();
    }
  });
});
