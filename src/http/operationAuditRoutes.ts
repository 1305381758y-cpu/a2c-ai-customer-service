import type { FastifyInstance, FastifyRequest } from "fastify";
import type { requireUser, SessionUser } from "../auth.js";
import type { Repositories } from "../repositories.js";
import { normalizeSqlTimeRange } from "../services/beijingTime.js";
import { scopedMerchantId } from "./routeHelpers.js";

type OperationAuditDeps = {
  repos: Repositories;
  adminOnly: ReturnType<typeof requireUser>;
  merchantAdmins: ReturnType<typeof requireUser>;
};

export function registerOperationAuditRoutes(app: FastifyInstance, deps: OperationAuditDeps): void {
  app.addHook("onResponse", async (request, reply) => {
    if (!isAuditedRequest(request)) return;
    const user = (request as FastifyRequest & { user?: SessionUser }).user;
    if (!user) return;
    const route = String(request.routeOptions.url || request.url.split("?")[0]);
    const params = request.params as Record<string, unknown> | undefined;
    const body = request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body as Record<string, unknown> : undefined;
    deps.repos.recordOperationLog({
      merchantId: user.merchantId || merchantIdFromRequest(route, params, body),
      actorUserId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: actionFor(request.method, route),
      resourceType: resourceFor(route),
      targetId: targetFromRequest(params),
      route,
      method: request.method,
      status: reply.statusCode < 400 ? "success" : "error",
      httpStatus: reply.statusCode
    });
  });

  app.get<{ Querystring: OperationLogQuery }>("/api/admin/operation-logs", { preHandler: deps.adminOnly }, async (request) =>
    deps.repos.listOperationLogs(normalizeQuery(request.query))
  );
  app.get<{ Querystring: Omit<OperationLogQuery, "merchantId"> }>("/api/merchant/operation-logs", { preHandler: deps.merchantAdmins }, async (request) =>
    deps.repos.listOperationLogs({ ...normalizeQuery(request.query), merchantId: scopedMerchantId(request) })
  );
}

type OperationLogQuery = { merchantId?: string; action?: string; resourceType?: string; status?: string; q?: string; startAt?: string; endAt?: string; timeZone?: string; limit?: string; offset?: string };

function normalizeQuery(query: OperationLogQuery) {
  const range = normalizeSqlTimeRange(query);
  return { ...query, ...range, limit: Number(query.limit || 20), offset: Number(query.offset || 0) };
}

function isAuditedRequest(request: FastifyRequest): boolean {
  return request.url.startsWith("/api/") && ["POST", "PATCH", "DELETE"].includes(request.method) && !request.url.startsWith("/api/auth/");
}

function merchantIdFromRequest(route: string, params?: Record<string, unknown>, body?: Record<string, unknown>): string {
  if (typeof body?.merchantId === "string") return body.merchantId;
  if (route.startsWith("/api/admin/merchants/:id") && typeof params?.id === "string") return params.id;
  return "";
}

function targetFromRequest(params?: Record<string, unknown>): string {
  if (!params) return "";
  for (const key of ["id", "customerKey", "conversationId", "versionId", "linkId", "apiPhone"]) {
    if (params[key] !== undefined) return String(params[key]);
  }
  return "";
}

function actionFor(method: string, route: string): string {
  if (method === "DELETE") return "delete";
  if (route.includes("/restore")) return "restore";
  if (route.includes("/sync")) return "sync";
  if (route.includes("/import")) return "import";
  if (route.includes("/enable")) return "enable";
  if (route.includes("/send")) return "send";
  if (route.includes("/read")) return "mark_read";
  if (method === "PATCH") return "update";
  return "create";
}

function resourceFor(route: string): string {
  const mappings: Array<[RegExp, string]> = [
    [/agent-profile/, "agent_profile"], [/config/, "merchant_config"], [/script-flow/, "script_flow"],
    [/training-material/, "training_material"], [/training-sample/, "training_sample"], [/knowledge/, "knowledge"],
    [/invite-code/, "invite_code"], [/teacher-tg-link/, "teacher_tg_link"], [/a2c\/accounts/, "a2c_account"],
    [/countries/, "country"], [/customers/, "customer"], [/conversations|handoffs/, "conversation"],
    [/users/, "user"], [/merchants/, "merchant"], [/intent-learning/, "intent_learning"]
  ];
  return mappings.find(([pattern]) => pattern.test(route))?.[1] || "system";
}
