import type { StrictFlowStep } from "./strictFlowTypes.js";

export type NodeTurnSemantic =
  | "greeting"
  | "positive_confirmation"
  | "acknowledgement"
  | "registration_completed"
  | "negative_refusal"
  | "none";

export interface NodeTurnSemanticResult {
  semantic: NodeTurnSemantic;
  reason: string;
}

export function resolveNodeTurnSemantic(input: {
  step: StrictFlowStep | "";
  text: string;
  language: string;
  previousAssistantMessage?: string;
}): NodeTurnSemanticResult {
  const text = normalize(input.text);
  if (!text) return none();

  if (isGreeting(text)) {
    return { semantic: "greeting", reason: "customer sent a greeting without answering the node question" };
  }

  if (isRegistrationNode(input.step) && isPortugueseRefusal(text)) {
    return { semantic: "negative_refusal", reason: "Portuguese refusal in a registration node" };
  }

  if (input.step === "wait_registration" && isPortugueseRegistrationCompletion(text)) {
    return { semantic: "registration_completed", reason: "Portuguese completion shorthand in wait registration" };
  }

  if (isPortugueseAffirmativeShorthand(text, input.language)) {
    if (
      (input.step === "interest_screening" || input.step === "registration_intent") &&
      answersBinaryNodePrompt(input.step, input.previousAssistantMessage || "")
    ) {
      return {
        semantic: "positive_confirmation",
        reason: "Portuguese affirmative shorthand answers the current node question"
      };
    }
    if (input.step === "wait_registration") {
      return { semantic: "acknowledgement", reason: "Portuguese affirmative shorthand acknowledges registration instructions" };
    }
    if (input.step === "interest_screening" || input.step === "registration_intent") {
      return { semantic: "acknowledgement", reason: "Portuguese shorthand does not answer a current binary node question" };
    }
  }

  return none();
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s\u00a0]+/g, " ")
    .replace(/[.!?;,:。！？，；：]+$/g, "")
    .trim();
}

function isGreeting(text: string): boolean {
  return /^(?:o+i+|ola+|bom dia|boa tarde|boa noite|hi+|hello+|hey+|good morning|good afternoon|good evening|你好|您好|早上好|下午好|晚上好|hola+|buenos dias|buenas tardes|buenas noches)$/.test(text);
}

function isPortugueseAffirmativeShorthand(text: string, language: string): boolean {
  if (!language.toLowerCase().startsWith("pt")) return false;
  return /^(?:sim+|s{1,3})$/.test(text);
}

function isPortugueseRegistrationCompletion(text: string): boolean {
  return /^(?:fiz|ja fiz|fiz sim|feito|ja esta feito|acabei|consegui|pronto)$/.test(text);
}

function isPortugueseRefusal(text: string): boolean {
  return /^(?:nao preciso|nao precisar|nao quero|nao quero mais|nao vou fazer|deixa|deixa pra la|obrigad[oa],? nao|sem interesse)$/.test(text);
}

function isRegistrationNode(step: StrictFlowStep | ""): boolean {
  return step === "registration_intent" || step === "send_register_link" || step === "wait_registration";
}

function answersBinaryNodePrompt(step: StrictFlowStep | "", previousAssistantMessage: string): boolean {
  if (!previousAssistantMessage.trim()) return true;
  if (!/[?？]/.test(previousAssistantMessage)) return false;
  const previous = normalize(previousAssistantMessage);
  if (step === "interest_screening") return /(?:interesse|gostaria|procurando|quer)/.test(previous);
  return /(?:tempo livre|tem tempo|esta livre|disponivel|continuar|cadastro)/.test(previous);
}

function none(): NodeTurnSemanticResult {
  return { semantic: "none", reason: "no high-confidence node semantic" };
}
