import type { ConversationMessageRecord } from "../repositories.js";
import { type ContextualIntentLabel } from "./analyzer.js";
import {
  asksAboutJob,
  asksCustomerCorrection,
  asksEarningConcern,
  asksForOperationHelp,
  asksGenericQuestionPermission,
  asksInvestmentConcern,
  asksPaymentConcern,
  asksRegistrationFieldQuestion,
  asksSensitiveInfo,
  asksTelegramExplanation,
  asksTelegramUsernameHelp,
  asksToAnswerPreviousQuestion,
  asksTrustConcern,
  complainsAboutReply,
  contextualQuestionType,
  hasIncompleteRegistrationPhone,
  isAcknowledgement,
  isContextualShortReply,
  isRegistrationDoneConfirmation,
  isRegistrationInProgress,
  isExplicitRefusal,
  isPositive,
  lastAssistantContent,
  looksLikeQuestion,
  mapInternalToContextual,
  saysContextualNo,
  saysNotAvailable,
  saysNoTelegram,
  saysNotRegistered,
  saysTelegramInstalled,
  saysTelegramUsernameMissing
} from "./strictFlowPredicates.js";
import { normalizeFlowStep } from "./strictFlowState.js";
import type { StrictContextualIntent, StrictFlowInput } from "./strictFlowTypes.js";

