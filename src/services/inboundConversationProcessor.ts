import type { AppConfig } from "../config.js";
import type { Repositories } from "../repositories.js";
import { AiTasks } from "./aiTasks.js";
import type { A2CWebhookPayload, InboundConversationMessage } from "./inboundMessage.js";
import { InboundTurnPipeline } from "./inboundTurnPipeline.js";

export class InboundConversationProcessor {
  private readonly pipeline: InboundTurnPipeline;

  constructor(
    repos: Repositories,
    ai: AiTasks,
    config: AppConfig
  ) {
    this.pipeline = new InboundTurnPipeline({ repos, ai, config });
  }

  async handleInboundMessage(input: InboundConversationMessage): Promise<{ status: string; conversationId?: string }> {
    return this.process(input.payload, input.merchantId, { simulation: input.simulation });
  }

  async process(payload: A2CWebhookPayload, merchantId?: string, options: { simulation?: boolean } = {}): Promise<{ status: string; conversationId?: string }> {
    return this.pipeline.process(payload, merchantId, options);
  }
}
