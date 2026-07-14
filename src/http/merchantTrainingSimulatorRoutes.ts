import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { requireUser } from "../auth.js";
import type { Repositories } from "../repositories.js";
import type { ConversationEngine } from "../services/conversationEngine.js";
import { runMerchantTrainingSimulation } from "../services/trainingSimulator.js";
import { TestSnapshotRepository } from "../services/testSnapshotRepository.js";
import { TestSimulationStore } from "../services/testSimulationStore.js";
import { sendResult } from "./routeResponses.js";
import { scopedMerchantId } from "./routeHelpers.js";

type MerchantTrainingSimulatorRoutesDeps = {
  repos: Repositories;
  conversationEngine: ConversationEngine;
  testSnapshots: TestSnapshotRepository;
  testSimulationStore: TestSimulationStore;
  merchantRoles: ReturnType<typeof requireUser>;
  adminOnly: ReturnType<typeof requireUser>;
};

const simulatorMessageSchema = z.object({
  snapshotId: z.string().trim().min(1),
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
    const parsed = simulatorMessageSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "模拟消息参数不完整" });
    const body = parsed.data;
    const snapshotId = body.snapshotId;
    const snapshot = deps.testSnapshots.get(snapshotId);
    if (!snapshot || snapshot.merchantId !== merchantId) return reply.code(404).send({ ok: false, error: "测试快照不存在或不属于当前商户" });
    if (!snapshot.validation.valid) return reply.code(400).send({ ok: false, error: "线上正式流程快照不完整，禁止执行完整回归。", snapshot });
    const workspace = deps.testSimulationStore.getWorkspace(snapshot);
    return sendResult(reply, await runMerchantTrainingSimulation(
      workspace?.repos || deps.repos,
      workspace?.engine || deps.conversationEngine,
      merchantId,
      body,
      {},
      deps.testSnapshots,
      workspace?.merchantId,
      deps.repos
    ));
  });

  app.post("/api/merchant/training-snapshots", { preHandler: deps.merchantRoles }, async (request, reply) => {
    try {
      const snapshot = deps.testSnapshots.createFromProduction(deps.repos, scopedMerchantId(request));
      if (!snapshot.validation.valid) {
        return reply.code(400).send({ ok: false, error: "线上正式流程快照不完整，禁止执行完整回归。", snapshot });
      }
      return { ok: true, snapshot };
    } catch (error) {
      return reply.code(400).send({ ok: false, error: error instanceof Error ? error.message : "无法创建线上测试快照" });
    }
  });

  app.post<{ Params: { merchantId: string } }>("/api/admin/merchants/:merchantId/training-snapshots", { preHandler: deps.adminOnly }, async (request, reply) => {
    try {
      const snapshot = deps.testSnapshots.createFromProduction(deps.repos, request.params.merchantId);
      if (!snapshot.validation.valid) {
        return reply.code(400).send({ ok: false, error: "线上正式流程快照不完整，禁止执行完整回归。", snapshot });
      }
      return { ok: true, snapshot };
    } catch (error) {
      return reply.code(400).send({ ok: false, error: error instanceof Error ? error.message : "无法创建线上测试快照" });
    }
  });

  app.get("/api/merchant/training-snapshots", { preHandler: deps.merchantRoles }, async (request) => ({
    ok: true,
    rows: deps.testSnapshots.list(scopedMerchantId(request))
  }));

  app.get<{ Params: { id: string } }>("/api/merchant/training-snapshots/:id", { preHandler: deps.merchantRoles }, async (request, reply) => {
    const snapshot = deps.testSnapshots.get(request.params.id);
    if (!snapshot || snapshot.merchantId !== scopedMerchantId(request)) return reply.code(404).send({ ok: false, error: "测试快照不存在" });
    return { ok: true, snapshot };
  });
}
