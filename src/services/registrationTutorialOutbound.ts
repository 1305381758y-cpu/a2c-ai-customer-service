import type { A2CClient } from "../clients/a2c.js";
import type { AppConfig } from "../config.js";
import type { Conversation, Repositories } from "../repositories.js";
import type { A2CWebhookPayload } from "./inboundMessage.js";
import { recordOutboundConversationMessage } from "./outboundConversationRecorder.js";

export async function sendRegistrationTutorialImage(input: {
  repos: Repositories;
  runtimeConfig: AppConfig;
  a2c: A2CClient;
  conversation: Conversation;
  data: A2CWebhookPayload["data"];
  language: string;
  tutorialImageUrl: string;
  simulation: boolean;
}): Promise<void> {
  if (!input.tutorialImageUrl) return;
  const caption = registrationTutorialCaption(input.language);
  await recordOutboundConversationMessage({
    repos: input.repos,
    runtimeConfig: input.runtimeConfig,
    a2c: input.a2c,
    conversation: input.conversation,
    simulation: input.simulation,
    payload: {
      to: input.data.from,
      senderPhoneNumber: input.data.to,
      type: "image",
      url: input.tutorialImageUrl,
      caption,
      fileName: "registration-tutorial.jpg"
    },
    idPolicy: {
      simulatedPrefix: "simulated_tutorial",
      sentFallbackPrefix: "tutorial_image",
      failedPrefix: "tutorial_image_failed",
      contextId: input.data.messageId || `${Date.now()}`
    },
    message: {
      content: caption,
      msgType: "image",
      language: input.language,
      intent: "unknown",
      rawPayload: {
        replyMode: "strict_flow",
        strictFlow: true,
        strictFlowStep: input.conversation.flowStep || "wait_registration",
        registrationTutorialImage: true,
        mediaUrl: input.tutorialImageUrl,
        caption
      }
    }
  });
}

export function registrationTutorialCaption(language: string): string {
  if (language === "en") return "Here is the registration tutorial image. Follow it step by step, and send me the registered phone number after you finish.";
  if (language === "es") return "Esta es la imagen del tutorial de registro. Siga los pasos de la imagen y, al terminar, envíeme el número de teléfono usado en el registro.";
  if (language === "pt-BR") return "Esta é a imagem do tutorial de cadastro. Siga passo a passo e, quando terminar, envie o telefone usado no cadastro.";
  return "这是注册教程图片。您按图片步骤操作，完成后把注册手机号发给我就可以。";
}
