import { randomUUID } from "node:crypto";
import type { ConversationEngine } from "./conversationEngine.js";
import type { Repositories } from "../repositories.js";

export type TrainingSimulatorMessageInput = {
  customerPhone?: string;
  a2cAccountPhone?: string;
  nickname?: string;
  content?: string;
  msgType?: "text" | "image" | "video" | "audio" | "document";
  url?: string;
  caption?: string;
  fileName?: string;
};

export type TrainingSimulatorResult<T> =
  | { ok: true; value: T }
  | { ok: false; statusCode: 400; error: string };

export async function runMerchantTrainingSimulation(
  repos: Repositories,
  conversationEngine: ConversationEngine,
  merchantId: string,
  input: TrainingSimulatorMessageInput,
  options: { now?: number; randomSuffix?: string } = {}
) {
  const config = repos.getMerchantConfig(merchantId);
  const accounts = repos.listMerchantA2CAccounts({ merchantId, enabled: true });
  const configuredAccount = config.a2cAccountPhone.split(",").map((item) => item.trim()).find(Boolean);
  const a2cAccountPhone = input.a2cAccountPhone || accounts[0]?.apiPhone || configuredAccount || "simulation-a2c";
  const nowMs = options.now ?? Date.now();
  const customerPhone = input.customerPhone || `sim-customer-${nowMs}`;
  const msgType = input.msgType || (input.url ? "image" : "text");
  const content = input.content || input.caption || "";
  if (msgType === "text" && !content.trim()) return invalidSimulation("请输入客户消息");
  if (msgType !== "text" && !input.url && !content.trim()) return invalidSimulation("请输入媒体链接或说明");

  const nowSeconds = Math.floor(nowMs / 1000);
  const suffix = options.randomSuffix || randomUUID().slice(0, 8);
  const messageId = `sim_in:${merchantId}:${customerPhone}:${nowMs}:${suffix}`;
  const result = await conversationEngine.simulateInboundMessage({
    merchantId,
    payload: {
      id: `sim:${messageId}`,
      timestamp: nowSeconds,
      type: "CUSTOMER_MESSAGE",
      data: {
        messageId,
        content,
        from: customerPhone,
        to: a2cAccountPhone,
        msgType,
        timestamp: nowSeconds,
        nickname: input.nickname || "模拟客户",
        url: input.url,
        caption: input.caption,
        fileName: input.fileName
      }
    }
  });
  const conversation = result.conversationId ? repos.getConversation(result.conversationId) : undefined;
  return {
    ok: true as const,
    value: {
      ...result,
      conversation,
      rows: result.conversationId ? repos.listConversationMessages(result.conversationId, 80) : []
    }
  };
}

function invalidSimulation(error: string): TrainingSimulatorResult<never> {
  return { ok: false, statusCode: 400, error };
}
