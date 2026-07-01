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
  AI_PROVIDER: z.enum(["minimax", "gemini", "deepseek"]).default("minimax"),
  MINIMAX_API_KEY: z.string().optional().default(""),
  MINIMAX_MODEL: z.string().default("MiniMax-M3"),
  MINIMAX_BASE_URL: z.string().default("https://api.minimax.io"),
  DEEPSEEK_API_KEY: z.string().optional().default(""),
  DEEPSEEK_MODEL: z.string().default("deepseek-chat"),
  DEEPSEEK_BASE_URL: z.string().default("https://api.deepseek.com"),
  GOOGLE_AI_API_KEY: z.string().optional().default(""),
  GOOGLE_AI_MODEL: z.string().default("gemini-2.5-flash"),
  TELEGRAM_BOT_TOKEN: z.string().optional().default(""),
  TELEGRAM_HANDOFF_CHAT_ID: z.string().optional().default(""),
  PLATFORM_REGISTER_URL: z.string().optional().default(""),
  TG_REGISTER_GUIDE_URL: z.string().optional().default(""),
  REGISTRATION_TUTORIAL_IMAGE_URL: z.string().optional().default(""),
  SESSION_SECRET: z.string().default("change-this-session-secret"),
  DEFAULT_ADMIN_EMAIL: z.string().default("admin@example.com"),
  DEFAULT_ADMIN_PASSWORD: z.string().default("Admin123456")
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse(env);
}
