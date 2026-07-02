import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";
import { FollowUpProcessor } from "../src/services/followUpProcessor.js";

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it("sends due follow-ups through the follow-up processor module", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const target = String(url);
      if (target.endsWith("/open/auth/token")) {
        return new Response(JSON.stringify({ code: 200, data: { accessToken: "token" } }), { status: 200 });
      }
      if (target.endsWith("/v1/messages")) {
        return new Response(JSON.stringify({ code: 200, data: "followup-message-id" }), { status: 200 });
      }
      return new Response(JSON.stringify({ code: 404, msg: "not found" }), { status: 404 });
    });
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("跟进发送商户");
    repos.patchMerchantConfig(merchant.id, {
      a2cBaseUrl: "https://a2c.test",
      a2cAppId: "app-id",
      a2cAppSecret: "app-secret",
      smartReplyEnabled: true
    });
    const conversation = repos.getOrCreateConversation("5511913586749", "18507251675", "", merchant.id);
    conversation.language = "zh";
    conversation.flowStep = "wait_registration";
    repos.updateConversation(conversation);
    repos.insertMessage({
      conversationId: conversation.id,
      direction: "outbound",
      externalId: "followup-send-seed",
      content: "您先按页面操作，注册好后把手机号发我。",
      msgType: "text",
      language: "zh",
      intent: "unknown",
      rawPayload: { replyMode: "strict_flow", a2cSendStatus: "sent" }
    });
    db.sqlite
      .prepare("UPDATE messages SET created_at = datetime('now', '-3 minutes') WHERE external_id = ?")
      .run("followup-send-seed");
    const processor = new FollowUpProcessor(repos, loadConfig({
      DATABASE_URL: ":memory:",
      A2C_BASE_URL: "https://a2c.test",
      A2C_APP_ID: "app-id",
      A2C_APP_SECRET: "app-secret"
    }));

    await expect(processor.processDueFollowUps()).resolves.toEqual({ scanned: 1, sent: 1, skipped: 0, failed: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const messages = repos.listConversationMessages(conversation.id, 10);
    const followup = messages.find((message) => message.rawPayload?.followupSent === true);
    expect(followup?.rawPayload?.followupSent).toBe(true);
    expect(followup?.rawPayload?.a2cSendStatus).toBe("sent");
    expect(repos.listDueFollowUpCandidates()).toHaveLength(0);
  });
});
