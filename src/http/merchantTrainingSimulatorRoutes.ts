import type { FastifyInstance, FastifyReply } from "fastify";
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
  merchantAdmins: ReturnType<typeof requireUser>;
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

const createShareLinkSchema = z.object({
  snapshotId: z.string().trim().min(1),
  label: z.string().trim().max(80).optional().default("甲方对话测试"),
  expiresInDays: z.coerce.number().int().min(1).max(30).optional().default(7)
});

const publicSimulatorMessageSchema = z.object({
  sessionId: z.string().trim().min(8).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  content: z.string().trim().min(1).max(4000)
});

export function registerMerchantTrainingSimulatorRoutes(app: FastifyInstance, deps: MerchantTrainingSimulatorRoutesDeps): void {
  app.post<{ Body: z.infer<typeof simulatorMessageSchema> }>("/api/merchant/training-simulator/messages", { preHandler: deps.merchantRoles }, async (request, reply) => {
    const parsed = simulatorMessageSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "模拟消息参数不完整" });
    return sendResult(reply, await runSnapshotSimulation(deps, scopedMerchantId(request), parsed.data));
  });

  app.post<{ Params: { merchantId: string }; Body: z.infer<typeof simulatorMessageSchema> }>("/api/admin/merchants/:merchantId/training-simulator/messages", { preHandler: deps.adminOnly }, async (request, reply) => {
    const parsed = simulatorMessageSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "模拟消息参数不完整" });
    return sendResult(reply, await runSnapshotSimulation(deps, request.params.merchantId, parsed.data));
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

  app.get("/api/merchant/training-simulator/share-links", { preHandler: deps.merchantRoles }, async (request) => ({
    ok: true,
    rows: deps.testSnapshots.listShareLinks(scopedMerchantId(request))
  }));

  app.post<{ Body: z.infer<typeof createShareLinkSchema> }>("/api/merchant/training-simulator/share-links", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    const parsed = createShareLinkSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "测试链接参数不完整" });
    return createShareLinkResponse(deps, reply, scopedMerchantId(request), parsed.data);
  });

  app.post<{ Params: { merchantId: string }; Body: z.infer<typeof createShareLinkSchema> }>("/api/admin/merchants/:merchantId/training-simulator/share-links", { preHandler: deps.adminOnly }, async (request, reply) => {
    const parsed = createShareLinkSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "测试链接参数不完整" });
    return createShareLinkResponse(deps, reply, request.params.merchantId, parsed.data);
  });

  app.delete<{ Params: { id: string } }>("/api/merchant/training-simulator/share-links/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    const revoked = deps.testSnapshots.revokeShareLink(scopedMerchantId(request), request.params.id);
    return revoked ? { ok: true } : reply.code(404).send({ ok: false, error: "测试链接不存在或已撤销" });
  });

  app.get<{ Params: { token: string } }>("/api/public/training-simulator/:token", async (request, reply) => {
    const link = deps.testSnapshots.resolveShareLink(request.params.token);
    if (!link) return reply.code(404).send({ ok: false, error: "测试链接不存在、已过期或已撤销" });
    const snapshot = deps.testSnapshots.get(link.snapshotId);
    if (!snapshot || !snapshot.validation.valid || snapshot.nodeCount !== 11) {
      return reply.code(409).send({ ok: false, error: "测试配置暂不可用，请联系链接发送方重新生成" });
    }
    deps.testSnapshots.recordShareLinkAccess(link.id);
    return {
      ok: true,
      test: {
        label: link.label,
        merchantName: snapshot.merchant.name,
        expiresAt: link.expiresAt,
        nodeCount: snapshot.nodeCount,
        snapshotCreatedAt: snapshot.snapshotCreatedAt,
        productionConfigChanged: !deps.testSnapshots.compareProduction(deps.repos, snapshot)
      }
    };
  });

  app.post<{ Params: { token: string }; Body: z.infer<typeof publicSimulatorMessageSchema> }>("/api/public/training-simulator/:token/messages", async (request, reply) => {
    const parsed = publicSimulatorMessageSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "请输入有效的测试消息" });
    const link = deps.testSnapshots.resolveShareLink(request.params.token);
    if (!link) return reply.code(404).send({ ok: false, error: "测试链接不存在、已过期或已撤销" });
    const result = await runSnapshotSimulation(deps, link.merchantId, {
      snapshotId: link.snapshotId,
      customerPhone: `share-${link.id.slice(0, 8)}-${parsed.data.sessionId}`,
      a2cAccountPhone: "simulation-a2c",
      nickname: "测试客户",
      content: parsed.data.content,
      msgType: "text"
    });
    if (!result.ok) return reply.code(result.statusCode).send({ ok: false, error: result.error });
    deps.testSnapshots.recordShareLinkAccess(link.id);
    return {
      ok: true,
      status: result.value.status,
      rows: result.value.rows.map((row) => ({
        id: row.id,
        direction: row.direction,
        content: row.content,
        msgType: row.msgType,
        language: row.language,
        createdAt: row.createdAt
      })),
      productionConfigChanged: Boolean(result.value.testSnapshot?.productionConfigChanged)
    };
  });
}

function createShareLinkResponse(
  deps: MerchantTrainingSimulatorRoutesDeps,
  reply: FastifyReply,
  merchantId: string,
  input: z.infer<typeof createShareLinkSchema>
) {
  try {
    const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString();
    const link = deps.testSnapshots.createShareLink({ merchantId, snapshotId: input.snapshotId, label: input.label, expiresAt });
    return { ok: true, link: { ...link, path: `/training-test/${link.token}` } };
  } catch (error) {
    return reply.code(400).send({ ok: false, error: error instanceof Error ? error.message : "无法创建测试链接" });
  }
}

async function runSnapshotSimulation(deps: MerchantTrainingSimulatorRoutesDeps, merchantId: string, body: z.infer<typeof simulatorMessageSchema>) {
  const snapshot = deps.testSnapshots.get(body.snapshotId);
  if (!snapshot || snapshot.merchantId !== merchantId) return { ok: false as const, statusCode: 404 as const, error: "测试快照不存在或不属于当前商户" };
  if (!snapshot.validation.valid) return { ok: false as const, statusCode: 400 as const, error: "线上正式流程快照不完整，禁止执行完整回归。" };
  const workspace = deps.testSimulationStore.getWorkspace(snapshot, deps.repos);
  return runMerchantTrainingSimulation(workspace.repos, workspace.engine, merchantId, body, {}, deps.testSnapshots, workspace.merchantId, deps.repos);
}
