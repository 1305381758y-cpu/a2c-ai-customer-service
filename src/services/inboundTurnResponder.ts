import type { A2CClient } from "../clients/a2c.js";
import type { TelegramClient } from "../clients/telegram.js";
import type { AppConfig } from "../config.js";
import type { MessageAnalysis } from "../domain/analyzer.js";
import type { StrictContextualIntent } from "../domain/strictFlow.js";
import type {
  Conversation,
  CustomerMemoryRecord,
  MerchantAgentProfileRecord,
  MerchantConfigRecord,
  MerchantCountryRecord,
  MerchantRecord,
  Repositories,
  ScriptFlowRuntime
} from "../repositories.js";
import { generateAndRecordAiConversationReply, type AiConversationReplyResult, type LearnedIntentDebugInfo } from "./aiConversationReply.js";
import type { AiTasks } from "./aiTasks.js";
import { generateConversationReview } from "./conversationReview.js";
import { completeConversationGoal, isConversationGoalComplete, type ConversationGoalCompletionResult } from "./conversationGoalCompletion.js";
import type { A2CWebhookPayload } from "./inboundMessage.js";
import { generateAndRecordStrictFlowReply, type StrictFlowReplyResult } from "./strictFlowReply.js";
import type { InternalIntentLabel } from "../domain/analyzer.js";

export type InboundTurnResponseResult =
  | { status: "already_handoff" | "auto_reply_disabled"; conversationId: string }
  | ConversationGoalCompletionResult
  | AiConversationReplyResult
  | { status: StrictFlowReplyResult["status"]; conversationId: string };

type StrictFlowHandler = typeof generateAndRecordStrictFlowReply;
type AiReplyHandler = typeof generateAndRecordAiConversationReply;

export async function respondToInboundTurn(
  input: {
    repos: Repositories;
    ai: AiTasks;
    runtimeConfig: AppConfig;
    merchant: MerchantRecord;
    merchantConfig: MerchantConfigRecord;
    country: MerchantCountryRecord;
    conversation: Conversation;
    analysis: MessageAnalysis;
    customerTextForAi: string;
    inboundMemory: CustomerMemoryRecord;
    agentProfile: MerchantAgentProfileRecord;
    a2c: A2CClient;
    telegram: Pick<TelegramClient, "sendHandoffMessage">;
    data: A2CWebhookPayload["data"];
    payloadId: string;
    simulation: boolean;
    strictFlowEnabled: boolean;
    scriptFlow?: ScriptFlowRuntime;
    inferredIntent: InternalIntentLabel;
    contextualIntent: StrictContextualIntent;
    learnedIntentDebug: LearnedIntentDebugInfo | null;
    historyForIntent: Parameters<StrictFlowHandler>[0]["history"];
  },
  handlers: {
    strictFlowReply?: StrictFlowHandler;
    aiReply?: AiReplyHandler;
  } = {}
): Promise<InboundTurnResponseResult> {
  if (input.conversation.status === "human_handoff") {
    input.repos.updateConversation(input.conversation);
    input.repos.upsertCustomerFromConversation(input.conversation);
    return { status: "already_handoff", conversationId: input.conversation.id };
  }

  if (isConversationGoalComplete(input.conversation, input.country)) {
    return completeConversationGoal({
      repos: input.repos,
      runtimeConfig: input.runtimeConfig,
      conversation: input.conversation,
      data: input.data,
      language: input.analysis.language,
      a2c: input.a2c,
      telegram: input.telegram,
      simulation: input.simulation,
      sendVerificationReply: input.merchantConfig.smartReplyEnabled || input.simulation,
      generateReview: (conversationId, config) => generateConversationReview(input.repos, config, conversationId)
    });
  }

  if (!input.merchantConfig.smartReplyEnabled && !input.simulation) {
    input.repos.updateConversation(input.conversation);
    input.repos.upsertCustomerFromConversation(input.conversation);
    return { status: "auto_reply_disabled", conversationId: input.conversation.id };
  }

  if (!shouldBypassStrictFlowForNaturalReply(input.customerTextForAi, input.conversation)) {
    const strictReply = await (handlers.strictFlowReply || generateAndRecordStrictFlowReply)({
      repos: input.repos,
      ai: input.ai,
      runtimeConfig: input.runtimeConfig,
      merchant: input.merchant,
      country: input.country,
      conversation: input.conversation,
      analysis: input.analysis,
      customerText: input.customerTextForAi,
      agentProfile: input.agentProfile,
      a2c: input.a2c,
      telegram: input.telegram,
      data: input.data,
      payloadId: input.payloadId,
      simulation: input.simulation,
      strictFlowEnabled: input.strictFlowEnabled,
      scriptFlow: input.scriptFlow,
      inferredIntent: input.inferredIntent,
      contextualIntent: input.contextualIntent,
      learnedIntent: input.learnedIntentDebug,
      history: input.historyForIntent
    });
    if (strictReply.handled) {
      return { status: strictReply.status, conversationId: strictReply.conversationId };
    }
    // Once strict flow is enabled, an unhandled result must not fall through
    // to the unrestricted reply path. That would let the system template or
    // ordinary AI decide a customer-visible next step.
    if (input.strictFlowEnabled) {
      input.repos.updateConversation(input.conversation);
      input.repos.upsertCustomerFromConversation(input.conversation);
      return { status: strictReply.status, conversationId: strictReply.conversationId };
    }
  }

  return (handlers.aiReply || generateAndRecordAiConversationReply)({
    repos: input.repos,
    ai: input.ai,
    runtimeConfig: input.runtimeConfig,
    conversation: input.conversation,
    country: input.country,
    analysis: input.analysis,
    customerText: input.customerTextForAi,
    inboundMemory: input.inboundMemory,
    agentProfile: input.agentProfile,
    a2c: input.a2c,
    telegram: input.telegram,
    data: input.data,
    payloadId: input.payloadId,
    simulation: input.simulation,
    strictFlowEnabled: input.strictFlowEnabled,
    learnedIntent: input.learnedIntentDebug,
    generateReview: (conversationId, config) => generateConversationReview(input.repos, config, conversationId)
  });
}

export function shouldBypassStrictFlowForNaturalReply(
  customerText: string,
  conversation: { flowStep?: string; stage?: string }
): boolean {
  void customerText;
  void conversation;
  return false;
}
