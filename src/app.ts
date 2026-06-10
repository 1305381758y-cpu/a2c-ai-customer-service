import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { A2CClient } from "./clients/a2c.js";
import { OpenAIReplyClient } from "./clients/openaiReply.js";
import { TelegramClient } from "./clients/telegram.js";
import type { AppConfig } from "./config.js";
import { openDb } from "./db.js";
import { Repositories } from "./repositories.js";
import { registerRoutes } from "./routes.js";
import { WebhookProcessor } from "./services/webhookProcessor.js";

export function buildApp(config: AppConfig) {
  const app = Fastify({ logger: true });
  const db = openDb(config.DATABASE_URL);
  const repos = new Repositories(db);
  const processor = new WebhookProcessor(
    repos,
    new OpenAIReplyClient(config),
    new A2CClient(config),
    new TelegramClient(config)
  );

  app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 }
  });
  registerRoutes(app, { config, repos, processor });

  return app;
}
