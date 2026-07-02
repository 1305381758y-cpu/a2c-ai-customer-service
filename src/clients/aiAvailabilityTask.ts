import type { AppConfig } from "../config.js";
import type { AiTextOptions, AiTextPart } from "./aiProviderTypes.js";

export interface AiAvailabilityRuntime {
  generateText(config: AppConfig, contents: string | AiTextPart[], options?: AiTextOptions): Promise<string>;
}

export async function checkAiAvailability(
  config: AppConfig,
  runtime: AiAvailabilityRuntime
): Promise<void> {
  await runtime.generateText(config, "Reply with OK only.");
}
