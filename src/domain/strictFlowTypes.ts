import type { AppConfig } from "../config.js";
import type { A2CInviteCodeRecord, Conversation, MerchantCountryRecord, MerchantRecord, ScriptFlowRuntime } from "../repositories.js";
import type { ContextualIntentLabel, InternalIntentLabel, MessageAnalysis } from "./analyzer.js";

export const STRICT_FLOW_STEPS = [
  "first_greeting",
  "interest_screening",
  "project_intro",
  "registration_intent",
  "send_register_link",
  "wait_registration",
  "telegram_confirm",
  "telegram_download",
  "collect_telegram",
  "human_handoff",
  "ended"
] as const;

export type StrictFlowStep = (typeof STRICT_FLOW_STEPS)[number];

export interface StrictFlowInput {
  merchant: MerchantRecord;
  country: MerchantCountryRecord;
  conversation: Conversation;
  analysis: MessageAnalysis;
  customerText: string;
  inviteCode?: A2CInviteCodeRecord;
  config: AppConfig;
  teacherTelegramLink?: string;
  linkLoadFailureCount?: number;
  inferredIntent?: InternalIntentLabel;
  contextualIntent?: StrictContextualIntent;
  strictFlowEnabled?: boolean;
  scriptFlow?: ScriptFlowRuntime;
}

export interface StrictFlowReply {
  enabled: boolean;
  reply: string;
  replyParts?: string[];
  replyPurpose?: "await_customer_question" | "answer_customer_question";
  language: string;
  nextFlowStep: StrictFlowStep;
  stage: Conversation["stage"];
  needsInviteCode: boolean;
  fallback?: boolean;
  controlledQuestionType?: ControlledQuestionType;
  controlledQuestionFallback?: boolean;
  contextualIntent?: StrictContextualIntent;
  tutorialImageRequested?: boolean;
  handoffReason?: string;
  awaitingCustomerQuestion?: boolean;
}

export interface StrictContextualIntent {
  intent: ContextualIntentLabel;
  source: "rule" | "ai" | "none";
  answeredPreviousQuestion: boolean;
  isQuestion: boolean;
  isSubmission: boolean;
  shouldPause: boolean;
  questionType: ControlledQuestionType;
  nextAction: string;
  reason: string;
}

export type ControlledQuestionType =
  | "none"
  | "platform"
  | "chat"
  | "identity"
  | "trust"
  | "payment"
  | "investment"
  | "telegram"
  | "earning"
  | "complaint"
  | "help"
  | "job"
  | "repeat_greeting"
  | "hesitation"
  | "phone_reason"
  | "registration_field"
  | "link_open"
  | "next_step"
  | "sensitive"
  | "unknown";
