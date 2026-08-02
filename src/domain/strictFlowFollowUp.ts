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
  if (step === "interest_screening") {
    if (replyLanguage === "en") return "Would you still like to learn about this online part-time work?";
    if (replyLanguage === "pt-BR") return "Você ainda gostaria de conhecer melhor este trabalho online de meio período?";
    if (replyLanguage === "es") return "¿Todavía le gustaría conocer mejor este trabajo en línea a tiempo parcial?";
    return "您还想继续了解这份线上兼职工作吗？";
  }
  if (step === "registration_intent" || step === "project_intro") {
    if (replyLanguage === "en") return "When you are ready, tell me and we can continue to the next step.";
    if (replyLanguage === "pt-BR") return "Quando estiver disponível, me avise e podemos continuar para a próxima etapa.";
    if (replyLanguage === "es") return "Cuando esté disponible, avíseme y podremos continuar con el siguiente paso.";
    return "您准备好后告诉我，我们再继续下一步。";
  }
  if (step === "wait_registration" || step === "send_register_link") {
    if (replyLanguage === "en") return "If you need help with any registration step, tell me what you see and I will help.";
    if (replyLanguage === "pt-BR") return "Se precisar de ajuda em alguma etapa do cadastro, me diga o que aparece e eu ajudo.";
    if (replyLanguage === "es") return "Si necesita ayuda con algún paso del registro, dígame qué aparece y le ayudaré.";
    return "注册过程中需要帮助的话，把页面情况告诉我就行。";
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
