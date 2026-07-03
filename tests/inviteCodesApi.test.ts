import { describe, expect, it, vi } from "vitest";

import {
  deleteInviteCode,
  importInviteCodes,
  inviteCodeItemEndpoint,
  inviteCodeListEndpoint,
  loadInviteCodes,
  updateInviteCode
} from "../frontend/src/config/inviteCodesApi.js";

const inviteCode = {
  id: 7,
  merchantId: "merchant-1",
  countryId: "country-1",
  countryName: "巴西",
  a2cAccountId: 3,
  a2cAccountPhone: "551199999",
  code: "CODE001",
  registerUrl: "https://example.com/register?code={code}",
  status: "available",
  assignedCustomerKey: "",
  assignedConversationId: "",
  platformAccount: "",
  assignedAt: "",
  usedAt: "",
  createdAt: "2026-07-03T10:00:00Z",
  updatedAt: "2026-07-03T10:00:00Z"
};

describe("invite code API helpers", () => {
  it("builds scoped invite code endpoints", () => {
    expect(inviteCodeListEndpoint(false, 3)).toBe("/api/merchant/a2c/accounts/3/invite-codes");
    expect(inviteCodeListEndpoint(true, 3)).toBe("/api/admin/a2c/accounts/3/invite-codes");
    expect(inviteCodeItemEndpoint(false)).toBe("/api/merchant/invite-codes");
    expect(inviteCodeItemEndpoint(true)).toBe("/api/admin/invite-codes");
  });

  it("loads invite codes", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      rows: [inviteCode]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(loadInviteCodes("/api/merchant/a2c/accounts/3/invite-codes")).resolves.toEqual([inviteCode]);

    expect(fetcher).toHaveBeenCalledWith("/api/merchant/a2c/accounts/3/invite-codes", { headers: {} });
    fetcher.mockRestore();
  });

  it("imports invite codes", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      imported: 2,
      rows: [inviteCode]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(importInviteCodes("/api/merchant/a2c/accounts/3/invite-codes", {
      codes: "CODE001\nCODE002",
      registerUrl: "https://example.com/register?code={code}"
    })).resolves.toMatchObject({ imported: 2, rows: [inviteCode] });

    expect(fetcher).toHaveBeenCalledWith("/api/merchant/a2c/accounts/3/invite-codes/import", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        codes: "CODE001\nCODE002",
        registerUrl: "https://example.com/register?code={code}"
      }),
      headers: { "Content-Type": "application/json" }
    }));
    fetcher.mockRestore();
  });

  it("updates and deletes invite codes", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(updateInviteCode("/api/merchant/invite-codes", 7, {
      code: "CODE001",
      registerUrl: "https://example.com/register?code={code}",
      status: "disabled"
    })).resolves.toBeUndefined();
    await expect(deleteInviteCode("/api/merchant/invite-codes", 7)).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/merchant/invite-codes/7", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({
        code: "CODE001",
        registerUrl: "https://example.com/register?code={code}",
        status: "disabled"
      })
    }));
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/merchant/invite-codes/7", expect.objectContaining({ method: "DELETE" }));
    fetcher.mockRestore();
  });
});
