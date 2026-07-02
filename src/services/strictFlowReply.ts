import type { A2CClient } from "../clients/a2c.js";
import type { AppConfig } from "../config.js";
import type { StrictContextualIntent } from "../domain/strictFlow.js";
import type { InternalIntentLabel, MessageAnalysis } from "../domain/analyzer.js";
import type {
  Conversation,
  MerchantAgentProfileRecord,
  MerchantCountryRecord,
  MerchantRecord,
  Repositories,
  ScriptFlowRuntime
} from "../repositories.js";
import type { AiTasks } from "./aiTasks.js";
import type { A2CWebhookPayload } from "./inboundMessage.js";
import type { LearnedIntentDebugInfo } from "./aiConversationReply.js";
import { sendRegistrationTutorialImage } from "./registrationTutorialOutbound.js";
import { sendStrictFlowTextOutbound } from "./strictFlowTextOutbound.js";
import { buildStrictFlowTurn } from "./strictFlowTurnBuilder.js";

export interface StrictFlowReplyResult {
  handled: boolean;
  status: string;
  conversationId: string;
}

export interface GenerateStrictFlowReplyInput {
  repos: Repositories;
  ai: AiTasks;
  runtimeConfig: AppConfig;
  merchant: MerchantRecord;
  country: MerchantCountryRecord;
  conversation: Conversation;
  analysis: MessageAnalysis;
  customerText: string;
  agentProfile: MerchantAgentProfileRecord;
  a2c: A2CClient;
  data: A2CWebhookPayload["data"];
  payloadId: string;
  simulation: boolean;
  strictFlowEnabled: boolean;
  scriptFlow?: ScriptFlowRuntime;
  inferredIntent: InternalIntentLabel;
  contextualIntent: StrictContextualIntent;
  learnedIntent: LearnedIntentDebugInfo | null;
  history: Array<{ direction: string; content: string; intent: string; createdAt: string }>;
}

export async function generateAndRecordStrictFlowReply(input: GenerateStrictFlowReplyInput): Promise<StrictFlowReplyResult> {
  const {
    repos,
    ai,
    runtimeConfig,
    merchant,
    country,
    conversation,
    analysis,
    customerText,
    agentProfile,
    a2c,
    data,
    payloadId,
    simulation,
    strictFlowEnabled,
    scriptFlow,
    inferredIntent,
    contextualIntent,
    learnedIntent,
    history
  } = input;

  const flowTurn = buildStrictFlowTurn({
    repos,
    runtimeConfig,
    merchant,
    country,
    conversation,
    analysis,
    customerText,
    strictFlowEnabled,
    inferredIntent,
    contextualIntent,
    scriptFlow
  });
  const { strictReply, inviteCode } = flowTurn;

  if (!strictReply.enabled) {
    return { handled: false, status: "strict_flow_disabled", conversationId: conversation.id };
  }

  conversation.language = strictReply.language;
  conversation.stage = strictReply.stage;
  conversation.flowStep = strictReply.nextFlowStep;

  const { outbound } = await sendStrictFlowTextOutbound({
    repos,
    ai,
    runtimeConfig,
    a2c,
    conversation,
    strictReply,
    customerText,
    history,
    agentProfile,
    data,
    payloadId,
    simulation,
    strictFlowEnabled,
    learnedIntent,
    country,
    inviteCode
  });

  if (strictReply.tutorialImageRequested) {
    await sendRegistrationTutorialImage({
      repos,
      runtimeConfig,
      a2c,
      conversation,
      data,
      language: strictReply.language,
      tutorialImageUrl: runtimeConfig.REGISTRATION_TUTORIAL_IMAGE_URL,
      simulation
    });
  }

  repos.updateConversation(conversation);
  repos.upsertCustomerFromConversation(conversation);

  if (outbound.sendResult.a2cSendStatus === "simulated") {
    return {
      handled: true,
      status: outbound.inserted ? "strict_flow_simulated" : "strict_flow_simulation_not_recorded",
      conversationId: conversation.id
    };
  }
  return {
    handled: true,
    status: outbound.sendResult.a2cSendStatus === "sent" && outbound.inserted ? "strict_flow_replied" : "strict_flow_send_failed",
    conversationId: conversation.id
  };
}
