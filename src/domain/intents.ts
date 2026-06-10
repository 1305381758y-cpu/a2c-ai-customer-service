export const INTENT_LABELS = [
  "greeting",
  "ask_platform_register",
  "platform_register_done",
  "ask_tg_register",
  "provide_phone",
  "provide_telegram",
  "provide_phone_and_telegram",
  "ask_link",
  "ask_promotion",
  "trust_concern",
  "need_help",
  "human_request",
  "irrelevant_or_spam",
  "unknown"
] as const;

export type IntentLabel = (typeof INTENT_LABELS)[number];

export const STAGES = [
  "need_platform_register",
  "need_tg_register",
  "need_phone_or_tg",
  "ready_for_handoff"
] as const;

export type ConversationStage = (typeof STAGES)[number];

export function isIntentLabel(value: string): value is IntentLabel {
  return INTENT_LABELS.includes(value as IntentLabel);
}
