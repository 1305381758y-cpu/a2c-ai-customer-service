import { normalizeFlowStep } from "./strictFlowState.js";

export function normalizeFollowUpLanguage(language: string, fallback = "zh"): string {
  const normalized = (language || "").trim().toLowerCase();
  if (!normalized || normalized === "unknown") return fallback;
  if (normalized === "cn" || normalized === "zh" || normalized.startsWith("zh-")) return "zh";
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  if (normalized === "pt" || normalized.startsWith("pt-")) return "pt-BR";
  if (normalized === "es" || normalized.startsWith("es-")) return "es";
  return normalized;
}

export function buildStrictFlowFollowUp(flowStep: string, language: string): string {
  const step = normalizeFlowStep(flowStep);
  const replyLanguage = normalizeFollowUpLanguage(language);
  if (step === "interest_screening" || step === "registration_intent" || step === "project_intro") {
    if (replyLanguage === "en") return "Are you free to continue now? I can guide you step by step.";
    if (replyLanguage === "pt-BR") return "Você está livre para continuar agora? Posso orientar você passo a passo.";
    if (replyLanguage === "es") return "¿Tiene tiempo para continuar ahora? Puedo guiarle paso a paso.";
    return "您现在方便继续吗？我可以一步步带您完成。";
  }
  if (step === "wait_registration" || step === "send_register_link") {
    if (replyLanguage === "en") return "Which registration step are you on now? If anything is stuck, send me what you see and I will help.";
    if (replyLanguage === "pt-BR") return "Em qual etapa do cadastro você está agora? Se travar em alguma parte, me envie o que aparece e eu ajudo.";
    if (replyLanguage === "es") return "¿En qué etapa del registro está ahora? Si se atascó, envíeme lo que aparece en la pantalla y le ayudo.";
    return "您注册到哪一步了？如果卡住，把页面情况发我就行。";
  }
  if (step === "telegram_confirm" || step === "telegram_download" || step === "collect_telegram") {
    if (replyLanguage === "en") return "If Telegram is difficult to set up, tell me where you are stuck and I will guide you.";
    if (replyLanguage === "pt-BR") return "Se estiver difícil configurar o Telegram, me diga onde travou e eu oriento você.";
    if (replyLanguage === "es") return "Si tiene dificultades para configurar Telegram, dígame dónde se atascó y le guío.";
    return "Telegram 这一步如果不会弄，告诉我卡在哪里，我继续带您。";
  }
  if (replyLanguage === "en") return "I am here. Tell me when you are ready and I will continue from the current step.";
  if (replyLanguage === "pt-BR") return "Estou aqui. Quando estiver pronto, me avise e continuo pela etapa atual.";
  if (replyLanguage === "es") return "Estoy aquí. Cuando esté listo, avíseme y continuaré desde el paso actual.";
  return "我在的，您准备好了告诉我，我按当前步骤继续带您。";
}
