import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildMerchantCreatePayload,
  createMerchantFromForm,
  createMerchantUser,
  deleteMerchant,
  deleteMerchantUser,
  loadAdminMerchants,
  loadMerchantDetail,
  updateMerchant,
  updateMerchantCountry,
  updateMerchantUser
} from "../frontend/src/admin/adminMerchantsApi.js";
import type { MerchantCreateForm } from "../frontend/src/admin/MerchantCreatePanel.js";

const merchant = { id: "merchant-1", name: "阿斯顿", status: "active" };
const country = {
  id: "country-1",
  merchantId: "merchant-1",
  code: "br",
  name: "巴西",
  defaultLanguage: "pt-BR",
  platformRegisterUrl: "https://example.com",
  tgRegisterGuideUrl: "",
  requirePlatformAccount: true,
  requirePhone: true,
  requireTelegram: true,
  requireWhatsApp: false,
  status: "active"
};
const user = {
  id: "user-1",
  email: "merchant@example.com",
  name: "商户管理员",
  role: "merchant_admin",
  merchantId: "merchant-1"
};

const form: MerchantCreateForm = {
  name: " 阿斯顿 ",
  countryCode: " br ",
  countryName: " 巴西 ",
  defaultLanguage: "pt-BR",
  platformRegisterUrl: " https://example.com/register ",
  tgRegisterGuideUrl: " https://example.com/tg ",
  requirePlatformAccount: "true",
  requirePhone: "true",
  requireTelegram: "true",
  requireWhatsApp: "false",
  adminEmail: " merchant@example.com ",
  adminName: "",
  adminPassword: "Merchant123456"
};

describe("admin merchants API helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds merchant create payloads from form state", () => {
    expect(buildMerchantCreatePayload(form)).toEqual({
      name: "阿斯顿",
      country: {
        code: "br",
        name: "巴西",
        defaultLanguage: "pt-BR",
        platformRegisterUrl: "https://example.com/register",
        tgRegisterGuideUrl: "https://example.com/tg",
        requirePlatformAccount: true,
        requirePhone: true,
        requireTelegram: true,
        requireWhatsApp: false
      },
      adminUser: {
        email: "merchant@example.com",
        name: "阿斯顿管理员",
        password: "Merchant123456"
      }
    });
  });

  it("loads merchants and merchant details", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ rows: [merchant] }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ rows: [country] }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ rows: [user] }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(loadAdminMerchants()).resolves.toEqual([merchant]);
    await expect(loadMerchantDetail("merchant-1")).resolves.toEqual({ countries: [country], users: [user] });
    await expect(loadMerchantDetail()).resolves.toEqual({ countries: [], users: [] });

    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/admin/merchants", { headers: {} });
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/admin/merchants/merchant-1/countries", { headers: {} });
    expect(fetcher).toHaveBeenNthCalledWith(3, "/api/admin/users?merchantId=merchant-1", { headers: {} });
    fetcher.mockRestore();
  });

  it("creates merchants and returns login messages", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      merchant,
      adminUser: user
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(createMerchantFromForm(form)).resolves.toEqual({
      merchant,
      loginMessage: "商户已创建。商户端登录邮箱：merchant@example.com；初始密码：Merchant123456"
    });

    expect(fetcher).toHaveBeenCalledWith("/api/admin/merchants", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" }
    }));
    fetcher.mockRestore();
  });

  it("updates and deletes merchants and countries", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...merchant, name: "新名称" }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...country, name: "玻利维亚" }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(updateMerchant("merchant-1", { name: "新名称" })).resolves.toMatchObject({ name: "新名称" });
    await expect(deleteMerchant("merchant-1")).resolves.toBeUndefined();
    await expect(updateMerchantCountry("merchant-1", "country-1", { name: "玻利维亚", requireWhatsApp: false })).resolves.toMatchObject({ name: "玻利维亚" });

    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/admin/merchants/merchant-1", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ name: "新名称" })
    }));
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/admin/merchants/merchant-1", expect.objectContaining({ method: "DELETE" }));
    expect(fetcher).toHaveBeenNthCalledWith(3, "/api/admin/merchants/merchant-1/countries/country-1", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ name: "玻利维亚", requireWhatsApp: false })
    }));
  });

  it("manages merchant users through scoped helpers", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(user), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...user, name: "新名称" }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(createMerchantUser("merchant-1", {
      email: "merchant@example.com",
      name: "商户管理员",
      password: "Merchant123456",
      role: "merchant_admin"
    })).resolves.toBeUndefined();
    await expect(updateMerchantUser("merchant-1", "user-1", { name: "新名称", password: "" })).resolves.toBeUndefined();
    await expect(deleteMerchantUser("user-1")).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/admin/users", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        email: "merchant@example.com",
        name: "商户管理员",
        password: "Merchant123456",
        role: "merchant_admin",
        merchantId: "merchant-1"
      })
    }));
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/admin/users/user-1", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ name: "新名称", merchantId: "merchant-1" })
    }));
    expect(fetcher).toHaveBeenNthCalledWith(3, "/api/admin/users/user-1", expect.objectContaining({ method: "DELETE" }));
  });
});
