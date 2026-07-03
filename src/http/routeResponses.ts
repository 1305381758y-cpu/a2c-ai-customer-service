import type { FastifyReply } from "fastify";

export type HttpResult<T> =
  | { ok: true; value: T }
  | ({ ok: false; statusCode: number; error: string } & Record<string, unknown>);

export function sendResult<T>(reply: FastifyReply, result: HttpResult<T>): T | FastifyReply {
  if (!result.ok) {
    const { ok: _ok, statusCode: _statusCode, ...body } = result;
    return reply.code(result.statusCode).send(body);
  }
  return result.value;
}
