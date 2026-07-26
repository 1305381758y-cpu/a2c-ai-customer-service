import {
  asksAboutJob,
  asksAboutPlatform,
  asksEarningConcern,
  asksForOperationHelp,
  asksGenericQuestionPermission,
  asksHowToOpenLink,
  asksInvestmentConcern,
  asksNextStep,
  asksPaymentConcern,
  asksRegistrationFieldQuestion,
  asksSensitiveInfo,
  asksServiceIdentity,
  asksTelegramExplanation,
  asksWhetherTelegramOptional,
  asksWhyTelegramRequired,
  asksToAnswerPreviousQuestion,
  asksToChat,
  asksTrustConcern,
  asksWhyPhone,
  complainsAboutReply,
  isExplicitRefusal,
  isAffirmativeJobSeekingStatement,
  isHesitant,
  isRepeatGreeting,
  looksLikeQuestion,
  reportsLinkLoadFailure
} from "./strictFlowPredicates.js";
import { joinReplyParts } from "./strictFlowReplyText.js";
import type { ControlledQuestionType, StrictFlowInput, StrictFlowStep } from "./strictFlowTypes.js";

export type StrictFlowLineResolver = (key: string, language: string) => string;

export interface ControlledQuestionAnswer {
  content: string;
  pauseFlow?: boolean;
  type: ControlledQuestionType;
  cautiousFallback?: boolean;
}

export function controlledQuestionAnswer(
  input: StrictFlowInput,
  step: StrictFlowStep | "",
  text: string,
  language: string,
  line: StrictFlowLineResolver,
  intent = "",
  forcedLine = ""
): ControlledQuestionAnswer | null {
  if (!step) return null;
  const normalized = text.trim();
  if (!normalized) return null;
  if (isAffirmativeJobSeekingStatement(normalized)) return null;
  if (asksGenericQuestionPermission(normalized)) {
    const key = step === "telegram_confirm" || step === "telegram_download" || step === "collect_telegram"
      ? "ask_question_prompt_tg"
      : "ask_question_prompt";
    return { content: line(key, language), pauseFlow: true, type: "chat" };
  }
  if (input.contextualIntent?.intent === "not_registered") {
    return { content: line("not_registered_ack", language), type: "help" };
  }
  if (input.contextualIntent?.intent === "acknowledgement" && (step === "telegram_download" || step === "collect_telegram")) {
    return { content: line("collect_telegram_wait", language), type: "telegram" };
  }
  if (isExplicitRefusal(normalized)) {
    return { content: line("refusal_ack", language), pauseFlow: true, type: "hesitation" };
  }
  if (forcedLine) {
    return { content: line(forcedLine, language), type: "telegram" };
  }
  if (asksSensitiveInfo(normalized)) {
    return { content: line("sensitive_info_ack", language), type: "sensitive", cautiousFallback: true };
  }
  if (asksServiceIdentity(normalized)) {
    return { content: line("identity_ack", language), type: "identity" };
  }
  if (asksRegistrationFieldQuestion(normalized)) {
    return { content: registrationFieldQuestionReply(language, normalized), type: "registration_field" };
  }
  if (step === "wait_registration" && asksToAnswerPreviousQuestion(normalized)) {
    return { content: line("registration_question_retry_ack", language), type: "registration_field" };
  }
  if (asksWhyPhone(normalized)) {
    return { content: line("phone_reason_ack", language), type: "phone_reason" };
  }
  if (reportsLinkLoadFailure(normalized)) {
    return { content: line("link_load_failure_ack", language), type: "link_open" };
  }
  if (asksHowToOpenLink(normalized)) {
    return { content: line("link_open_ack", language), type: "link_open" };
  }
  if (asksNextStep(normalized)) {
    return { content: line("next_step_ack", language), type: "next_step" };
  }
  if (asksAboutPlatform(normalized)) {
    return { content: line("platform_explain", language), type: "platform" };
  }
  if (asksToChat(normalized)) {
    return { content: line("chat_ack", language), type: "chat" };
  }
  if (intent === "trust_concern" || asksTrustConcern(normalized)) {
    return { content: line("trust_ack", language), type: "trust" };
  }
  if (intent === "investment_concern" || asksInvestmentConcern(normalized)) {
    return { content: line("investment_concern_ack", language), type: "investment" };
  }
  if (intent === "payment_concern" || asksPaymentConcern(normalized)) {
    return { content: line("payment_concern_ack", language), type: "payment" };
  }
  if (intent === "telegram_explain" || asksTelegramExplanation(normalized)) {
    const key = asksWhyTelegramRequired(normalized)
      ? "telegram_required_ack"
      : asksWhetherTelegramOptional(normalized)
        ? "telegram_optional_ack"
        : input.conversation.extractedPhone || input.analysis.phone
          ? "telegram_purpose_after_phone_ack"
          : "telegram_explain_ack";
    return { content: line(key, language), type: "telegram" };
  }
  if (asksEarningConcern(normalized)) {
    return { content: line("earning_concern_ack", language), type: "earning" };
  }
  if (intent === "complaint" || complainsAboutReply(normalized)) {
    return { content: line("complaint_ack", language), type: "complaint" };
  }
  if (intent === "workflow_question" || intent === "need_help" || asksForOperationHelp(normalized)) {
    return { content: helpLineForStep(step, language, line), type: "help" };
  }
  if (intent === "job_question" || asksAboutJob(normalized)) {
    return { content: line("project_intro", language), type: "job" };
  }
  if (isRepeatGreeting(normalized) && step !== "interest_screening") {
    return { content: line("repeat_greeting", language), type: "repeat_greeting" };
  }
  if (isHesitant(normalized)) {
    return { content: line("hesitation_ack", language), type: "hesitation" };
  }
  if (looksLikeQuestion(normalized)) {
    return { content: line("unknown_question_ack", language), type: "unknown", cautiousFallback: true };
  }
  return null;
}

