import type { InviteCode } from "../types.js";

export type InviteCodeEndpoints = {
  accountCodes: string;
  codeBase: string;
};

export function inviteCodeEndpoints(platform: boolean, accountId: number): InviteCodeEndpoints {
  return platform
    ? {
      accountCodes: `/api/admin/a2c/accounts/${accountId}/invite-codes`,
      codeBase: "/api/admin/invite-codes"
    }
    : {
      accountCodes: `/api/merchant/a2c/accounts/${accountId}/invite-codes`,
      codeBase: "/api/merchant/invite-codes"
    };
}

export function inviteCodeStatusCounts(codes: InviteCode[]) {
  return {
    available: codes.filter((item) => item.status === "available").length,
    reserved: codes.filter((item) => item.status === "reserved").length,
    used: codes.filter((item) => item.status === "used").length,
    disabled: codes.filter((item) => item.status === "disabled").length
  };
}
