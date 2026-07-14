import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clearSessionCookie, createSessionToken, requireUser, requestPortalMode, requestUser, setSessionCookie, toSessionUser, verifyPassword } from "../auth.js";
import type { AppConfig } from "../config.js";
import type { Repositories } from "../repositories.js";

type AuthRoutesDeps = {
  config: AppConfig;
  repos: Repositories;
};

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRoutesDeps): void {
  app.post("/api/auth/login", async (request, reply) => {
    const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(request.body);
    const user = deps.repos.getUserByEmail(body.email);
    if (!user || user.status !== "active" || !verifyPassword(body.password, user.passwordHash)) {
      return reply.code(401).send({ error: "invalid credentials" });
    }
    const session = toSessionUser(user);
    setSessionCookie(reply, createSessionToken(session, deps.config.SESSION_SECRET), requestPortalMode(request));
    return { user: session };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    clearSessionCookie(reply, requestPortalMode(request));
    return { ok: true };
  });

  app.get("/api/auth/me", { preHandler: requireUser(deps.config, deps.repos) }, async (request) => ({ user: requestUser(request) }));
}