export function buildRuleContextualIntent(
  input: Pick<StrictFlowInput, "conversation" | "analysis" | "customerText" | "inferredIntent">,
  history: Array<Pick<ConversationMessageRecord, "direction" | "content">> = []
): StrictContextualIntent {
  const step = normalizeFlowStep(input.conversation.flowStep);
  const text = input.customerText.trim();
  const previousAssistantMessage = lastAssistantContent(history);
  const previousCustomerMessage = [...history].reverse().find((message) => message.direction === "inbound")?.content ?? "";
  const base = (intent: ContextualIntentLabel, overrides: Partial<StrictContextualIntent> = {}): StrictContextualIntent => ({
    intent,
    source: "rule",
    answeredPreviousQuestion: Boolean(previousAssistantMessage && isContextualShortReply(text)),
    isQuestion: looksLikeQuestion(text),
    isSubmission: intent === "phone_submission" || intent === "telegram_submission",
    shouldPause: Boolean(input.conversation.awaitingCustomerQuestion) || intent === "negative_refusal" || intent === "not_available",
    questionType: contextualQuestionType(intent),
    nextAction: "",
    reason: "",
    ...overrides
  });

  if (!text) return base("unknown", { source: "none" });
  if (step === "wait_registration" && hasIncompleteRegistrationPhone(text)) {
    return base("incomplete_phone", { nextAction: "need_complete_phone", reason: "registration done with incomplete phone" });
  }
  // A Telegram explanation question must stay in the current node even if a
  // generic classifier incorrectly labels it as a Telegram submission.
  if ((step === "telegram_confirm" || step === "telegram_download" || step === "collect_telegram") && asksTelegramExplanation(text)) {
    return base("ask_tg_register", {
      answeredPreviousQuestion: Boolean(previousAssistantMessage),
      isQuestion: true,
      shouldPause: false,
      nextAction: "answer Telegram question and keep current step",
      reason: "Telegram explanation question"
    });
  }
  if (input.analysis.telegram) return base("telegram_submission", { nextAction: "save telegram and check handoff", reason: "telegram detected" });
  if (input.analysis.phone) return base("phone_submission", { nextAction: "save phone and continue telegram step", reason: "phone detected" });
  if (asksCustomerCorrection(text)) {
    return base("complaint", {
      isQuestion: true,
      shouldPause: true,
      nextAction: "listen to the customer question before continuing",
      reason: "customer corrects the assistant and is still waiting to ask"
    });
  }
  if (asksGenericQuestionPermission(text)) {
    return base("chat", {
      isQuestion: true,
      shouldPause: true,
      nextAction: "wait for the customer to state the question",
      reason: "customer asks to ask a question before continuing"
    });
  }

  if ((step === "telegram_confirm" || step === "telegram_download") && (saysContextualNo(text) || saysNoTelegram(text))) {
    return base("no_telegram", { answeredPreviousQuestion: true, nextAction: "guide telegram download", reason: "short no after telegram question" });
  }
  if (step === "collect_telegram" && saysTelegramUsernameMissing(text)) {
    return base("telegram_username_help", { answeredPreviousQuestion: true, nextAction: "guide telegram username setup", reason: "missing telegram username after username request" });
  }
  if ((step === "telegram_confirm" || step === "telegram_download" || step === "collect_telegram") && saysNotRegistered(text)) {
    return base("not_registered", { answeredPreviousQuestion: true, shouldPause: false, nextAction: "return_to_wait_registration", reason: "customer says registration is not complete" });
  }
  if ((step === "telegram_confirm" || step === "telegram_download" || step === "collect_telegram") && asksTelegramUsernameHelp(text)) {
    return base("telegram_username_help", { answeredPreviousQuestion: Boolean(previousAssistantMessage), nextAction: "guide telegram username setup", reason: "telegram username help" });
  }
  if (step === "telegram_download" && saysTelegramInstalled(text)) {
    return base("telegram_installed", { answeredPreviousQuestion: true, nextAction: "collect telegram username", reason: "telegram installed" });
  }
  if (step === "wait_registration" && saysNotRegistered(text)) {
    return base("not_registered", { answeredPreviousQuestion: true, shouldPause: false, nextAction: "help registration", reason: "not registered yet" });
  }
  if (step === "wait_registration" && isRegistrationDoneConfirmation(text)) {
    return base("platform_register_done", {
      answeredPreviousQuestion: true,
      shouldPause: false,
      nextAction: "ask for registered phone",
      reason: "customer explicitly confirmed platform registration"
    });
  }
  if (step === "wait_registration" && isRegistrationInProgress(text)) {
    return base("acknowledgement", {
      answeredPreviousQuestion: true,
      shouldPause: false,
      nextAction: "wait for registration to finish without asking for phone",
      reason: "customer is still registering or asks not to be rushed"
    });
  }
  if (step === "wait_registration" && asksToAnswerPreviousQuestion(text)) {
    return base("complaint", { nextAction: "answer previous registration question", reason: "asked to answer previous question" });
  }
  if ((step === "wait_registration" || step === "send_register_link") && asksRegistrationFieldQuestion(text)) {
    return base("registration_field_question", { nextAction: "answer registration field question", reason: "registration field question" });
  }
  if (step === "registration_intent" && saysNotAvailable(text)) {
    return base("not_available", { answeredPreviousQuestion: true, nextAction: "pause politely", reason: "not available now" });
  }
  // A short acknowledgement immediately after a temporary unavailability
  // response means "understood", not "I am available now". Keep the flow
  // paused until the customer explicitly says they are ready.
  if (step === "registration_intent" && isAcknowledgement(text) && saysNotAvailable(previousCustomerMessage)) {
    return base("acknowledgement", { answeredPreviousQuestion: true, shouldPause: true, nextAction: "wait until customer says ready", reason: "acknowledgement after temporary unavailability" });
  }
  if ((step === "telegram_download" || step === "collect_telegram") && isAcknowledgement(text)) {
    return base("acknowledgement", { answeredPreviousQuestion: true, shouldPause: false, nextAction: "wait for telegram username", reason: "acknowledged current telegram step" });
  }
  if (step === "wait_registration" && isAcknowledgement(text)) {
    return base("acknowledgement", { answeredPreviousQuestion: true, shouldPause: false, nextAction: "wait_registration_ack", reason: "acknowledged registration instructions" });
  }

  // High-confidence customer concerns must win over a loose AI label such as
  // positive_confirmation. A question like "will I need to recharge?" is not
  // an approval to continue the flow.
  if (input.analysis.intent === "trust_concern" || asksTrustConcern(text)) return base("trust_concern", { reason: "trust concern" });
  if (asksInvestmentConcern(text)) return base("investment_concern", { reason: "investment concern" });
  if (asksPaymentConcern(text)) return base("payment_concern", { reason: "payment concern" });
  if (asksEarningConcern(text)) return base("earning_concern", { reason: "earning concern" });
  if (input.inferredIntent && input.inferredIntent !== "unknown") {
    return base(mapInternalToContextual(input.inferredIntent), { source: "rule", reason: "internal intent" });
  }
  if (asksTelegramExplanation(text)) return base("ask_tg_register", { reason: "telegram question" });
  if (asksForOperationHelp(text)) return base("workflow_question", { reason: "operation help" });
  if (asksAboutJob(text)) return base("job_question", { reason: "job question" });
  if (complainsAboutReply(text)) return base("complaint", { reason: "complaint" });
  if (asksSensitiveInfo(text)) return base("sensitive_request", { reason: "sensitive request" });
  if (isPositive(text, input.analysis.intent, input.inferredIntent)) return base("positive_confirmation", { answeredPreviousQuestion: true, reason: "positive confirmation" });
  if (isExplicitRefusal(text)) return base("negative_refusal", { answeredPreviousQuestion: true, reason: "explicit refusal" });
  if (looksLikeQuestion(text)) return base("unknown_question", { reason: "unclassified question" });
  return base("unknown", { source: "none" });
}
