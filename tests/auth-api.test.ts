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
    expect(dashboard.json()).toHaveProperty("todayConversations");

    await app.close();
  });

  it("keeps training writes admin-only while merchant operators can read", async () => {
    const app = buildApp(loadConfig({
      DATABASE_URL: ":memory:",
      INTERNAL_API_KEY: "test-key",
      SESSION_SECRET: "test-secret",
      DEFAULT_ADMIN_EMAIL: "admin@test.local",
      DEFAULT_ADMIN_PASSWORD: "Admin123456"
    }));
    const adminLogin = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "admin@test.local", password: "Admin123456" } });
    const adminCookie = String(adminLogin.headers["set-cookie"]);
    const merchant = await app.inject({ method: "POST", url: "/api/admin/merchants", headers: { cookie: adminCookie }, payload: { name: "运营权限测试" } });
    await app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers: { cookie: adminCookie },
      payload: { merchantId: merchant.json().id, email: "operator@test.local", name: "商户运营", password: "Operator123456", role: "merchant_operator" }
    });
    const operatorLogin = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "operator@test.local", password: "Operator123456" } });
    const operatorCookie = String(operatorLogin.headers["set-cookie"]);

    const readable = await app.inject({ method: "GET", url: "/api/merchant/training-samples", headers: { cookie: operatorCookie } });
    expect(readable.statusCode).toBe(200);
    expect(readable.json()).toMatchObject({ rows: [], total: 0 });
    for (const request of [
      { method: "POST" as const, url: "/api/merchant/training-samples/import" },
      { method: "POST" as const, url: "/api/merchant/training-materials/import" },
      { method: "PATCH" as const, url: "/api/merchant/training-samples/1", payload: { enabled: false } },
      { method: "POST" as const, url: "/api/merchant/conversations/missing/review" },
      { method: "POST" as const, url: "/api/merchant/conversations/missing/review/apply", payload: { itemId: 1 } }
    ]) {
      const response = await app.inject({ ...request, headers: { cookie: operatorCookie } });
      expect(response.statusCode).toBe(403);
    }
    const deniedAudit = await app.inject({ method: "GET", url: "/api/merchant/operation-logs", headers: { cookie: operatorCookie } });
    expect(deniedAudit.statusCode).toBe(403);
    const audit = await app.inject({ method: "GET", url: `/api/admin/operation-logs?merchantId=${merchant.json().id}&status=error`, headers: { cookie: adminCookie } });
    expect(audit.statusCode).toBe(200);
    expect(audit.json().total).toBe(5);
    expect(audit.json().rows[0]).toMatchObject({ actorName: "商户运营", status: "error", httpStatus: 403 });
    const futureAudit = await app.inject({ method: "GET", url: `/api/admin/operation-logs?merchantId=${merchant.json().id}&startAt=2099-01-01T00%3A00%3A00&timeZone=Asia%2FShanghai`, headers: { cookie: adminCookie } });
    expect(futureAudit.json().total).toBe(0);
    await app.close();
  });

  it("records masked config version metadata and restores a prior snapshot", async () => {
    const app = buildApp(loadConfig({
      DATABASE_URL: ":memory:",
      INTERNAL_API_KEY: "test-key",
      SESSION_SECRET: "test-secret",
      DEFAULT_ADMIN_EMAIL: "admin@test.local",
      DEFAULT_ADMIN_PASSWORD: "Admin123456"
    }));
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "admin@test.local", password: "Admin123456" } });
    const cookie = String(login.headers["set-cookie"]);
    const merchant = await app.inject({ method: "POST", url: "/api/admin/merchants", headers: { cookie }, payload: { name: "配置版本测试" } });
    const merchantId = merchant.json().id as string;

    await app.inject({ method: "PATCH", url: `/api/admin/merchants/${merchantId}/config`, headers: { cookie }, payload: { platformRegisterUrl: "https://first.test/register", a2cAppSecret: "secret-first" } });
    await app.inject({ method: "PATCH", url: `/api/admin/merchants/${merchantId}/config`, headers: { cookie }, payload: { platformRegisterUrl: "https://second.test/register" } });
    const versions = await app.inject({ method: "GET", url: `/api/admin/merchants/${merchantId}/config/versions`, headers: { cookie } });
    expect(versions.statusCode).toBe(200);
    expect(versions.json().rows).toHaveLength(2);
    expect(versions.json().rows[0]).toMatchObject({ version: 2, changedKeys: ["platformRegisterUrl"], createdBy: "平台管理员" });
    expect(JSON.stringify(versions.json())).not.toContain("secret-first");
    expect(versions.json().rows[0]).not.toHaveProperty("snapshot");

    const firstVersionId = versions.json().rows[1].id as number;
    const restored = await app.inject({ method: "POST", url: `/api/admin/merchants/${merchantId}/config/versions/${firstVersionId}/restore`, headers: { cookie } });
    expect(restored.statusCode).toBe(200);
    expect(restored.json().platformRegisterUrl).toBe("https://first.test/register");
    const afterRestore = await app.inject({ method: "GET", url: `/api/admin/merchants/${merchantId}/config/versions`, headers: { cookie } });
    expect(afterRestore.json().rows[0]).toMatchObject({ version: 3, note: "恢复版本 1" });
    await app.close();
  });

  it("records and restores merchant agent profile versions", async () => {
    const app = buildApp(loadConfig({
      DATABASE_URL: ":memory:",
      INTERNAL_API_KEY: "test-key",
      SESSION_SECRET: "test-secret",
      DEFAULT_ADMIN_EMAIL: "admin@test.local",
      DEFAULT_ADMIN_PASSWORD: "Admin123456"
    }));
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "admin@test.local", password: "Admin123456" } });
    const cookie = String(login.headers["set-cookie"]);
    const merchant = await app.inject({ method: "POST", url: "/api/admin/merchants", headers: { cookie }, payload: { name: "智能体版本测试" } });
    const merchantId = merchant.json().id as string;
    const base = `/api/admin/merchants/${merchantId}/agent-profile`;

    await app.inject({ method: "PATCH", url: base, headers: { cookie }, payload: { agentName: "第一版专员", toneStyle: "简短耐心" } });
    await app.inject({ method: "PATCH", url: base, headers: { cookie }, payload: { agentName: "第二版专员" } });
    const versions = await app.inject({ method: "GET", url: `${base}/versions`, headers: { cookie } });
    expect(versions.statusCode).toBe(200);
    expect(versions.json().rows).toHaveLength(2);
    expect(versions.json().rows[0]).toMatchObject({ version: 2, changedKeys: ["agentName"], createdBy: "平台管理员" });
    expect(versions.json().rows[0]).not.toHaveProperty("snapshot");

    const restored = await app.inject({ method: "POST", url: `${base}/versions/${versions.json().rows[1].id}/restore`, headers: { cookie } });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({ agentName: "第一版专员", toneStyle: "简短耐心" });
    const afterRestore = await app.inject({ method: "GET", url: `${base}/versions`, headers: { cookie } });
    expect(afterRestore.json().rows[0]).toMatchObject({ version: 3, note: "恢复版本 1" });
    await app.close();
  });

  it("keeps merchant data isolated and ignores masked secret patches", async () => {
    const app = buildApp(loadConfig({
      DATABASE_URL: ":memory:",
      INTERNAL_API_KEY: "test-key",
      SESSION_SECRET: "test-secret",
      DEFAULT_ADMIN_EMAIL: "admin@test.local",
      DEFAULT_ADMIN_PASSWORD: "Admin123456"
    }));

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "admin@test.local", password: "Admin123456" }
    });
    const cookie = String(login.headers["set-cookie"]);

    const merchant = await app.inject({
      method: "POST",
      url: "/api/admin/merchants",
      headers: { cookie },
      payload: { name: "商户A" }
    });
    const merchantId = merchant.json().id as string;

    await app.inject({
      method: "PATCH",
      url: `/api/admin/merchants/${merchantId}/config`,
      headers: { cookie },
      payload: { a2cAppSecret: "real-secret-value", googleAiApiKey: "gemini-real-value" }
    });
    const masked = await app.inject({
      method: "GET",
      url: `/api/admin/merchants/${merchantId}/config`,
      headers: { cookie }
    });
    expect(masked.json().a2cAppSecret).toContain("••••");

    await app.inject({
      method: "PATCH",
      url: `/api/admin/merchants/${merchantId}/config`,
      headers: { cookie },
      payload: { a2cAppSecret: masked.json().a2cAppSecret, platformRegisterUrl: "https://example.com/register" }
    });
    const maskedAgain = await app.inject({
      method: "GET",
      url: `/api/admin/merchants/${merchantId}/config`,
      headers: { cookie }
    });
    expect(maskedAgain.json().a2cAppSecret).toBe(masked.json().a2cAppSecret);

    await app.close();
  });

  it("creates a merchant with country settings and merchant login account", async () => {
    const app = buildApp(loadConfig({
      DATABASE_URL: ":memory:",
      INTERNAL_API_KEY: "test-key",
      SESSION_SECRET: "test-secret",
      DEFAULT_ADMIN_EMAIL: "admin@test.local",
      DEFAULT_ADMIN_PASSWORD: "Admin123456"
    }));

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "admin@test.local", password: "Admin123456" }
    });
    const cookie = String(login.headers["set-cookie"]);

    const created = await app.inject({
      method: "POST",
      url: "/api/admin/merchants",
      headers: { cookie },
      payload: {
        name: "阿斯顿",
        country: {
          code: "br",
          name: "巴西",
          defaultLanguage: "pt-BR",
          platformRegisterUrl: "https://example.com/register",
          tgRegisterGuideUrl: "https://telegram.org",
          requirePlatformAccount: true,
          requirePhone: true,
          requireTelegram: true,
          requireWhatsApp: false
        },
        adminUser: {
          email: "aston-admin@test.local",
          name: "阿斯顿管理员",
          password: "Merchant123456"
        }
      }
    });

    expect(created.statusCode).toBe(200);
    expect(created.json().merchant).toMatchObject({ name: "阿斯顿", status: "active" });
    expect(created.json().country).toMatchObject({ code: "br", name: "巴西", defaultLanguage: "pt-BR", requireWhatsApp: false });
    expect(created.json().adminUser).toMatchObject({ email: "aston-admin@test.local", role: "merchant_admin" });
    expect(created.json().adminUser).not.toHaveProperty("passwordHash");

    const merchantLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "aston-admin@test.local", password: "Merchant123456" }
    });
    expect(merchantLogin.statusCode).toBe(200);

    const countries = await app.inject({
      method: "GET",
      url: "/api/merchant/countries",
      headers: { cookie: String(merchantLogin.headers["set-cookie"]) }
    });
    expect(countries.statusCode).toBe(200);
    expect(countries.json().rows[0]).toMatchObject({
      code: "br",
      name: "巴西",
      defaultLanguage: "pt-BR",
      platformRegisterUrl: "https://example.com/register",
      requireTelegram: true,
      requireWhatsApp: false
    });

    await app.close();
  });

  it("deletes merchant users and non-default merchants with their owned data", async () => {
    const app = buildApp(loadConfig({
      DATABASE_URL: ":memory:",
      INTERNAL_API_KEY: "test-key",
      SESSION_SECRET: "test-secret",
      DEFAULT_ADMIN_EMAIL: "admin@test.local",
      DEFAULT_ADMIN_PASSWORD: "Admin123456"
    }));

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "admin@test.local", password: "Admin123456" }
    });
    const cookie = String(login.headers["set-cookie"]);

    const created = await app.inject({
      method: "POST",
      url: "/api/admin/merchants",
      headers: { cookie },
      payload: {
        name: "可删除商户",
        country: { code: "br", name: "巴西", defaultLanguage: "pt-BR" },
        adminUser: { email: "delete-me@test.local", name: "待删除", password: "Merchant123456" }
      }
    });
    const merchantId = created.json().merchant.id as string;
    const userId = created.json().adminUser.id as string;

    const deleteUser = await app.inject({
      method: "DELETE",
      url: `/api/admin/users/${userId}`,
      headers: { cookie }
    });
    expect(deleteUser.statusCode).toBe(200);

    const deletedLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "delete-me@test.local", password: "Merchant123456" }
    });
    expect(deletedLogin.statusCode).toBe(401);

    await app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers: { cookie },
      payload: { merchantId, email: "delete-merchant-user@test.local", name: "商户用户", password: "Merchant123456", role: "merchant_admin" }
    });

    const deleteDefault = await app.inject({
      method: "DELETE",
      url: "/api/admin/merchants/default",
      headers: { cookie }
    });
    expect(deleteDefault.statusCode).toBe(400);

    const deleteMerchant = await app.inject({
      method: "DELETE",
      url: `/api/admin/merchants/${merchantId}`,
      headers: { cookie }
    });
    expect(deleteMerchant.statusCode).toBe(200);

    const merchants = await app.inject({ method: "GET", url: "/api/admin/merchants", headers: { cookie } });
    expect(merchants.json().rows.some((row: { id: string }) => row.id === merchantId)).toBe(false);

    const users = await app.inject({ method: "GET", url: `/api/admin/users?merchantId=${merchantId}`, headers: { cookie } });
    expect(users.json().rows).toHaveLength(0);

    await app.close();
  });

  it("clears merchant ownership when a user is promoted to platform admin", async () => {
    const app = buildApp(loadConfig({
      DATABASE_URL: ":memory:",
      INTERNAL_API_KEY: "test-key",
      SESSION_SECRET: "test-secret",
      DEFAULT_ADMIN_EMAIL: "admin@test.local",
      DEFAULT_ADMIN_PASSWORD: "Admin123456"
    }));

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "admin@test.local", password: "Admin123456" }
    });
    const cookie = String(login.headers["set-cookie"]);

    const merchant = await app.inject({
      method: "POST",
      url: "/api/admin/merchants",
      headers: { cookie },
      payload: { name: "角色测试商户" }
    });
    const user = await app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers: { cookie },
      payload: {
        merchantId: merchant.json().id,
        email: "promote@test.local",
        name: "待升级用户",
        password: "Merchant123456",
        role: "merchant_operator"
      }
    });

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/admin/users/${user.json().id}`,
      headers: { cookie },
      payload: { role: "platform_admin" }
    });

    expect(patched.statusCode).toBe(200);
    expect(patched.json().role).toBe("platform_admin");
    expect(patched.json().merchantId).toBeNull();

    await app.close();
  });

  it("resets or creates a platform admin through the internal maintenance endpoint", async () => {
    const app = buildApp(loadConfig({
      DATABASE_URL: ":memory:",
      INTERNAL_API_KEY: "test-key",
      SESSION_SECRET: "test-secret",
      DEFAULT_ADMIN_EMAIL: "admin@test.local",
      DEFAULT_ADMIN_PASSWORD: "OldAdmin123"
    }));

    const reset = await app.inject({
      method: "POST",
      url: "/internal/admin/reset-password",
      headers: { "x-api-key": "test-key" },
      payload: { email: "admin@test.local", password: "NewAdmin123", name: "重置管理员" }
    });
    expect(reset.statusCode).toBe(200);
    expect(reset.json()).toMatchObject({ email: "admin@test.local", role: "platform_admin", merchantId: null, status: "active" });
    expect(reset.json()).not.toHaveProperty("passwordHash");

    const oldLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "admin@test.local", password: "OldAdmin123" }
    });
    expect(oldLogin.statusCode).toBe(401);

    const newLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "admin@test.local", password: "NewAdmin123" }
    });
    expect(newLogin.statusCode).toBe(200);

    await app.close();
  });
});
