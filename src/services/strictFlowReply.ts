import type { A2CClient } from "../clients/a2c.js";
import type { AppConfig } from "../config.js";
import { strictFlowNeedsInviteCode, type StrictContextualIntent } from "../domain/strictFlow.js";
import { nextStrictFlowTurn } from "../domain/strictFlowRuntime.js";
import type { InternalIntentLabel, MessageAnalysis } from "../domain/analyzer.js";
import type {
  Conversation,
  MerchantAgentProfileRecord,
  MerchantCountryRecord,
  MerchantRecord,
  Repositories,
  ScriptFlowRuntime
} from "../repositories.js";
import { ensureReplyCustomerLanguage, naturalizeStrictReply } from "./replyLanguage.js";
import { recordOutboundConversationMessage } from "./outboundConversationRecorder.js";
import type { AiTasks } from "./aiTasks.js";
import type { A2CWebhookPayload } from "./inboundMessage.js";
import type { LearnedIntentDebugInfo } from "./aiConversationReply.js";
import { sendRegistrationTutorialImage } from "./registrationTutorialOutbound.js";
import { buildStrictFlowOutboundRawPayload } from "./strictFlowOutboundPayload.js";

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

  const needsInviteCode = strictFlowNeedsInviteCode({
    merchant,
    country,
    conversation,
    analysis,
    customerText,
    strictFlowEnabled,
    inferredIntent
  });
  const inviteCode = needsInviteCode
    ? repos.reserveInviteCodeForConversation(conversation)
    : undefined;
  const strictReply = nextStrictFlowTurn({
    merchant,
    country,
    conversation,
    analysis,
    customerText,
    inviteCode,
    config: runtimeConfig,
    inferredIntent,
    contextualIntent,
    strictFlowEnabled,
    scriptFlow
  });

  if (!strictReply.enabled) {
    return { handled: false, status: "strict_flow_disabled", conversationId: conversation.id };
  }

  conversation.language = strictReply.language;
  conversation.stage = strictReply.stage;
  conversation.flowStep = strictReply.nextFlowStep;

  const naturalized = await naturalizeStrictReply(ai, runtimeConfig, {
    customerText,
    draftReply: strictReply.reply,
    language: strictReply.language,
    flowStep: strictReply.nextFlowStep,
    questionType: strictReply.controlledQuestionType || "none",
    history,
    allowLinkOrInvite: strictReply.needsInviteCode,
    agentProfile
  });
  strictReply.reply = naturalized.reply;

  const languageGuard = await ensureReplyCustomerLanguage(runtimeConfig, {
    reply: strictReply.reply,
    targetLanguage: strictReply.language,
    flowStep: strictReply.nextFlowStep,
    allowLinkOrInvite: strictReply.needsInviteCode
  });
  strictReply.reply = languageGuard.reply;

  const outbound = await recordOutboundConversationMessage({
    repos,
    runtimeConfig,
    a2c,
    conversation,
    simulation,
    payload: {
      to: data.from,
      senderPhoneNumber: data.to,
      type: "text",
      content: strictReply.reply
    },
    idPolicy: {
      simulatedPrefix: "simulated_strict",
      sentFallbackPrefix: "a2c_strict",
      failedPrefix: "strict_send_failed",
      contextId: data.messageId || payloadId
    },
    message: {
      content: strictReply.reply,
      msgType: "text",
      language: strictReply.language,
      intent: "unknown",
      rawPayload: buildStrictFlowOutboundRawPayload({
        strictReply,
        strictFlowEnabled,
        agentProfile,
        learnedIntent,
        naturalized,
        languageGuard,
        country,
        inviteCode
      })
    },
    memory: {
      intent: "unknown",
      content: strictReply.reply,
      direction: "outbound"
    }
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
