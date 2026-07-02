import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { requireUser } from "../auth.js";
import type { Repositories } from "../repositories.js";
import type { ConversationEngine } from "../services/conversationEngine.js";
import { scopedMerchantId } from "./routeHelpers.js";

type MerchantTrainingSimulatorRoutesDeps = {
  repos: Repositories;
  conversationEngine: ConversationEngine;
  merchantRoles: ReturnType<typeof requireUser>;
};

const simulatorMessageSchema = z.object({
  customerPhone: z.string().trim().min(1).optional(),
  a2cAccountPhone: z.string().trim().min(1).optional(),
  nickname: z.string().trim().optional(),
  content: z.string().optional(),
  msgType: z.enum(["text", "image", "video", "audio", "document"]).optional(),
  url: z.string().optional(),
  caption: z.string().optional(),
  fileName: z.string().optional()
});

export function registerMerchantTrainingSimulatorRoutes(app: FastifyInstance, deps: MerchantTrainingSimulatorRoutesDeps): void {
  app.post<{ Body: z.infer<typeof simulatorMessageSchema> }>("/api/merchant/training-simulator/messages", { preHandler: deps.merchantRoles }, async (request, reply) => {
    const merchantId = scopedMerchantId(request);
    const body = simulatorMessageSchema.parse(request.body ?? {});
    const config = deps.repos.getMerchantConfig(merchantId);
    const accounts = deps.repos.listMerchantA2CAccounts({ merchantId, enabled: true });
    const configuredAccount = config.a2cAccountPhone.split(",").map((item) => item.trim()).find(Boolean);
    const a2cAccountPhone = body.a2cAccountPhone || accounts[0]?.apiPhone || configuredAccount || "simulation-a2c";
    const customerPhone = body.customerPhone || `sim-customer-${Date.now()}`;
    const msgType = body.msgType || (body.url ? "image" : "text");
    const content = body.content || body.caption || "";
    if (msgType === "text" && !content.trim()) return reply.code(400).send({ error: "请输入客户消息" });
    if (msgType !== "text" && !body.url && !content.trim()) return reply.code(400).send({ error: "请输入媒体链接或说明" });
    const now = Math.floor(Date.now() / 1000);
    const messageId = `sim_in:${merchantId}:${customerPhone}:${Date.now()}:${randomUUID().slice(0, 8)}`;
    const result = await deps.conversationEngine.simulateInboundMessage({
      merchantId,
      payload: {
        id: `sim:${messageId}`,
        timestamp: now,
        type: "CUSTOMER_MESSAGE",
        data: {
          messageId,
          content,
          from: customerPhone,
          to: a2cAccountPhone,
          msgType,
          timestamp: now,
          nickname: body.nickname || "模拟客户",
          url: body.url,
          caption: body.caption,
          fileName: body.fileName
        }
      }
    });
    const conversation = result.conversationId ? deps.repos.getConversation(result.conversationId) : undefined;
    return {
      ...result,
      conversation,
      rows: result.conversationId ? deps.repos.listConversationMessages(result.conversationId, 80) : []
    };
  });
}
