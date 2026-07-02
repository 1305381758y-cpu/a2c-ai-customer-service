import type { FastifyRequest } from "fastify";
import { requestUser } from "../auth.js";

export function maskUser<T extends { passwordHash?: string }>(user: T): Omit<T, "passwordHash"> {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}

export function scopedMerchantId(request: FastifyRequest): string {
  const user = requestUser(request);
  return user.role === "platform_admin" ? "default" : user.merchantId ?? "default";
}
