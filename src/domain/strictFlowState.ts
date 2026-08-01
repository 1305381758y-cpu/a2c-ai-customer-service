import type { Conversation, ConversationMessageRecord } from "../repositories.js";
import { STRICT_FLOW_STEPS, type StrictFlowStep } from "./strictFlowTypes.js";

const flowStepSet = new Set<string>(STRICT_FLOW_STEPS);
const flowStepRank = new Map<StrictFlowStep, number>(STRICT_FLOW_STEPS.map((step, index) => [step, index]));

export function normalizeFlowStep(value: string): StrictFlowStep | "" {
  return flowStepSet.has(value) ? value as StrictFlowStep : "";
}

export function resolveStrictFlowStepFromState(
  conversation: Pick<Conversation, "flowStep" | "stage">,
  history: ConversationMessageRecord[] = []
): StrictFlowStep | "" {
  const stored = normalizeFlowStep(conversation.flowStep);
  const inferred = inferStrictFlowStepFromHistory(history);
  if (!stored) return inferred || stageToStrictFlowStep(conversation.stage);
  if (!inferred) return stored;
  if (stored === "first_greeting" && inferred !== "first_greeting") return inferred;
  const storedRank = flowStepRank.get(stored) ?? 0;
  const inferredRank = flowStepRank.get(inferred) ?? 0;
  return inferredRank > storedRank ? inferred : stored;
}

export function inferStrictFlowStepFromHistory(history: ConversationMessageRecord[]): StrictFlowStep | "" {
  for (const message of [...history].reverse()) {
    if (message.direction !== "outbound") continue;
    const sendStatus = String(message.rawPayload?.a2cSendStatus ?? "").trim().toLowerCase();
    // Failed outbound records are useful diagnostics, but they are not
    // evidence that the customer received a step. Letting them participate in
    // recovery makes a failed multipart introduction overwrite the committed
    // conversation state and replay on the customer's next message.
    if (sendStatus === "failed") continue;
    const replyPartCount = Number(message.rawPayload?.replyPartCount ?? 1);
    const replyPartIndex = Number(message.rawPayload?.replyPartIndex ?? 0);
    // A successful prefix of a multipart reply is not a committed turn. Only
    // the final delivered part may recover the turn's next state.
    if (replyPartCount > 1 && replyPartIndex < replyPartCount - 1) continue;
    const nextPayloadStep = normalizeFlowStep(String(message.rawPayload?.nextStrictFlowStep ?? ""));
    if (nextPayloadStep) return nextPayloadStep;
    const payloadStep = normalizeFlowStep(String(message.rawPayload?.strictFlowStep ?? ""));
    if (payloadStep) return payloadStep;
    const contentStep = inferStrictFlowStepFromContent(message.content);
    if (contentStep) return contentStep;
  }
  return "";
}

export function inferStrictFlowStepFromContent(content: string): StrictFlowStep | "" {
  const text = content.trim();
  if (!text) return "";
  if (/(是否正在寻找|是否正在找|寻找可以在线完成的工作|赚取额外收入|part-time online job|renda extra|trabalho online)/i.test(text)) {
    return "interest_screening";
  }
  if (/(简单介绍|每天可以赚取|提升产品销量|是否接受这份工作|briefly introduce|300 to 800|aumentar as vendas|300 a 800)/i.test(text)) {
    return "registration_intent";
  }
  if (/(准备好注册|先在我们的平台上注册|ready to register|pronto para se cadastrar)/i.test(text)) {
    return "registration_intent";
  }
  if (/(开户链接|注册链接|邀请码|registration link|invitation code|link de cadastro|código de convite)/i.test(text)) {
    return "wait_registration";
  }
  if (/(是否已完成注册|注册的手机号码|registered phone|telefone usado no cadastro)/i.test(text)) {
    return "wait_registration";
  }
  if (/(您有 Telegram|有 Telegram|Do you have the Telegram|Você tem o aplicativo Telegram)/i.test(text)) {
    return "telegram_confirm";
  }
  if (/(下载 Telegram|注册 Telegram|download Telegram|baixar o Telegram|criar o Telegram)/i.test(text)) {
    return "telegram_download";
  }
  if (/(@ 开头|@开头|Telegram 用户名|Telegram username|nome de usuário do Telegram)/i.test(text)) {
    return "collect_telegram";
  }
  return "";
}

export function stageToStrictFlowStep(stage: Conversation["stage"]): StrictFlowStep | "" {
  if (stage === "need_tg_register") return "telegram_confirm";
  if (stage === "need_phone_or_tg") return "wait_registration";
  if (stage === "ready_for_handoff") return "human_handoff";
  if (stage === "need_platform_register") return "";
  return "";
}

export function stageForFlowStep(step: StrictFlowStep, fallback: Conversation["stage"]): Conversation["stage"] {
  if (step === "telegram_confirm" || step === "telegram_download" || step === "collect_telegram") return "need_tg_register";
  if (step === "human_handoff" || step === "ended") return "ready_for_handoff";
  if (step === "wait_registration" || step === "send_register_link" || step === "registration_intent" || step === "project_intro" || step === "interest_screening") return "need_platform_register";
  return fallback;
}
