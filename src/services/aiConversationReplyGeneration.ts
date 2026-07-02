import type { AiReply } from "../clients/aiReplyTypes.js";
import type { AppConfig } from "../config.js";
import { suppressRegistrationDetailsForNonLinkStep } from "../domain/registrationPolicy.js";
import type { Conversation, MerchantCountryRecord } from "../repositories.js";
import type { AiTasks } from "./aiTasks.js";
import type { AiConversationReplyContext } from "./aiConversationReplyContext.js";

export async function generateAiConversationReplyDraft(input: {
  ai: Pick<AiTasks, "generateReply">;
  runtimeConfig: AppConfig;
  conversation: Conversation;
  country: MerchantCountryRecord;
  replyContext: AiConversationReplyContext;
}): Promise<AiReply> {
  const aiReply = await input.ai.generateReply(input.runtimeConfig, input.replyContext.replyInput);
  if (!input.replyContext.shouldIncludeRegistrationDetails) {
    aiReply.reply = suppressRegistrationDetailsForNonLinkStep(
      aiReply.reply,
      input.runtimeConfig,
      input.country,
      input.conversation,
      aiReply.language || input.conversation.language
    );
  }
  return aiReply;
}
