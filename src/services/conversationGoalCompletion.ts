import type { A2CClient } from "../clients/a2c.js";
import type { TelegramClient } from "../clients/telegram.js";
import type { AppConfig } from "../config.js";
import type { Conversation, Repositories } from "../repositories.js";
import type { A2CWebhookPayload } from "./inboundMessage.js";
import { buildHandoffMessage } from "./handoff.js";
import { recordOutboundConversationMessage } from "./outboundConversationRecorder.js";

export interface ConversationGoalCompletionResult {
  status: "handoff" | "handoff_simulated";
  conversationId: string;
}

export function isConversationGoalComplete(
  conversation: { extractedPhone: string; extractedTelegram: string; extractedWhatsApp: string },
  country: { requirePhone: boolean; requireTelegram: boolean; requireWhatsApp: boolean }
): boolean {
  if (country.requirePhone && !conversation.extractedPhone) return false;
  if (country.requireTelegram && !conversation.extractedTelegram) return false;
  if (country.requireWhatsApp && !conversation.extractedWhatsApp) return false;
  return country.requirePhone || country.requireTelegram || country.requireWhatsApp;
}

export async function completeConversationGoal(input: {
  repos: Repositories;
  runtimeConfig: AppConfig;
  conversation: Conversation;
  data: A2CWebhookPayload["data"];
  language: string;
  a2c: Pick<A2CClient, "sendMessage">;
  telegram: Pick<TelegramClient, "sendHandoffMessage">;
  simulation?: boolean;
  sendVerificationReply?: boolean;
  handoffReason?: string;
  generateReview?: (conversationId: string, runtimeConfig: AppConfig) => Promise<unknown>;
}): Promise<ConversationGoalCompletionResult> {
  const { repos, conversation, data, simulation = false } = input;
  conversation.stage = "ready_for_handoff";
  conversation.status = "human_handoff";
  repos.markInviteCodeUsedForConversation(conversation.id, conversation.merchantId);

  if (input.sendVerificationReply ?? true) {
    await sendVerificationReply(input);
  }
  if (!simulation) {
    await notifyHandoffOnce({
      repos,
      conversation,
      telegram: input.telegram,
      lastMessageId: data.messageId,
      lastMessageTime: new Date((data.timestamp || Date.now()) * 1000).toISOString(),
      handoffReason: input.handoffReason
    });
  }
  repos.updateConversation(conversation);
  repos.upsertCustomerFromConversation(conversation);
  await generateReviewSafe(input);
  return { status: simulation ? "handoff_simulated" : "handoff", conversationId: conversation.id };
}

async function sendVerificationReply(input: {
  repos: Repositories;
  runtimeConfig: AppConfig;
  conversation: Conversation;
  data: A2CWebhookPayload["data"];
  language: string;
  a2c: Pick<A2CClient, "sendMessage">;
  simulation?: boolean;
}): Promise<void> {
  const content = verificationReply(input.language);
  await recordOutboundConversationMessage({
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
      simulatedPrefix: "simulated_verify",
      sentFallbackPrefix: "a2c_verify",
      failedPrefix: "verify_failed",
      contextId: input.data.messageId
    },
    message: {
      content,
      msgType: "text",
      language: input.language,
      intent: "human_request",
      rawPayload: {
        replyMode: "fallback",
        systemFinalReply: true
      }
    },
    memory: {
      intent: "human_request",
      content,
      direction: "outbound"
    }
  });
}

async function notifyHandoffOnce(input: {
  repos: Repositories;
  conversation: Conversation;
  telegram: Pick<TelegramClient, "sendHandoffMessage">;
  lastMessageId: string;
  lastMessageTime: string;
  handoffReason?: string;
}): Promise<void> {
  const { repos, conversation } = input;
  if (conversation.handoffNotified) return;
  const history = repos.listConversationMessages(conversation.id, 8);
  const summary = history.map((item) => `${item.direction}: ${item.content}`).join("\n");
  const message = buildHandoffMessage({
    conversation,
    lastMessageId: input.lastMessageId,
    lastMessageTime: input.lastMessageTime,
    summary,
    handoffReason: input.handoffReason
  });
  try {
    await input.telegram.sendHandoffMessage(message);
    conversation.handoffNotified = 1;
    repos.insertHandoffEvent(conversation.id, message, true);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "unknown";
    repos.markTelegramBindingInvalid(conversation.merchantId, errorMessage);
    repos.insertHandoffEvent(conversation.id, message, false, errorMessage);
  }
}

async function generateReviewSafe(input: {
  conversation: Conversation;
  runtimeConfig: AppConfig;
  generateReview?: (conversationId: string, runtimeConfig: AppConfig) => Promise<unknown>;
}): Promise<void> {
  try {
    await input.generateReview?.(input.conversation.id, input.runtimeConfig);
  } catch (error) {
    console.warn("conversation review generation failed", error);
  }
}

function verificationReply(language: string): string {
  if (language === "en") return "We are verifying your information. Please wait a moment.";
  if (language === "pt-BR") return "Estamos verificando suas informações. Aguarde um momento.";
  if (language === "es") return "Estamos verificando su información. Espere un momento, por favor.";
  if (language === "ja") return "情報を確認しています。少々お待ちください。";
  if (language === "th") return "เรากำลังตรวจสอบข้อมูลของคุณ กรุณารอสักครู่";
  if (language === "vi") return "Chúng tôi đang xác minh thông tin của bạn. Vui lòng chờ một chút.";
  if (language === "ms") return "Kami sedang menyemak maklumat anda. Sila tunggu sebentar.";
  if (language === "id") return "Kami sedang memverifikasi informasi Anda. Mohon tunggu sebentar.";
  return "我们正在核实，请稍后。";
}
