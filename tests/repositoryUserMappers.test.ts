import { describe, expect, it } from "vitest";
import { mapUser } from "../src/repositoryUserMappers.js";

describe("repositoryUserMappers", () => {
  it("maps users with nullable merchant and status fallback", () => {
    expect(mapUser({
      id: "u1",
      email: "admin@example.com",
      name: "平台管理员",
      password_hash: "hashed",
      role: "platform_admin"
    })).toEqual({
      id: "u1",
      merchantId: null,
      email: "admin@example.com",
      name: "平台管理员",
      passwordHash: "hashed",
      role: "platform_admin",
      status: "active"
    });
  });
});
