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
  waitBetweenParts?: (ms: number) => Promise<void>;
}): Promise<StrictFlowTextOutboundResult> {
  const configuredParts = input.strictReply.replyParts?.length ? input.strictReply.replyParts : [];
  const partRefinements = configuredParts.length
    ? await refineConfiguredParts(input, configuredParts)
    : [await refineStrictFlowReplyText({
      ai: input.ai,
      runtimeConfig: input.runtimeConfig,
      strictReply: input.strictReply,
      customerText: input.customerText,
      history: input.history,
      agentProfile: input.agentProfile,
      scriptFlow: input.scriptFlow
    })];
  const preparedParts = removeSameTurnDuplicates(partRefinements);
  const parts = preparedParts.map((item) => item.reply);
  const activeRefinements = preparedParts.map((item) => item.refinement);
  const refinedReply = combinePartRefinements(activeRefinements, parts);
  input.strictReply.reply = refinedReply.reply;
  const outbounds: OutboundConversationRecordResult[] = [];
  for (const [index, content] of parts.entries()) {
    const partRefinement = activeRefinements[index] ?? refinedReply;
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
    if (index < parts.length - 1 && !input.simulation) {
      await (input.waitBetweenParts ?? delay)(1500);
    }
  }

  return {
    outbound: outbounds.at(-1)!,
    outbounds,
    refinedReply
  };
}

async function refineConfiguredParts(
  input: Parameters<typeof sendStrictFlowTextOutbound>[0],
  configuredParts: string[]
): Promise<StrictFlowReplyTextRefinementResult[]> {
  const taggedReply = configuredParts
    .map((content, index) => `[[A2C_SCRIPT_PART_${index + 1}]]\n${content}`)
    .join("\n\n");
  const batched = await refineStrictFlowReplyText({
    ai: input.ai,
    runtimeConfig: input.runtimeConfig,
    strictReply: {
      ...input.strictReply,
      reply: taggedReply,
      replyParts: undefined,
      controlledQuestionType: "none",
      controlledQuestionFallback: false,
      preserveConfiguredText: true
    },
    customerText: input.customerText,
    history: input.history,
    agentProfile: input.agentProfile,
    scriptFlow: input.scriptFlow
  });
  const parsedParts = parseTaggedParts(batched.reply, configuredParts.length);
  if (parsedParts) {
    return parsedParts.map((reply) => ({
      ...batched,
      reply,
      naturalized: { ...batched.naturalized, reply },
      languageGuard: { ...batched.languageGuard, reply }
    }));
  }

  // A provider can occasionally alter the part markers. Retry the original
  // segments one at a time with a small gap so a transient rate limit cannot
  // replace only the last configured segment with a generic flow fallback.
  const refinements: StrictFlowReplyTextRefinementResult[] = [];
  for (const [index, content] of configuredParts.entries()) {
    if (index > 0) await delay(350);
    refinements.push(await refineStrictFlowReplyText({
      ai: input.ai,
      runtimeConfig: input.runtimeConfig,
      strictReply: {
        ...input.strictReply,
        reply: content,
        replyParts: undefined,
        controlledQuestionType: "none",
        controlledQuestionFallback: false,
        preserveConfiguredText: true
      },
      customerText: input.customerText,
      history: input.history,
      agentProfile: input.agentProfile,
      scriptFlow: input.scriptFlow
    }));
  }
  return refinements;
}

function removeSameTurnDuplicates(
  refinements: StrictFlowReplyTextRefinementResult[]
): Array<{ reply: string; refinement: StrictFlowReplyTextRefinementResult }> {
  const results: Array<{ reply: string; refinement: StrictFlowReplyTextRefinementResult }> = [];
  const seenReplies = new Set<string>();
  const seenOpenings = new Set<string>();

  for (const refinement of refinements) {
    let reply = refinement.reply.trim();
    if (!reply) continue;
    const opening = firstSentence(reply);
    const normalizedOpening = normalizeComparableText(opening);
    if (opening && normalizedOpening && seenOpenings.has(normalizedOpening)) {
      const remainder = reply.slice(opening.length).replace(/^[\s\n,，;；:：.!?。！？-]+/, "").trim();
      if (remainder) reply = remainder;
    }

    const normalizedReply = normalizeComparableText(reply);
    if (!normalizedReply || seenReplies.has(normalizedReply)) continue;
    if (results.some((item) => similarity(normalizeComparableText(item.reply), normalizedReply) >= 0.94)) continue;

    seenReplies.add(normalizedReply);
    if (normalizedOpening) seenOpenings.add(normalizedOpening);
    results.push({
      reply,
      refinement: reply === refinement.reply ? refinement : {
        ...refinement,
        reply,
        naturalized: { ...refinement.naturalized, reply },
        languageGuard: { ...refinement.languageGuard, reply },
        duplicateAvoided: true
      }
    });
  }

  return results;
}

function firstSentence(value: string): string {
  const match = value.match(/^.*?(?:[。！？.!?](?=\s|$)|\n|$)/s);
  return match?.[0]?.trim() ?? "";
}

function normalizeComparableText(value: string): string {
  return value.toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, "").trim();
}

function similarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftPairs = bigrams(left);
  const rightPairs = bigrams(right);
  if (!leftPairs.size || !rightPairs.size) return 0;
  let intersection = 0;
  for (const pair of leftPairs) if (rightPairs.has(pair)) intersection += 1;
  return (2 * intersection) / (leftPairs.size + rightPairs.size);
}

function bigrams(value: string): Set<string> {
  if (value.length < 2) return new Set([value]);
  const result = new Set<string>();
  for (let index = 0; index < value.length - 1; index += 1) result.add(value.slice(index, index + 2));
  return result;
}

function parseTaggedParts(reply: string, expectedCount: number): string[] | null {
  const matches = [...reply.matchAll(/\[\[A2C_SCRIPT_PART_(\d+)\]\]\s*([\s\S]*?)(?=\[\[A2C_SCRIPT_PART_\d+\]\]|$)/gi)];
  if (matches.length !== expectedCount) return null;
  const ordered = matches
    .map((match) => ({ index: Number(match[1]), content: match[2].trim() }))
    .sort((left, right) => left.index - right.index);
  if (ordered.some((part, index) => part.index !== index + 1 || !part.content)) return null;
  return ordered.map((part) => part.content);
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
