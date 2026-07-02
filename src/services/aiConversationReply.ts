import type { A2CClient } from "../clients/a2c.js";
import type { TelegramClient } from "../clients/telegram.js";
import type { AppConfig } from "../config.js";
import { shouldUseInviteForReply, suppressRegistrationDetailsForNonLinkStep } from "../domain/registrationPolicy.js";
import { rankSamples } from "../domain/sampleRetrieval.js";
import type { MessageAnalysis } from "../domain/analyzer.js";
import type { Conversation, CustomerMemoryRecord, MerchantAgentProfileRecord, MerchantCountryRecord, Repositories } from "../repositories.js";
import type { AiTasks } from "./aiTasks.js";
import { completeConversationGoal, isConversationGoalComplete } from "./conversationGoalCompletion.js";
import type { A2CWebhookPayload } from "./inboundMessage.js";
import { recordOutboundConversationMessage } from "./outboundConversationRecorder.js";

export interface LearnedIntentDebugInfo {
  id: number;
  suggestedIntent: string;
  displayName: string;
  score: number;
}

export interface AiConversationReplyResult {
  status: "reply_simulated" | "reply_simulation_not_recorded" | "replied" | "reply_send_failed" | "handoff" | "handoff_simulated";
  conversationId: string;
}

export async function generateAndRecordAiConversationReply(input: {
  repos: Repositories;
  ai: Pick<AiTasks, "generateReply">;
  runtimeConfig: AppConfig;
  conversation: Conversation;
  country: MerchantCountryRecord;
  analysis: MessageAnalysis;
  customerText: string;
  inboundMemory: CustomerMemoryRecord;
  agentProfile: MerchantAgentProfileRecord;
  a2c: Pick<A2CClient, "sendMessage">;
  telegram: Pick<TelegramClient, "sendHandoffMessage">;
  data: A2CWebhookPayload["data"];
  payloadId: string;
  simulation: boolean;
  strictFlowEnabled: boolean;
  learnedIntent: LearnedIntentDebugInfo | null;
  generateReview?: (conversationId: string, runtimeConfig: AppConfig) => Promise<unknown>;
}): Promise<AiConversationReplyResult> {
  const enabledSamples = input.repos.listTrainingSamples({ merchantId: input.conversation.merchantId, countryId: input.country.id, enabled: true });
  const knowledge = input.repos.listKnowledgeItems({ merchantId: input.conversation.merchantId, countryId: input.country.id, enabled: true });
  const trainingMaterials = input.repos.listTrainingMaterialSnippets(input.conversation.merchantId, 20, input.country.id);
  const shouldIncludeRegistrationDetails = shouldUseInviteForReply(input.country, input.conversation, input.analysis.intent, input.customerText);
  const inviteCode = shouldIncludeRegistrationDetails
    ? input.repos.reserveInviteCodeForConversation(input.conversation)
    : undefined;
  const samples = rankSamples(enabledSamples, {
    text: input.customerText,
    language: input.analysis.language,
    intent: input.analysis.intent,
    stage: input.analysis.stage
  });
  const history = input.repos.listConversationMessages(input.conversation.id, 20);
  const aiReply = await input.ai.generateReply(input.runtimeConfig, {
    customerText: input.customerText,
    conversation: input.conversation,
    history,
    samples,
    knowledge,
    trainingMaterials,
    memory: input.inboundMemory,
    country: input.country,
    inviteCode,
    agentProfile: input.agentProfile
  });
  if (!shouldIncludeRegistrationDetails) {
    aiReply.reply = suppressRegistrationDetailsForNonLinkStep(aiReply.reply, input.runtimeConfig, input.country, input.conversation, aiReply.language || input.conversation.language);
  }

  if (aiReply.extractedPhone && !input.conversation.extractedPhone) input.conversation.extractedPhone = aiReply.extractedPhone;
  if (aiReply.extractedTelegram && !input.conversation.extractedTelegram) input.conversation.extractedTelegram = aiReply.extractedTelegram;
  if (aiReply.extractedWhatsApp && !input.conversation.extractedWhatsApp) input.conversation.extractedWhatsApp = aiReply.extractedWhatsApp;
  if (aiReply.language) input.conversation.language = aiReply.language;
  if (aiReply.stage === "ready_for_handoff" || isConversationGoalComplete(input.conversation, input.country)) {
    return completeConversationGoal({
      repos: input.repos,
      runtimeConfig: input.runtimeConfig,
      conversation: input.conversation,
      data: input.data,
      language: aiReply.language || input.analysis.language,
      a2c: input.a2c,
      telegram: input.telegram,
      simulation: input.simulation,
      sendVerificationReply: true,
      generateReview: input.generateReview
    });
  }

  const outbound = await recordOutboundConversationMessage({
    repos: input.repos,
    runtimeConfig: input.runtimeConfig,
    a2c: input.a2c,
    conversation: input.conversation,
    simulation: input.simulation,
    payload: {
      to: input.data.from,
      senderPhoneNumber: input.data.to,
      type: "text",
      content: aiReply.reply
    },
    idPolicy: {
      simulatedPrefix: "simulated_reply",
      sentFallbackPrefix: "a2c_sent",
      failedPrefix: "send_failed",
      contextId: input.data.messageId || input.payloadId
    },
    message: {
      content: aiReply.reply,
      msgType: "text",
      language: aiReply.language || input.conversation.language,
      intent: "unknown",
      rawPayload: {
        replyMode: aiReply.fallback ? "fallback" : "ai",
        strictFlowEnabled: input.strictFlowEnabled,
        agentProfileName: input.agentProfile.agentName,
        learnedIntent: input.learnedIntent,
        samples: samples.map((sample) => sample.id),
        trainingMaterials: trainingMaterials.map((item) => item.id),
        aiFallback: Boolean(aiReply.fallback),
        aiError: aiReply.error || "",
        inviteCodeRequired: Boolean(input.country.requirePlatformAccount),
        inviteCodeMissing: Boolean(input.country.requirePlatformAccount && !inviteCode),
        assignedInviteCode: inviteCode ? {
          id: inviteCode.id,
          code: inviteCode.code,
          registerUrl: inviteCode.registerUrl,
          status: inviteCode.status
        } : null
      }
    },
    memory: {
      intent: "unknown",
      content: aiReply.reply,
      direction: "outbound"
    }
  });
  input.repos.updateConversation(input.conversation);
  input.repos.upsertCustomerFromConversation(input.conversation);

  if (outbound.sendResult.a2cSendStatus === "simulated") {
    return { status: outbound.inserted ? "reply_simulated" : "reply_simulation_not_recorded", conversationId: input.conversation.id };
  }
  return { status: outbound.sendResult.a2cSendStatus === "sent" && outbound.inserted ? "replied" : "reply_send_failed", conversationId: input.conversation.id };
}
