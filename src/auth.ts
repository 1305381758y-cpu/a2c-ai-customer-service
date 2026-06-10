import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "./config.js";
import type { Repositories, UserRecord } from "./repositories.js";

export type UserRole = "platform_admin" | "merchant_admin" | "merchant_operator";

export interface SessionUser {
  id: string;
  merchantId: string | null;
  email: string;
  name: string;
  role: UserRole;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [, salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const actual = Buffer.from(scryptSync(password, salt, 64).toString("hex"), "hex");
  const expected = Buffer.from(hash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createSessionToken(user: SessionUser, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString("base64url");
  const sig = sign(payload, secret);
  return `${payload}.${sig}`;
}

export function readSessionToken(token: string | undefined, secret: string): SessionUser | undefined {
  if (!token) return undefined;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || sign(payload, secret) !== sig) return undefined;
  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionUser & { exp: number };
  if (!data.exp || Date.now() > data.exp) return undefined;
  return { id: data.id, merchantId: data.merchantId, email: data.email, name: data.name, role: data.role };
}

export function getCookie(request: FastifyRequest, name: string): string | undefined {
  const raw = request.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.header("Set-Cookie", `a2c_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`);
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.header("Set-Cookie", "a2c_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
}

export function requireUser(config: AppConfig, repos: Repositories, roles?: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const session = readSessionToken(getCookie(request, "a2c_session"), config.SESSION_SECRET);
    if (!session) return reply.code(401).send({ error: "unauthorized" });
    const user = repos.getUserById(session.id);
    if (!user || user.status !== "active") return reply.code(401).send({ error: "unauthorized" });
    const fresh = toSessionUser(user);
    if (roles && !roles.includes(fresh.role)) return reply.code(403).send({ error: "forbidden" });
    (request as FastifyRequest & { user: SessionUser }).user = fresh;
  };
}

export function requestUser(request: FastifyRequest): SessionUser {
  return (request as FastifyRequest & { user: SessionUser }).user;
}

export function toSessionUser(user: UserRecord): SessionUser {
  return {
    id: user.id,
    merchantId: user.merchantId,
    email: user.email,
    name: user.name,
    role: user.role
  };
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
