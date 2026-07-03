import type { FastifyReply } from "fastify";

export type HttpResult<T> =
  | { ok: true; value: T }
  | { ok: false; statusCode: number; error: string };

export function sendResult<T>(reply: FastifyReply, result: HttpResult<T>): T | FastifyReply {
  if (!result.ok) return reply.code(result.statusCode).send({ error: result.error });
  return result.value;
}
