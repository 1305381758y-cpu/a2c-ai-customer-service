import { describe, expect, it } from "vitest";
import { inviteCodeAccountMatches, normalizeInviteCodeStatus, phoneDigits } from "../src/repositoryInviteCodes.js";

describe("repositoryInviteCodes", () => {
  it("normalizes invite code status with fallback", () => {
    expect(normalizeInviteCodeStatus("reserved", "available")).toBe("reserved");
    expect(normalizeInviteCodeStatus("unknown", "used")).toBe("used");
  });

  it("extracts phone digits", () => {
    expect(phoneDigits("+55 (11) 91358-6749")).toBe("5511913586749");
  });

  it("matches only exact or normalized-exact A2C account phones", () => {
    expect(inviteCodeAccountMatches("5511913586749", "5511913586749")).toBe(true);
    expect(inviteCodeAccountMatches("+55 11 91358-6749", "5511913586749")).toBe(true);
    expect(inviteCodeAccountMatches("11913586749", "5511913586749")).toBe(false);
    expect(inviteCodeAccountMatches("913586749", "5511913586749")).toBe(false);
    expect(inviteCodeAccountMatches("1234567", "991234567")).toBe(false);
    expect(inviteCodeAccountMatches("", "5511913586749")).toBe(false);
  });
});
