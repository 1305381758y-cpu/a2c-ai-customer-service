import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";
import { listAdminConversations } from "../src/services/adminConversations.js";
import { listMerchantConversations } from "../src/services/merchantConversations.js";

describe("conversation list totals", () => {
  it("returns merchant conversation totals independent of the list limit", () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("会话总数商户");
    for (let index = 0; index < 3; index += 1) {
      repos.getOrCreateConversation(`customer-${index}`, "a2c-1", `客户${index}`, merchant.id);
    }

    const result = listMerchantConversations(repos, merchant.id, { limit: "1" });

    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(3);
  });

  it("counts admin conversations with the same filters as the list", () => {
    const repos = new Repositories(openDb(":memory:"));
    const merchantA = repos.createMerchant("平台会话商户A");
    const merchantB = repos.createMerchant("平台会话商户B");
    repos.getOrCreateConversation("match-1", "a2c-1", "匹配1", merchantA.id);
    repos.getOrCreateConversation("match-2", "a2c-1", "匹配2", merchantA.id);
    repos.getOrCreateConversation("other-1", "a2c-1", "其他", merchantB.id);

    const result = listAdminConversations(repos, { merchantId: merchantA.id, limit: "1" });

    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(2);
  });
});
