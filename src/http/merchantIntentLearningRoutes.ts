import type { FastifyInstance } from "fastify";
import type { requireUser } from "../auth.js";
import type { Repositories } from "../repositories.js";
import { scopedMerchantId } from "./routeHelpers.js";

type MerchantIntentLearningRoutesDeps = {
  repos: Repositories;
  merchantRoles: ReturnType<typeof requireUser>;
  merchantAdmins: ReturnType<typeof requireUser>;
};

export function registerMerchantIntentLearningRoutes(app: FastifyInstance, deps: MerchantIntentLearningRoutesDeps): void {
  app.get<{ Querystring: { countryId?: string; status?: string; suggestedIntent?: string; limit?: string } }>("/api/merchant/intent-learning", { preHandler: deps.merchantRoles }, async (request) => ({
    rows: deps.repos.listIntentLearningEvents({
      merchantId: scopedMerchantId(request),
      countryId: request.query.countryId,
      status: request.query.status,
      suggestedIntent: request.query.suggestedIntent,
      limit: request.query.limit ? Number(request.query.limit) : undefined
    })
  }));

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/intent-learning/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "invalid id" });
    const row = deps.repos.patchIntentLearningEvent(id, request.body ?? {}, scopedMerchantId(request));
    if (!row) return reply.code(404).send({ error: "intent learning event not found" });
    return row;
  });
}
