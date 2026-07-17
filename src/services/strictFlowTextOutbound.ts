import type { A2CClient } from "../clients/a2c.js";
import type { AppConfig } from "../config.js";
import type { StrictFlowReply } from "../domain/strictFlow.js";
import type {
  A2CInviteCodeRecord,
  Conversation,
  MerchantAgentProfileRecord,
  MerchantCountryRecord,
  Repositories,
  ScriptFlowRuntime
} from "../repositories.js";
import type { LearnedIntentDebugInfo } from "./aiConversationReply.js";
import type { AiTasks } from "./aiTasks.js";
import type { A2CWebhookPayload } from "./inboundMessage.js";
import { recordOutboundConversationMessage, type OutboundConversationRecordResult } from "./outboundConversationRecorder.js";
import { buildStrictFlowOutboundRawPayload } from "./strictFlowOutboundPayload.js";
import { refineStrictFlowReplyText, type StrictFlowReplyTextRefinementResult } from "./strictFlowReplyTextRefinement.js";

export interface StrictFlowTextOutboundResult {
  outbound: OutboundConversationRecordResult;
  outbounds: OutboundConversationRecordResult[];
  refinedReply: StrictFlowReplyTextRefinementResult;
}

export async function sendStrictFlowTextOutbound(input: {
  repos: Repositories;
  ai: AiTasks;
  runtimeConfig: AppConfig;
  a2c: A2CClient;
  conversation: Conversation;
  strictReply: StrictFlowReply;
  customerText: string;
  history: Array<{ direction: string; content: string; intent: string; createdAt: string }>;
  agentProfile: MerchantAgentProfileRecord;
  data: A2CWebhookPayload["data"];
  payloadId: string;
  simulation: boolean;
  strictFlowEnabled: boolean;
  scriptFlow?: ScriptFlowRuntime;
  learnedIntent: LearnedIntentDebugInfo | null;
  country: MerchantCountryRecord;
  inviteCode?: A2CInviteCodeRecord;
}): Promise<StrictFlowTextOutboundResult> {
  const refinedReply = await refineStrictFlowReplyText({
    ai: input.ai,
    runtimeConfig: input.runtimeConfig,
    strictReply: input.strictReply,
    customerText: input.customerText,
    history: input.history,
    agentProfile: input.agentProfile,
    scriptFlow: input.scriptFlow
  });
  input.strictReply.reply = refinedReply.reply;
  const configuredParts = input.strictReply.replyParts?.length ? input.strictReply.replyParts : [];
  const parts = configuredParts.length
    ? await Promise.all(configuredParts.map(async (content) => {
      // Guard each configured message independently. A single refinement of
      // the joined reply cannot prevent one segment from falling back to the
      // wrong language before it is sent.
      const partRefined = await refineStrictFlowReplyText({
        ai: input.ai,
        runtimeConfig: input.runtimeConfig,
        strictReply: { ...input.strictReply, reply: content, replyParts: undefined },
        customerText: input.customerText,
        history: input.history,
        agentProfile: input.agentProfile,
        scriptFlow: input.scriptFlow
      });
      return partRefined.reply;
    }))
    : [refinedReply.reply];
  const outbounds: OutboundConversationRecordResult[] = [];
  for (const [index, content] of parts.entries()) {
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
        content
      },
      idPolicy: {
        simulatedPrefix: "simulated_strict",
        sentFallbackPrefix: "a2c_strict",
        failedPrefix: "strict_send_failed",
        contextId: `${input.data.messageId || input.payloadId}:${index + 1}`
      },
      message: {
        content,
        msgType: "text",
        language: input.strictReply.language,
        intent: "unknown",
        rawPayload: buildStrictFlowOutboundRawPayload({
          strictReply: input.strictReply,
          strictFlowEnabled: input.strictFlowEnabled,
          agentProfile: input.agentProfile,
          learnedIntent: input.learnedIntent,
          naturalized: refinedReply.naturalized,
          languageGuard: refinedReply.languageGuard,
          country: input.country,
          scriptFlow: input.scriptFlow,
          inviteCode: input.inviteCode,
          replyPartIndex: index,
          replyPartCount: parts.length
        })
      },
      memory: {
        intent: "unknown",
        content,
        direction: "outbound"
      }
    });
    outbounds.push(outbound);
    if (index < parts.length - 1) await new Promise((resolve) => setTimeout(resolve, 120));
  }

  return {
    outbound: outbounds.at(-1)!,
    outbounds,
    refinedReply
  };
}
