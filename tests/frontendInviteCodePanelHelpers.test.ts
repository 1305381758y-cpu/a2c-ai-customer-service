import { describe, expect, it } from "vitest";

import { inviteCodeEndpoints, inviteCodeStatusCounts } from "../frontend/src/settings/InviteCodePanelHelpers.js";
import type { InviteCode } from "../frontend/src/types.js";

describe("frontend invite code panel helpers", () => {
  it("builds merchant invite code endpoints under the selected A2C account", () => {
    expect(inviteCodeEndpoints(false, 12)).toEqual({
      accountCodes: "/api/merchant/a2c/accounts/12/invite-codes",
      codeBase: "/api/merchant/invite-codes"
    });
  });

  it("builds platform invite code endpoints under the selected A2C account", () => {
    expect(inviteCodeEndpoints(true, 34)).toEqual({
      accountCodes: "/api/admin/a2c/accounts/34/invite-codes",
      codeBase: "/api/admin/invite-codes"
    });
  });

  it("counts invite code statuses shown in the account card", () => {
    expect(inviteCodeStatusCounts([
      invite({ status: "available" }),
      invite({ id: 2, status: "available" }),
      invite({ id: 3, status: "reserved" }),
      invite({ id: 4, status: "used" }),
      invite({ id: 5, status: "disabled" }),
      invite({ id: 6, status: "unknown" })
    ])).toEqual({ available: 2, reserved: 1, used: 1, disabled: 1 });
  });
});

function invite(patch: Partial<InviteCode> = {}): InviteCode {
  return {
    id: 1,
    merchantId: "merchant-1",
    countryId: "country-1",
    countryName: "玻利维亚",
    a2cAccountId: 1,
    a2cAccountPhone: "591",
    code: "INV-1",
    registerUrl: "",
    status: "available",
    assignedCustomerKey: "",
    assignedConversationId: "",
    platformAccount: "",
    assignedAt: "",
    usedAt: "",
    createdAt: "2026-07-01 00:00:00",
    updatedAt: "2026-07-01 00:00:00",
    ...patch
  };
}
