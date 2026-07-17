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
  const configuredParts = input.strictReply.replyParts?.length ? input.strictReply.replyParts : [];
  const partRefinements: StrictFlowReplyTextRefinementResult[] = [];
  if (configuredParts.length) {
    // Translate/refine configured segments once and in order. Running an
    // additional joined refinement plus Promise.all caused four concurrent
    // provider calls for a three-part script, so later parts could hit a
    // provider limit and silently turn into a generic language fallback.
    for (const content of configuredParts) {
      partRefinements.push(await refineStrictFlowReplyText({
        ai: input.ai,
        runtimeConfig: input.runtimeConfig,
        strictReply: { ...input.strictReply, reply: content, replyParts: undefined },
        customerText: input.customerText,
        history: input.history,
        agentProfile: input.agentProfile,
        scriptFlow: input.scriptFlow
      }));
    }
  } else {
    partRefinements.push(await refineStrictFlowReplyText({
      ai: input.ai,
      runtimeConfig: input.runtimeConfig,
      strictReply: input.strictReply,
      customerText: input.customerText,
      history: input.history,
      agentProfile: input.agentProfile,
      scriptFlow: input.scriptFlow
    }));
  }
  const parts = partRefinements.map((item) => item.reply);
  const refinedReply = combinePartRefinements(partRefinements, parts);
  input.strictReply.reply = refinedReply.reply;
  const outbounds: OutboundConversationRecordResult[] = [];
  for (const [index, content] of parts.entries()) {
    const partRefinement = partRefinements[index] ?? refinedReply;
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
          naturalized: partRefinement.naturalized,
          languageGuard: partRefinement.languageGuard,
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

function combinePartRefinements(
  refinements: StrictFlowReplyTextRefinementResult[],
  parts: string[]
): StrictFlowReplyTextRefinementResult {
  if (refinements.length === 1) return refinements[0];
  const joined = parts.join("\n\n");
  const errors = refinements.map((item) => item.naturalized.error).filter(Boolean).join("；");
  const guardErrors = refinements.map((item) => item.languageGuard.error).filter(Boolean).join("；");
  const fallbackUsed = refinements.some((item) => item.languageGuard.fallbackUsed);
  const translated = refinements.some((item) => item.languageGuard.status === "translated");
  const skipped = refinements.every((item) => item.languageGuard.status === "skipped");
  return {
    reply: joined,
    naturalized: {
      reply: joined,
      used: refinements.some((item) => item.naturalized.used),
      error: errors || undefined
    },
    languageGuard: {
      reply: joined,
      targetLanguage: refinements[0]?.languageGuard.targetLanguage || "unknown",
      status: fallbackUsed ? "fallback" : translated ? "translated" : skipped ? "skipped" : "matched",
      attempts: refinements.reduce((total, item) => total + item.languageGuard.attempts, 0),
      fallbackUsed,
      error: guardErrors || undefined
    },
    duplicateAvoided: refinements.some((item) => item.duplicateAvoided),
    variantApplied: refinements.some((item) => item.variantApplied)
  };
}
