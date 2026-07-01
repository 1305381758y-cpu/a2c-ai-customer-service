import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";

export function requireInternalApiKey(config: AppConfig) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.headers["x-api-key"] !== config.INTERNAL_API_KEY) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  };
}
