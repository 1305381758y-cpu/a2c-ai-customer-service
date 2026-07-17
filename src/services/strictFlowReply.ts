import type { A2CClient } from "../clients/a2c.js";
import type { TelegramClient } from "../clients/telegram.js";
import type { AppConfig } from "../config.js";
import type { StrictContextualIntent } from "../domain/strictFlow.js";
import type { InternalIntentLabel, MessageAnalysis } from "../domain/analyzer.js";
import type { StrictFlowRuntimeEngine } from "../domain/strictFlowRuntime.js";
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
import { completeConversationGoal } from "./conversationGoalCompletion.js";
import { asksHowToOpenLink, reportsLinkLoadFailure } from "../domain/strictFlowPredicates.js";
import { strictFlowScriptLine } from "../domain/strictFlowScriptText.js";
import type { StrictFlowReply } from "../domain/strictFlowTypes.js";

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
  telegram: Pick<TelegramClient, "sendHandoffMessage">;
  data: A2CWebhookPayload["data"];
  payloadId: string;
  simulation: boolean;
  strictFlowEnabled: boolean;
  scriptFlow?: ScriptFlowRuntime;
  inferredIntent: InternalIntentLabel;
  contextualIntent: StrictContextualIntent;
  strictFlowRuntime?: StrictFlowRuntimeEngine;
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
    telegram,
    data,
    payloadId,
    simulation,
    strictFlowEnabled,
    scriptFlow,
    inferredIntent,
    contextualIntent,
    strictFlowRuntime,
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
    scriptFlow,
    strictFlowRuntime,
    linkLoadFailureCount: countLinkLoadFailures(history, customerText)
  });
  const inviteCode = flowTurn.inviteCode;
  const strictReply = guardPendingCustomerQuestionReply(flowTurn.strictReply);

  if (!strictReply.enabled) {
    return { handled: false, status: "strict_flow_disabled", conversationId: conversation.id };
  }

  conversation.language = strictReply.language;
  conversation.stage = strictReply.stage;
  conversation.flowStep = strictReply.nextFlowStep;
  if (typeof strictReply.awaitingCustomerQuestion === "boolean") {
    conversation.awaitingCustomerQuestion = strictReply.awaitingCustomerQuestion;
  }
  if (strictReply.flowHoldReason !== undefined) {
    conversation.flowHoldReason = strictReply.flowHoldReason;
  }

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
    scriptFlow,
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
      simulation,
      sourcePayloadId: payloadId
    });
  }

  if (strictReply.nextFlowStep === "human_handoff") {
    const handoff = await completeConversationGoal({
      repos,
      runtimeConfig,
      conversation,
      data,
      language: strictReply.language,
      a2c,
      telegram,
      simulation,
      sendVerificationReply: false,
      handoffReason: strictReply.handoffReason
    });
    return {
      handled: true,
      status: handoff.status === "handoff_simulated" ? "strict_flow_handoff_simulated" : "strict_flow_handoff",
      conversationId: conversation.id
    };
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

export function guardPendingCustomerQuestionReply(reply: StrictFlowReply): StrictFlowReply {
  if (!reply.awaitingCustomerQuestion) return reply;
  const leakedRegistrationPackage = /https?:\/\/|邀请码|邀請碼|注册步骤|註冊步驟|registration link|invitation code|register link|link de cadastro|código de convite|codigo de convite|enlace de registro|código de invitación/i.test(
    [reply.reply, ...(reply.replyParts ?? [])].join("\n")
  );
  const telegramStep = reply.nextFlowStep === "telegram_confirm" ||
    reply.nextFlowStep === "telegram_download" ||
    reply.nextFlowStep === "collect_telegram";
  return {
    ...reply,
    reply: leakedRegistrationPackage
      ? strictFlowScriptLine(telegramStep ? "ask_question_prompt_tg" : "ask_question_prompt", reply.language)
      : reply.reply,
    replyParts: undefined,
    needsInviteCode: false,
    tutorialImageRequested: false
  };
}

export function countLinkLoadFailures(
  history: Array<{ direction: string; content: string }>,
  customerText: string
): number {
  const normalizedCurrent = normalizeMessageContent(customerText);
  let count = 0;
  let currentAlreadyCounted = false;
  for (const message of history) {
    if (message.direction !== "inbound" || !isRegistrationLinkOpenFailure(message.content)) continue;
    count += 1;
    if (normalizeMessageContent(message.content) === normalizedCurrent) {
      currentAlreadyCounted = true;
    }
  }
  if (isRegistrationLinkOpenFailure(customerText) && !currentAlreadyCounted) {
    count += 1;
  }
  return count;
}

function isRegistrationLinkOpenFailure(value: string): boolean {
  return reportsLinkLoadFailure(value) || asksHowToOpenLink(value);
}

function normalizeMessageContent(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
