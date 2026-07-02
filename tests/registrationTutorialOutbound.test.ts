import { describe, expect, it, vi } from "vitest";
import type { A2CClient } from "../src/clients/a2c.js";
import { loadConfig } from "../src/config.js";
import { openDb } from "../src/db.js";
import { Repositories } from "../src/repositories.js";
import { registrationTutorialCaption, sendRegistrationTutorialImage } from "../src/services/registrationTutorialOutbound.js";

function setup() {
  const repos = new Repositories(openDb(":memory:"));
  const merchant = repos.createMerchant("教程图片商户");
  const country = repos.createMerchantCountry(merchant.id, {
    name: "巴西",
    defaultLanguage: "zh",
    platformRegisterUrl: "https://register.example",
    requirePlatformAccount: true,
    requirePhone: true,
    requireTelegram: true
  });
  const conversation = repos.getOrCreateConversation("customer-1", "agent-1", "客户", merchant.id, country.id);
  conversation.language = "zh";
  conversation.flowStep = "wait_registration";
  repos.updateConversation(conversation);
  return { repos, conversation };
}

describe("registration tutorial outbound module", () => {
  it("records tutorial image in simulation without calling A2C", async () => {
    const { repos, conversation } = setup();
    const a2c = { sendMessage: vi.fn(async () => "real-message-id") } as unknown as A2CClient;

    await sendRegistrationTutorialImage({
      repos,
      runtimeConfig: loadConfig({ A2C_BASE_URL: "https://a2c.test" }),
      a2c,
      conversation,
      data: {
        messageId: "customer-message-1",
        content: "我不会注册",
        from: "customer-1",
        to: "agent-1",
        msgType: "text",
        timestamp: 1783010000
      },
      language: "zh",
      tutorialImageUrl: "https://cdn.example/tutorial.jpg",
      simulation: true
    });

    expect(a2c.sendMessage).not.toHaveBeenCalled();
    const outbound = repos.listConversationMessages(conversation.id, 10).find((message) => message.msgType === "image");
    expect(outbound?.content).toBe("这是注册教程图片。您按图片步骤操作，完成后把注册手机号发给我就可以。");
    expect(outbound?.rawPayload).toMatchObject({
      registrationTutorialImage: true,
      mediaUrl: "https://cdn.example/tutorial.jpg",
      a2cSendStatus: "simulated"
    });
  });

  it("uses localized captions for supported languages", () => {
    expect(registrationTutorialCaption("en")).toContain("registration tutorial image");
    expect(registrationTutorialCaption("pt-BR")).toContain("tutorial de cadastro");
    expect(registrationTutorialCaption("es")).toContain("这是注册教程图片");
  });
});
