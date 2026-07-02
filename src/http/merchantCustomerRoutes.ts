import type { FastifyInstance } from "fastify";
import type { requireUser } from "../auth.js";
import type { Repositories } from "../repositories.js";
import { scopedMerchantId } from "./routeHelpers.js";

type MerchantCustomerRoutesDeps = {
  repos: Repositories;
  merchantRoles: ReturnType<typeof requireUser>;
  merchantAdmins: ReturnType<typeof requireUser>;
};

export function registerMerchantCustomerRoutes(app: FastifyInstance, deps: MerchantCustomerRoutesDeps): void {
  app.get<{ Querystring: { countryId?: string; status?: string; language?: string; limit?: string } }>("/api/merchant/customers", { preHandler: deps.merchantRoles }, async (request) => ({
    rows: deps.repos.listCustomers({
      merchantId: scopedMerchantId(request),
      countryId: request.query.countryId,
      status: request.query.status,
      language: request.query.language,
      limit: request.query.limit ? Number(request.query.limit) : undefined
    })
  }));

  app.delete<{ Params: { customerKey: string } }>("/api/merchant/customers/:customerKey", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    const result = deps.repos.deleteCustomer(scopedMerchantId(request), decodeURIComponent(request.params.customerKey));
    if (!result.deleted) return reply.code(404).send({ error: "customer not found" });
    return { ok: true, ...result };
  });
}
