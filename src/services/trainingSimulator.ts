import { randomUUID } from "node:crypto";
import type { ConversationEngine } from "./conversationEngine.js";
import type { Repositories } from "../repositories.js";
import type { TestSnapshotRepository } from "./testSnapshotRepository.js";

export type TrainingSimulatorMessageInput = {
  snapshotId?: string;
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
  options: { now?: number; randomSuffix?: string } = {},
  snapshots?: TestSnapshotRepository,
  runtimeMerchantId = merchantId,
  productionRepos = repos
) {
  const snapshot = snapshots?.get(input.snapshotId || "");
  if (snapshots && (!snapshot || snapshot.merchantId !== merchantId)) return { ok: false as const, statusCode: 400 as const, error: "请先创建当前商户的线上测试快照" };
  if (snapshot && (!snapshot.validation.valid || snapshot.nodeCount !== 11)) return { ok: false as const, statusCode: 400 as const, error: "线上正式流程快照不完整，禁止执行完整回归。" };
  const config = repos.getMerchantConfig(runtimeMerchantId);
  const accounts = repos.listMerchantA2CAccounts({ merchantId: runtimeMerchantId, enabled: true });
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
    merchantId: runtimeMerchantId,
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
      ...(snapshot && snapshots ? { testSnapshot: {
        snapshotId: snapshot.snapshotId,
        configHash: snapshot.configHash,
        nodeCount: snapshot.nodeCount,
        productionConfigChanged: !snapshots.compareProduction(productionRepos, snapshot)
      } } : {}),
      conversation,
      rows: result.conversationId ? repos.listConversationMessages(result.conversationId, 80) : []
    }
  };
}

function invalidSimulation(error: string): TrainingSimulatorResult<never> {
  return { ok: false, statusCode: 400, error };
}
