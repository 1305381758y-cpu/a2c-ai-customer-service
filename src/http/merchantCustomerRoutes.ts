import type { FastifyInstance } from "fastify";
import type { requireUser } from "../auth.js";
import type { Repositories } from "../repositories.js";
import { deleteMerchantCustomer, listMerchantCustomers } from "../services/merchantCustomers.js";
import { scopedMerchantId } from "./routeHelpers.js";

type MerchantCustomerRoutesDeps = {
  repos: Repositories;
  merchantRoles: ReturnType<typeof requireUser>;
  merchantAdmins: ReturnType<typeof requireUser>;
};

export function registerMerchantCustomerRoutes(app: FastifyInstance, deps: MerchantCustomerRoutesDeps): void {
  app.get<{ Querystring: { countryId?: string; status?: string; language?: string; q?: string; startAt?: string; endAt?: string; limit?: string } }>("/api/merchant/customers", { preHandler: deps.merchantRoles }, async (request) => (
    listMerchantCustomers(deps.repos, scopedMerchantId(request), request.query)
  ));

  app.delete<{ Params: { customerKey: string } }>("/api/merchant/customers/:customerKey", { preHandler: deps.merchantAdmins }, async (request, reply) => {
    const result = deleteMerchantCustomer(deps.repos, scopedMerchantId(request), request.params.customerKey);
    if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
    return result.value;
  });
}
