import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { requireUser } from "../auth.js";
import type { Repositories } from "../repositories.js";
import type { ConversationEngine } from "../services/conversationEngine.js";
import { runMerchantTrainingSimulation, type TrainingSimulatorResult } from "../services/trainingSimulator.js";
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
    return sendResult(reply, await runMerchantTrainingSimulation(deps.repos, deps.conversationEngine, merchantId, body));
  });
}

function sendResult<T>(reply: FastifyReply, result: TrainingSimulatorResult<T>) {
  if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
  return result.value;
}
