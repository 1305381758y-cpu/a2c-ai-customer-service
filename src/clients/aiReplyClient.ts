import type { AppConfig } from "../config.js";
import { generateConversationReply } from "./aiConversationReplyTask.js";
import { generateAiText } from "./aiProvider.js";
import type { AiReply, ReplyInput } from "./aiReplyTypes.js";

export type { AiReply, ReplyInput } from "./aiReplyTypes.js";

export class AiReplyClient {
  constructor(private readonly config: AppConfig) {}

  async generateReply(input: ReplyInput): Promise<AiReply> {
    return generateConversationReply(this.config, input, {
      generateText: generateAiText
    });
  }
}
