import type { FastifyInstance, FastifyReply } from "fastify";
import type { requireUser } from "../auth.js";
import type { Repositories } from "../repositories.js";
import { listMerchantIntentLearningEvents, patchMerchantIntentLearningEvent, type MerchantIntentLearningResult } from "../services/merchantIntentLearning.js";
import { scopedMerchantId } from "./routeHelpers.js";

type MerchantIntentLearningRoutesDeps = {
  repos: Repositories;
  merchantRoles: ReturnType<typeof requireUser>;
  merchantAdmins: ReturnType<typeof requireUser>;
};

export function registerMerchantIntentLearningRoutes(app: FastifyInstance, deps: MerchantIntentLearningRoutesDeps): void {
  app.get<{ Querystring: { countryId?: string; status?: string; suggestedIntent?: string; limit?: string } }>("/api/merchant/intent-learning", { preHandler: deps.merchantRoles }, async (request) => (
    listMerchantIntentLearningEvents(deps.repos, scopedMerchantId(request), request.query)
  ));

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>("/api/merchant/intent-learning/:id", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    return sendResult(reply, patchMerchantIntentLearningEvent(deps.repos, scopedMerchantId(request), request.params.id, request.body ?? {}));
  });
}

function sendResult<T>(reply: FastifyReply, result: MerchantIntentLearningResult<T>) {
  if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
  return result.value;
}
