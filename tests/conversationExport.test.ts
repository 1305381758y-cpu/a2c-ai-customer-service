import { describe, expect, it } from "vitest";
import type { ConversationExportRecord } from "../src/repositories.js";
import { buildConversationExportFile, listConversationExportRows, normalizeConversationExportQuery } from "../src/services/conversationExport.js";

describe("conversation export service", () => {
  it("normalizes query filters and ignores unsupported enum values", () => {
    expect(
      normalizeConversationExportQuery({
        merchantId: " merchant-1 ",
        countryId: "bo",
        status: "deleted",
        handoffStatus: "processing",
        direction: "sideways",
        language: " es ",
        limit: "5000"
      })
    ).toEqual({
      merchantId: "merchant-1",
      countryId: "bo",
      status: undefined,
      handoffStatus: "processing",
      language: "es",
      a2cAccountPhone: undefined,
      customerPhone: undefined,
      direction: undefined,
      startAt: undefined,
      endAt: undefined,
      limit: 5000
    });
  });

  it("builds CSV export files with Beijing timestamps and escaped cells", () => {
    const file = buildConversationExportFile(
      [
        exportRow({
          createdAt: "2026-07-03T08:00:00.000Z",
          content: "第一行\n第二行",
          originalContent: "他说 \"你好\""
        })
      ],
      "csv",
      "merchant-conversations",
      new Date("2026-07-03T08:30:05.000Z")
    );

    expect(file.contentType).toBe("text/csv; charset=utf-8");
    expect(file.filename).toBe("merchant-conversations-2026-07-03-16-30-05.csv");
    expect(file.body).toContain('"消息时间","商户ID"');
    expect(file.body).toContain('"2026-07-03 16:00:00"');
    expect(file.body).toContain('"第一行 第二行"');
    expect(file.body).toContain('"他说 ""你好"""');
  });

  it("builds JSONL export files with Beijing timestamps", () => {
    const file = buildConversationExportFile(
      [exportRow({ createdAt: "2026-07-03 08:00:00" })],
      "jsonl",
      "admin-conversations",
      new Date("2026-07-03T08:30:05.000Z")
    );

    expect(file.contentType).toBe("application/x-ndjson; charset=utf-8");
    expect(file.filename).toBe("admin-conversations-2026-07-03-16-30-05.jsonl");
    expect(file.body.endsWith("\n")).toBe(true);
    expect(JSON.parse(file.body)).toMatchObject({ createdAt: "2026-07-03 16:00:00" });
  });

  it("lists admin export rows with normalized filters", () => {
    const calls: unknown[] = [];
    const repos = {
      exportConversationMessages(filters: unknown) {
        calls.push(filters);
        return [exportRow({ merchantId: "merchant-2" })];
      }
    };

    const rows = listConversationExportRows(
      repos as never,
      { merchantId: " merchant-2 ", direction: "inbound", status: "active", limit: "20" }
    );

    expect(rows).toHaveLength(1);
    expect(calls).toEqual([
      expect.objectContaining({
        merchantId: "merchant-2",
        direction: "inbound",
        status: "active",
        limit: 20
      })
    ]);
  });

  it("forces merchant scoped exports to the current merchant", () => {
    const calls: unknown[] = [];
    const repos = {
      exportConversationMessages(filters: unknown) {
        calls.push(filters);
        return [exportRow({ merchantId: "merchant-safe" })];
      }
    };

    listConversationExportRows(
      repos as never,
      { merchantId: "merchant-from-query", customerPhone: " 591000 " },
      { merchantId: "merchant-safe" }
    );

    expect(calls).toEqual([
      expect.objectContaining({
        merchantId: "merchant-safe",
        customerPhone: "591000"
      })
    ]);
  });
});

function exportRow(overrides: Partial<ConversationExportRecord> = {}): ConversationExportRecord {
  return {
    merchantId: "merchant-1",
    countryId: "country-1",
    countryCode: "BO",
    countryName: "玻利维亚",
    conversationId: "conversation-1",
    customerPhone: "591000",
    nickname: "客户A",
    a2cAccountPhone: "service-1",
    conversationLanguage: "es",
    conversationStage: "wait_registration",
    flowStep: "wait_registration",
    conversationStatus: "active",
    handoffStatus: "pending",
    extractedPhone: "",
    extractedTelegram: "",
    extractedWhatsApp: "",
    messageId: 1,
    direction: "inbound",
    msgType: "text",
    messageLanguage: "es",
    intent: "ask_link",
    content: "内容",
    originalContent: "原文",
    translatedContent: "译文",
    targetLanguage: "zh",
    operatorTranslatedContent: "",
    replyMode: "strict_flow",
    strictFlowStep: "wait_registration",
    a2cSendStatus: "",
    a2cSendError: "",
    phoneDetected: "",
    telegramDetected: "",
    whatsappDetected: "",
    externalId: "external-1",
    createdAt: "2026-07-03T08:00:00.000Z",
    ...overrides
  };
}
