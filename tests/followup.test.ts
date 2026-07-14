import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";
import { FollowUpProcessor } from "../src/services/followUpProcessor.js";
import { createA2CFollowUpSender } from "../src/services/followUpSender.js";

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
    const sender = {
      send: vi.fn(async () => ({
        sendResult: {
          externalId: "followup-message-id",
          a2cSendStatus: "sent" as const,
          a2cSendError: ""
        },
        inserted: true,
        messageId: 100
      }))
    };
    const processor = new FollowUpProcessor(repos, loadConfig({
      DATABASE_URL: ":memory:",
      A2C_BASE_URL: "https://a2c.test",
      A2C_APP_ID: "app-id",
      A2C_APP_SECRET: "app-secret"
    }), sender);

    await expect(processor.processDueFollowUps()).resolves.toEqual({ scanned: 1, sent: 1, skipped: 0, failed: 0 });

    expect(sender.send).toHaveBeenCalledWith(expect.objectContaining({
      content: "您注册到哪一步了？如果卡住，把页面情况发我就行。",
      flowStep: "wait_registration",
      conversation: expect.objectContaining({
        customerPhone: "5511913586749",
        a2cAccountPhone: "18507251675"
      })
    }));
    expect(repos.listDueFollowUpCandidates()).toHaveLength(0);
  });

  it("can use an injected follow-up content builder without changing delivery", async () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("跟进文案商户");
    repos.patchMerchantConfig(merchant.id, {
      a2cBaseUrl: "https://a2c.test",
      a2cAppId: "app-id",
      a2cAppSecret: "app-secret",
      smartReplyEnabled: true
    });
    const conversation = repos.getOrCreateConversation("customer-custom", "agent-custom", "", merchant.id);
    conversation.language = "zh";
    conversation.flowStep = "collect_telegram";
    repos.updateConversation(conversation);
    repos.insertMessage({
      conversationId: conversation.id,
      direction: "outbound",
      externalId: "followup-custom-seed",
      content: "请把 Telegram 用户名发给我。",
      msgType: "text",
      language: "zh",
      intent: "unknown",
      rawPayload: { replyMode: "strict_flow", a2cSendStatus: "sent" }
    });
    db.sqlite
      .prepare("UPDATE messages SET created_at = datetime('now', '-3 minutes') WHERE external_id = ?")
      .run("followup-custom-seed");
    const sender = {
      send: vi.fn(async () => ({
        sendResult: {
          externalId: "custom-followup-message-id",
          a2cSendStatus: "sent" as const,
          a2cSendError: ""
        },
        inserted: true,
        messageId: 101
      }))
    };
    const contentBuilder = {
      build: vi.fn(() => "这是注入的跟进话术")
    };
    const processor = new FollowUpProcessor(repos, loadConfig({
      DATABASE_URL: ":memory:",
      A2C_BASE_URL: "https://a2c.test",
      A2C_APP_ID: "app-id",
      A2C_APP_SECRET: "app-secret"
    }), sender, contentBuilder);

    await expect(processor.processDueFollowUps()).resolves.toEqual({ scanned: 1, sent: 1, skipped: 0, failed: 0 });

    expect(contentBuilder.build).toHaveBeenCalledWith({
      flowStep: "collect_telegram",
      language: "zh"
    });
    expect(sender.send).toHaveBeenCalledWith(expect.objectContaining({
      content: "这是注入的跟进话术",
      flowStep: "collect_telegram"
    }));
  });

  it("does not overlap cron runs while an upstream follow-up is still sending", async () => {
    const db = openDb(":memory:");
    const repos = new Repositories(db);
    const merchant = repos.createMerchant("跟进防重叠商户");
    repos.patchMerchantConfig(merchant.id, { smartReplyEnabled: true });
    const conversation = repos.getOrCreateConversation("followup-lock-customer", "followup-lock-account", "", merchant.id);
    conversation.language = "zh";
    conversation.flowStep = "wait_registration";
    repos.updateConversation(conversation);
    repos.insertMessage({
      conversationId: conversation.id,
      direction: "outbound",
      externalId: "followup-lock-seed",
      content: "您先按页面操作。",
      msgType: "text",
      language: "zh",
      intent: "unknown",
      rawPayload: { replyMode: "strict_flow", a2cSendStatus: "sent" }
    });
    db.sqlite.prepare("UPDATE messages SET created_at = datetime('now', '-3 minutes') WHERE external_id = ?").run("followup-lock-seed");

    let release!: () => void;
    const sender = {
      send: vi.fn(() => new Promise<{ sendResult: { externalId: string; a2cSendStatus: "sent"; a2cSendError: string }; inserted: boolean; messageId: number }>((resolve) => {
        release = () => resolve({ sendResult: { externalId: "followup-lock-message", a2cSendStatus: "sent", a2cSendError: "" }, inserted: true, messageId: 102 });
      }))
    };
    const processor = new FollowUpProcessor(repos, loadConfig({ DATABASE_URL: ":memory:" }), sender);
    const firstRun = processor.processDueFollowUps();
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledTimes(1));
    await expect(processor.processDueFollowUps()).resolves.toEqual({ scanned: 0, sent: 0, skipped: 0, failed: 0 });
    release();
    await expect(firstRun).resolves.toEqual({ scanned: 1, sent: 1, skipped: 0, failed: 0 });
  });

  it("keeps the default A2C follow-up sender behind an adapter seam", async () => {
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
    const repos = new Repositories(openDb(":memory:"));
    const merchant = repos.createMerchant("跟进 adapter 商户");
    const conversation = repos.getOrCreateConversation("5511913586749", "18507251675", "", merchant.id);
    const sender = createA2CFollowUpSender(repos);

    await expect(sender.send({
      runtimeConfig: loadConfig({
        DATABASE_URL: ":memory:",
        A2C_BASE_URL: "https://a2c.test",
        A2C_APP_ID: "app-id",
        A2C_APP_SECRET: "app-secret"
      }),
      conversation,
      flowStep: "wait_registration",
      content: "您注册到哪一步了？"
    })).resolves.toMatchObject({
      sendResult: {
        externalId: "followup-message-id",
        a2cSendStatus: "sent",
        a2cSendError: ""
      },
      inserted: true
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const messages = repos.listConversationMessages(conversation.id, 10);
    const followup = messages.find((message) => message.rawPayload?.followupSent === true);
    expect(followup?.rawPayload).toMatchObject({
      followupSent: true,
      followupReason: "idle_2m",
      followupStep: "wait_registration",
      a2cSendStatus: "sent",
      simulation: false
    });
  });
});
