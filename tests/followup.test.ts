import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";

describe("follow-up candidates", () => {
  it("returns idle strict-flow conversations once per flow step", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("跟进商户");
    const conversation = repos.getOrCreateConversation("5511913586749", "18507251675", "", merchant.id);
    conversation.language = "zh";
    conversation.flowStep = "wait_registration";
    repos.updateConversation(conversation);
    repos.insertMessage({
      conversationId: conversation.id,
      direction: "outbound",
      externalId: "followup-seed",
      content: "请完成注册后把手机号发给我。",
      msgType: "text",
      language: "zh",
      intent: "unknown",
      rawPayload: { replyMode: "strict_flow", a2cSendStatus: "sent" }
    });
    db.sqlite
      .prepare("UPDATE messages SET created_at = datetime('now', '-3 minutes') WHERE external_id = ?")
      .run("followup-seed");

    const candidates = repos.listDueFollowUpCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0].conversation.id).toBe(conversation.id);

    expect(repos.recordFollowUp({ merchantId: merchant.id, conversationId: conversation.id, flowStep: "wait_registration", sent: true })).toBe(true);
    expect(repos.listDueFollowUpCandidates()).toHaveLength(0);
    expect(repos.recordFollowUp({ merchantId: merchant.id, conversationId: conversation.id, flowStep: "wait_registration", sent: true })).toBe(false);
  });

  it("excludes training simulator conversations from real follow-up delivery", () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("模拟跟进商户");
    const conversation = repos.getOrCreateConversation("sim-customer-001", "18507251675", "", merchant.id);
    conversation.language = "zh";
    conversation.flowStep = "wait_registration";
    repos.updateConversation(conversation);
    repos.insertMessage({
      conversationId: conversation.id,
      direction: "outbound",
      externalId: "simulation-followup-seed",
      content: "您先按页面操作，注册好后把手机号发我。",
      msgType: "text",
      language: "zh",
      intent: "unknown",
      rawPayload: { replyMode: "strict_flow", a2cSendStatus: "simulated", simulation: true }
    });
    db.sqlite
      .prepare("UPDATE messages SET created_at = datetime('now', '-3 minutes') WHERE external_id = ?")
      .run("simulation-followup-seed");

    expect(repos.listDueFollowUpCandidates()).toHaveLength(0);
  });
});
