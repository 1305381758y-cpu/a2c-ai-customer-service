import type { AppConfig } from "../config.js";
import type { Repositories } from "../repositories.js";
import type { ConversationEngineResult, ConversationProcessor } from "./conversationEngine.js";
import { FollowUpProcessor, type FollowUpProcessingResult } from "./followUpProcessor.js";
import type { InboundConversationMessage } from "./inboundMessage.js";
import { InboundConversationProcessor } from "./inboundConversationProcessor.js";
import { AiTasks } from "./aiTasks.js";

export interface InboundConversationHandler {
  handleInboundMessage(input: InboundConversationMessage): Promise<ConversationEngineResult>;
}

export interface DueFollowUpHandler {
  processDueFollowUps(limit?: number): Promise<FollowUpProcessingResult>;
}

export class ConversationApplication implements ConversationProcessor {
  constructor(
    private readonly inbound: InboundConversationHandler,
    private readonly followUps: DueFollowUpHandler
  ) {}

  handleInboundMessage(input: InboundConversationMessage): Promise<ConversationEngineResult> {
    return this.inbound.handleInboundMessage(input);
  }

  processDueFollowUps(limit?: number): Promise<FollowUpProcessingResult> {
    return this.followUps.processDueFollowUps(limit);
  }
}

export function createConversationApplication(repos: Repositories, config: AppConfig, ai = new AiTasks()): ConversationApplication {
  return new ConversationApplication(
    new InboundConversationProcessor(repos, ai, config),
    new FollowUpProcessor(repos, config)
  );
}
