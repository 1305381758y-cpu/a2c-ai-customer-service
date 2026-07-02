import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { requireUser } from "../auth.js";
import type { AppConfig } from "../config.js";
import type { Repositories } from "../repositories.js";
import { a2cAccountAllowed, sendManualOutboundMessage } from "../services/manualOutboundMessaging.js";
import { scopedMerchantId } from "./routeHelpers.js";

type MerchantOutboundMessageRoutesDeps = {
  config: AppConfig;
  repos: Repositories;
  merchantRoles: ReturnType<typeof requireUser>;
};

const manualSendSchema = z.object({
  type: z.enum(["text", "image", "video", "audio", "document"]).optional(),
  content: z.string().optional(),
  url: z.string().optional(),
  caption: z.string().optional(),
  fileName: z.string().optional()
});

const proactiveSendSchema = manualSendSchema.extend({
  customerPhone: z.string().min(1),
  nickname: z.string().optional()
});

type ManualSendBody = z.infer<typeof manualSendSchema>;
type ProactiveSendBody = z.infer<typeof proactiveSendSchema>;

export function registerMerchantOutboundMessageRoutes(app: FastifyInstance, deps: MerchantOutboundMessageRoutesDeps): void {
  app.post<{ Params: { id: string }; Body: ManualSendBody }>("/api/merchant/conversations/:id/send", { preHandler: deps.merchantRoles }, async (request, reply) => {
    const conversation = deps.repos.getConversation(request.params.id);
    if (!conversation || conversation.merchantId !== scopedMerchantId(request)) return reply.code(404).send({ error: "conversation not found" });
    const result = await sendManualOutboundMessage(deps, {
      merchantId: conversation.merchantId,
      conversation,
      body: manualSendSchema.parse(request.body ?? {}),
      rawPayload: { replyMode: "manual", manual: true }
    });
    if (result.ok) return result.value;
    return reply.code(result.statusCode).send({ error: result.error });
  });

  app.post<{ Params: { apiPhone: string }; Body: ProactiveSendBody }>("/api/merchant/a2c/accounts/:apiPhone/send", { preHandler: deps.merchantRoles }, async (request, reply) => {
    const merchantId = scopedMerchantId(request);
    const apiPhone = decodeURIComponent(request.params.apiPhone);
    const body = proactiveSendSchema.parse(request.body ?? {});
    const cfg = deps.repos.getMerchantConfig(merchantId);
    if (!a2cAccountAllowed(deps.repos, merchantId, cfg, apiPhone)) {
      return reply.code(404).send({ error: "a2c account not found or disabled" });
    }

    const conversation = deps.repos.getOrCreateConversation(body.customerPhone, apiPhone, body.nickname || "", merchantId, deps.repos.defaultCountryId(merchantId));
    deps.repos.upsertCustomerFromConversation(conversation);
    const result = await sendManualOutboundMessage(deps, {
      merchantId,
      conversation,
      body,
      rawPayload: { replyMode: "manual", manual: true, proactive: true }
    });
    if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
    if ("externalId" in result.value) {
      deps.repos.updateCustomerMemoryFromMessage(conversation, {
        intent: "unknown",
        content: result.value.content,
        direction: "outbound"
      });
    }
    return result.value;
  });
}
