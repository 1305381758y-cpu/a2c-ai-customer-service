import type { StrictFlowInput } from "./strictFlowTypes.js";
import { joinReplyParts } from "./strictFlowReplyText.js";
import { activeScriptStep, applyScriptVariables, inviteDisplayText } from "./strictFlowScriptRuntime.js";
import { strictFlowScriptLine } from "./strictFlowScriptText.js";

export function registerInstruction(input: StrictFlowInput, language: string, mode: "initial" | "help" = "initial"): string {
  const display = inviteDisplayText(input.inviteCode, language, input.country.platformRegisterUrl || input.config.PLATFORM_REGISTER_URL);
  const customStep = activeScriptStep(input, "wait_registration") || activeScriptStep(input, "registration_intent");
  if (customStep?.standardReply) {
    const withVariables = applyScriptVariables(customStep.standardReply, input, language, display);
    if (customStep.sendLink || customStep.sendInvite) {
      return withVariables.includes(display) || withVariables.includes(input.inviteCode?.code || "__missing_code__")
        ? withVariables
        : joinReplyParts(withVariables, display, language);
    }
    return withVariables;
  }
  if (!input.inviteCode) {
    return strictFlowScriptLine("missing_invite", language, display);
  }
  if (language === "en") {
    if (mode === "help") {
      return `Sure, I will send the registration steps clearly again${input.config.REGISTRATION_TUTORIAL_IMAGE_URL ? " together with the tutorial image" : ""}.\n${display}\nRegistration steps:\n1. Open the link in your browser.\n2. Fill in your phone number.\n3. Set your username and password.\n4. Enter the invitation code.\n5. Submit the registration.\nAfter registration is completed, send me the registered phone number.`;
    }
    return `Okay, I will send you the registration link and invitation code now.\n${display}\nRegistration steps:\n1. Open the link in your browser.\n2. Fill in your phone number.\n3. Set your username and password.\n4. Enter the invitation code.\n5. Submit the registration.\nAfter registration is completed, please tell me.`;
  }
  if (language === "pt-BR") {
    if (mode === "help") {
      return `Claro, vou enviar os passos do cadastro novamente${input.config.REGISTRATION_TUTORIAL_IMAGE_URL ? " junto com a imagem do tutorial" : ""}.\n${display}\nPassos do cadastro:\n1. Abra o link no navegador.\n2. Preencha seu número de telefone.\n3. Defina seu nome de usuário e sua senha.\n4. Insira o código de convite.\n5. Envie o cadastro.\nDepois de concluir, envie o telefone usado no cadastro.`;
    }
    return `Certo, vou enviar agora o link de cadastro e o código de convite.\n${display}\nPassos do cadastro:\n1. Abra o link no navegador.\n2. Preencha seu número de telefone.\n3. Defina seu nome de usuário e sua senha.\n4. Insira o código de convite.\n5. Envie o cadastro.\nDepois de concluir o cadastro, me avise.`;
  }
  if (mode === "help") {
    return `可以，我把注册步骤给您列清楚${input.config.REGISTRATION_TUTORIAL_IMAGE_URL ? "，教程图片也会一起发您" : ""}。\n${display}\n注册步骤：\n1. 在浏览器中打开链接。\n2. 填写手机号码。\n3. 设置用户名和密码。\n4. 输入邀请码。\n5. 提交注册。\n完成后把注册手机号发给我就可以。`;
  }
  return `好的，现在我会把链接和邀请码发给您。\n${display}\n注册步骤：\n1. 在浏览器中打开链接。\n2. 填写手机号码。\n3. 设置用户名和密码。\n4. 输入邀请码。\n5. 提交注册。\n完成注册后请告诉我。`;
}

export function registrationStartInstruction(input: StrictFlowInput, language: string): string {
  const instruction = registerInstruction(input, language);
  if (language === "en") return `Okay, let's start with the first step. Please open the link first, and I will guide you step by step.\n${instruction}`;
  if (language === "pt-BR") return `Certo, vamos começar pelo primeiro passo. Abra primeiro o link, e eu vou orientar você etapa por etapa.\n${instruction}`;
  return `好的，我们先从第一步开始。您先打开下面这个链接，我一步步带您操作。\n${instruction}`;
}
