import { describe, expect, it, vi } from "vitest";
import {
  checkConfig,
  saveConfig,
  saveCountry,
  setupTelegramWebhook,
  syncA2CAccounts,
  toggleA2CAccount,
  uploadRegistrationTutorialImage
} from "../frontend/src/config/configApi.js";

describe("config API helpers", () => {
  it("uploads registration tutorial images with multipart form data", async () => {
    const file = new File(["image"], "tutorial.png", { type: "image/png" });
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      imageUrl: "https://cdn.example/tutorial.png",
      config: { registrationTutorialImageUrl: "https://cdn.example/tutorial.png" }
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await uploadRegistrationTutorialImage("/api/upload", file, fetcher as never);

    expect(result.imageUrl).toBe("https://cdn.example/tutorial.png");
    expect(fetcher).toHaveBeenCalledWith(
      "/api/upload",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData)
      })
    );
  });

  it("translates upload API errors for operators", async () => {
    const file = new File(["image"], "tutorial.png", { type: "image/png" });
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(uploadRegistrationTutorialImage("/api/upload", file, fetcher as never)).rejects.toThrow("未找到");
  });

  it("checks merchant config through the shared JSON client", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      rows: [{ name: "A2C", status: "ok" }],
      checkedAt: "2026-07-03T10:00:00Z"
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await checkConfig("/api/merchant/config/check");

    expect(result.rows).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith("/api/merchant/config/check", { headers: {} });
    fetcher.mockRestore();
  });

  it("saves config and syncs A2C accounts with stable request shapes", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ a2cAppId: "app-1" }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ imported: 1, rows: [{ id: 1, apiPhone: "10086" }], config: { a2cReceiveAccounts: "10086" } }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(saveConfig("/api/merchant/config", { a2cAppId: "app-1" })).resolves.toMatchObject({ a2cAppId: "app-1" });
    await expect(syncA2CAccounts("/api/merchant/a2c/accounts/sync")).resolves.toMatchObject({ imported: 1 });

    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/merchant/config", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ a2cAppId: "app-1" }),
      headers: { "Content-Type": "application/json" }
    }));
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/merchant/a2c/accounts/sync", expect.objectContaining({
      method: "POST",
      headers: {}
    }));
    fetcher.mockRestore();
  });

  it("keeps config mutations behind focused helper functions", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ config: { a2cReceiveAccounts: "10086" } }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ config: { telegramBotToken: "saved" }, webhookUrl: "https://example.com/tg" }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(toggleA2CAccount("/api/merchant/a2c/accounts/1", false)).resolves.toMatchObject({ config: { a2cReceiveAccounts: "10086" } });
    await expect(saveCountry("/api/merchant/countries", { name: "玻利维亚", code: "bo", requirePhone: true })).resolves.toBeUndefined();
    await expect(setupTelegramWebhook("/api/merchant/telegram/setup-webhook")).resolves.toMatchObject({ webhookUrl: "https://example.com/tg" });

    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/merchant/a2c/accounts/1", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ enabled: false })
    }));
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/merchant/countries", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ name: "玻利维亚", code: "bo", requirePhone: true })
    }));
    expect(fetcher).toHaveBeenNthCalledWith(3, "/api/merchant/telegram/setup-webhook", expect.objectContaining({ method: "POST" }));
    fetcher.mockRestore();
  });
});