export function flowBridgeLine(step: StrictFlowStep, language: string, line: StrictFlowLineResolver): string {
  if (step === "interest_screening") return line("bridge_interest", language);
  if (step === "registration_intent") return line("bridge_registration_intent", language);
  if (step === "wait_registration") return line("bridge_wait_registration", language);
  if (step === "telegram_confirm") return line("bridge_telegram_confirm", language);
  if (step === "telegram_download" || step === "collect_telegram") return line("bridge_collect_telegram", language);
  return "";
}

export function registrationFieldQuestionReply(language: string, text: string): string {
  const asksUsername = /(用户名|用户名称|username|姓名|名字|真名|真实.*名字|nombre|usuario)/i.test(text);
  const asksPhone = /(手机号|手机号码|电话号码|電話號碼|phone|number|telefone|tel[eé]fono|celular|n[uú]mero)/i.test(text);
  const asksPassword = /(密码|密碼|password|senha|contraseñ?a)/i.test(text);
  const asksEmail = /(邮箱|郵箱|email|e-mail|correo)/i.test(text);
  const asksInvite = /(邀请码|邀請碼|invite|invitation|convite|c[oó]digo.*invitaci[oó]n)/i.test(text);

  const zhParts: string[] = [];
  const enParts: string[] = [];
  const ptParts: string[] = [];
  const esParts: string[] = [];

  if (asksUsername) {
    zhParts.push("用户名一般按页面要求填写即可，不一定要写真实姓名；如果页面明确要求实名，就按页面提示来。");
    enParts.push("For the username, follow the page requirement. It usually does not have to be your real name unless the page clearly asks for real-name information.");
    ptParts.push("Para o nome de usuário, siga o que a página pede. Normalmente não precisa ser seu nome real, a menos que a página peça claramente dados reais.");
    esParts.push("Para el nombre de usuario, siga lo que pide la página. Normalmente no tiene que ser su nombre real, salvo que la página lo indique claramente.");
  }
  if (asksPhone) {
    zhParts.push("手机号建议填写您自己能正常使用的号码，因为后面要用它核对您刚注册的平台账号。");
    enParts.push("For the phone number, use a number you can actually use, because it will be used to match the platform account you just registered.");
    ptParts.push("Para o telefone, use um número que você realmente consegue usar, porque ele será usado para conferir a conta cadastrada.");
    esParts.push("Para el teléfono, use un número que pueda usar normalmente, porque después se usa para verificar la cuenta que acaba de registrar.");
  }
  if (asksPassword) {
    zhParts.push("密码您自己设置并保存好就行，不需要发给我。");
    enParts.push("Set and keep the password yourself. You do not need to send it to me.");
    ptParts.push("Defina a senha e guarde com você. Não precisa enviar a senha para mim.");
    esParts.push("La contraseña la configura y la guarda usted. No necesita enviármela.");
  }
  if (asksEmail) {
    zhParts.push("邮箱如果页面要求就填写您能正常使用的邮箱；页面没要求的话按页面提示跳过即可。");
    enParts.push("If the page asks for email, use one you can access. If it does not ask, just follow the page and skip it.");
    ptParts.push("Se a página pedir e-mail, use um e-mail que você consegue acessar. Se não pedir, siga a página e pule essa parte.");
    esParts.push("Si la página pide correo, use uno al que tenga acceso. Si no lo pide, siga la página y omítalo.");
  }
  if (asksInvite) {
    zhParts.push("邀请码填在页面显示邀请码的位置，使用我刚才发给您的那个邀请码。");
    enParts.push("Enter the invitation code in the invitation-code field on the page, using the code I sent you earlier.");
    ptParts.push("Digite o código de convite no campo de convite da página, usando o código que enviei antes.");
    esParts.push("Ingrese el código de invitación en el campo correspondiente de la página, usando el código que le envié antes.");
  }

  const fallbackZh = "这些注册字段按页面提示填写就可以；不确定的地方可以直接问我。";
  const fallbackEn = "For these registration fields, follow the page prompts. If anything is unclear, ask me directly.";
  const fallbackPt = "Para esses campos de cadastro, siga as instruções da página. Se algo não ficar claro, pode me perguntar.";
  const fallbackEs = "Para estos campos del registro, siga las indicaciones de la página. Si algo no queda claro, puede preguntarme.";
  const nextZh = "填好并提交后，把注册手机号发给我，我帮您继续核对下一步。";
  const nextEn = "After submitting the registration, send me the registered phone number and I will help with the next step.";
  const nextPt = "Depois de enviar o cadastro, envie o telefone usado no cadastro e eu ajudo na próxima etapa.";
  const nextEs = "Después de enviar el registro, mándeme el teléfono usado y le ayudo con el siguiente paso.";

  if (language === "en") return joinReplyParts(enParts.length ? enParts.join(" ") : fallbackEn, nextEn, language);
  if (language === "pt-BR") return joinReplyParts(ptParts.length ? ptParts.join(" ") : fallbackPt, nextPt, language);
  if (language === "es") return joinReplyParts(esParts.length ? esParts.join(" ") : fallbackEs, nextEs, language);
  return joinReplyParts(zhParts.length ? zhParts.join("") : fallbackZh, nextZh, language);
}

function helpLineForStep(step: StrictFlowStep | "", language: string, line: StrictFlowLineResolver): string {
  if (step === "telegram_confirm" || step === "telegram_download" || step === "collect_telegram") {
    return line("telegram_help_ack", language);
  }
  if (step === "wait_registration" || step === "send_register_link" || step === "registration_intent") {
    return step === "registration_intent"
      ? line("registration_help_before_ready", language)
      : line("registration_help_ack", language);
  }
  return line("general_help_ack", language);
}
