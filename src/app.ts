import Fastify from "fastify";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { AppConfig } from "./config.js";
import { openDb } from "./db.js";
import { Repositories } from "./repositories.js";
import { registerRoutes } from "./routes.js";
import { ConversationEngine } from "./services/conversationEngine.js";
import { createConversationApplication } from "./services/conversationApplication.js";
import { hashPassword } from "./auth.js";
import { setAiCallRecorder } from "./clients/aiProviderRuntime.js";

const UPLOAD_LIMIT_BYTES = 100 * 1024 * 1024;

export function buildApp(config: AppConfig) {
  const app = Fastify({ logger: true, bodyLimit: UPLOAD_LIMIT_BYTES });
  const db = openDb(config.DATABASE_URL);
  const repos = new Repositories(db);
  setAiCallRecorder((input) => repos.recordAiCall(input));
  repos.ensureBootstrapAdmin({
    email: config.DEFAULT_ADMIN_EMAIL,
    passwordHash: hashPassword(config.DEFAULT_ADMIN_PASSWORD)
  });
  const conversationEngine = new ConversationEngine(createConversationApplication(repos, config));

  app.register(multipart, {
    limits: {
      fileSize: UPLOAD_LIMIT_BYTES,
      fieldSize: 2 * 1024 * 1024,
      files: 1
    }
  });
  const publicDir = join(process.cwd(), "dist", "public");
  const assetsDir = join(publicDir, "assets");
  if (existsSync(assetsDir)) {
    app.register(fastifyStatic, {
      root: assetsDir,
      prefix: "/assets/",
      decorateReply: false
    });
  }
  const uploadDir = config.DATABASE_URL === ":memory:" ? join(process.cwd(), "data", "uploads") : join(dirname(resolve(config.DATABASE_URL)), "uploads");
  mkdirSync(uploadDir, { recursive: true });
  app.register(fastifyStatic, {
    root: uploadDir,
    prefix: "/uploads/",
    decorateReply: false
  });
  registerRoutes(app, { config, repos, conversationEngine });

  return app;
}
