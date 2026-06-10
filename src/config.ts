import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().default("./data/app.db"),
  INTERNAL_API_KEY: z.string().default("change-me"),
  A2C_BASE_URL: z.string().default("https://openapi.a2c.chat/api/openapi"),
  A2C_APP_ID: z.string().optional().default(""),
  A2C_APP_SECRET: z.string().optional().default(""),
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_MODEL: z.string().default("gpt-5-mini"),
  TELEGRAM_BOT_TOKEN: z.string().optional().default(""),
  TELEGRAM_HANDOFF_CHAT_ID: z.string().optional().default(""),
  PLATFORM_REGISTER_URL: z.string().optional().default(""),
  TG_REGISTER_GUIDE_URL: z.string().optional().default("")
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse(env);
}
